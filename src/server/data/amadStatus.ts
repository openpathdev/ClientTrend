import type { SupabaseClient } from "@supabase/supabase-js";
import { AMAD_RULE_METRIC_KEY, AMAD_RULE_STATUS_NAMES, evaluateAmadRule, type AmadRuleOutcome } from "../amadStatusRule";
import { addMonths, trailingMonths } from "../months";

/** How far back to look for 3 months with an AM/AD value. */
const LOOKBACK_MONTHS = 24;

/**
 * Most client updates one all-clients pass makes. Cloudflare allows ~50
 * subrequests per Worker invocation and each update is one; the reads take
 * ~5 more. The first pass after this shipped wrote 37 rows in one go and
 * starved the HubSpot sync sharing that invocation (2026-11-04), so the
 * pass now runs in its own invocation(s) and stops at this cap.
 */
const MAX_WRITES_PER_PASS = 35;

type ClientInput = { id: string; status_id: string; baseline_amad: number | null; amad_rule_signature: string | null };
type ValueInput = { client_id: string; month: string; value: number | null; value_text: string | null };

async function loadRuleContext(supabase: SupabaseClient) {
	const [metricRes, statusRes] = await Promise.all([
		supabase.from("monthly_metrics").select("id").eq("key", AMAD_RULE_METRIC_KEY).maybeSingle(),
		supabase.from("statuses").select("id, name").eq("active", true),
	]);
	if (metricRes.error) throw new Error(metricRes.error.message);
	if (statusRes.error) throw new Error(statusRes.error.message);
	const statusIdByName = new Map((statusRes.data as { id: string; name: string }[]).map((s) => [s.name.toLowerCase(), s.id]));
	const statusIdFor: Record<Exclude<AmadRuleOutcome, null>, string | undefined> = {
		watch: statusIdByName.get(AMAD_RULE_STATUS_NAMES.watch.toLowerCase()),
		needs_attention: statusIdByName.get(AMAD_RULE_STATUS_NAMES.needsAttention.toLowerCase()),
	};
	const currentMonth = trailingMonths(1)[0];
	return { metricId: (metricRes.data as { id: string } | null)?.id ?? null, statusIdFor, currentMonth, startMonth: addMonths(currentMonth, -LOOKBACK_MONTHS) };
}

/**
 * Runs the rule for the given clients and writes any change. A client is
 * only touched when the rule's inputs differ from the last ones it acted on
 * (see `amad_rule_signature`); the status changes only when the rule says
 * Watch or Needs attention. Returns the ids whose status changed.
 */
async function applyRule(
	supabase: SupabaseClient,
	clients: ClientInput[],
	values: ValueInput[],
	ctx: Awaited<ReturnType<typeof loadRuleContext>>,
	maxWrites = Infinity,
): Promise<{ changed: string[]; more: boolean }> {
	const valuesByClient = new Map<string, ValueInput[]>();
	for (const v of values) {
		const list = valuesByClient.get(v.client_id) ?? [];
		list.push(v);
		valuesByClient.set(v.client_id, list);
	}

	const changed: string[] = [];
	let writes = 0;
	for (const client of clients) {
		const result = evaluateAmadRule({
			values: (valuesByClient.get(client.id) ?? []).map((v) => ({ month: v.month, value: v.value, valueText: v.value_text })),
			baseline: client.baseline_amad,
			currentMonth: ctx.currentMonth,
		});
		if (result.signature === client.amad_rule_signature) continue;
		if (writes >= maxWrites) return { changed, more: true };
		writes++;

		const statusId = result.outcome ? ctx.statusIdFor[result.outcome] : undefined;
		const update: { amad_rule_signature: string | null; status_id?: string } = { amad_rule_signature: result.signature };
		if (statusId && statusId !== client.status_id) update.status_id = statusId;

		const { error } = await supabase.from("clients").update(update).eq("id", client.id);
		if (error) throw new Error(error.message);
		if (update.status_id) changed.push(client.id);
	}
	return { changed, more: false };
}

/** Re-checks one client after its AM/AD values or baseline were edited. Returns true if its status changed. */
export async function applyAmadStatusRule(supabase: SupabaseClient, clientId: string): Promise<boolean> {
	const ctx = await loadRuleContext(supabase);
	if (!ctx.metricId) return false;
	const [clientRes, valuesRes] = await Promise.all([
		supabase.from("clients").select("id, status_id, baseline_amad, amad_rule_signature").eq("id", clientId).maybeSingle(),
		supabase
			.from("monthly_data_values")
			.select("client_id, month, value, value_text")
			.eq("client_id", clientId)
			.eq("metric_id", ctx.metricId)
			.gte("month", ctx.startMonth),
	]);
	if (clientRes.error) throw new Error(clientRes.error.message);
	if (valuesRes.error) throw new Error(valuesRes.error.message);
	if (!clientRes.data) return false;
	const { changed } = await applyRule(supabase, [clientRes.data as ClientInput], valuesRes.data as ValueInput[], ctx);
	return changed.length > 0;
}

/**
 * Re-checks every client — run daily as the first step of the HubSpot sync,
 * so a month rolling over (which changes the "last 3 completed months") is
 * picked up without an edit. Makes at most MAX_WRITES_PER_PASS updates;
 * `more: true` means call it again (already-updated clients are skipped
 * next time because their signature now matches).
 */
export async function applyAmadStatusRuleToAll(supabase: SupabaseClient): Promise<{ checked: number; changed: number; more: boolean }> {
	const ctx = await loadRuleContext(supabase);
	if (!ctx.metricId) return { checked: 0, changed: 0, more: false };
	const metricId = ctx.metricId;
	const [clientRes, values] = await Promise.all([
		supabase.from("clients").select("id, status_id, baseline_amad, amad_rule_signature"),
		(async () => {
			// PostgREST returns at most 1000 rows per request, so page through.
			const PAGE = 1000;
			const all: ValueInput[] = [];
			for (let from = 0; ; from += PAGE) {
				const { data, error } = await supabase
					.from("monthly_data_values")
					.select("client_id, month, value, value_text")
					.eq("metric_id", metricId)
					.gte("month", ctx.startMonth)
					.order("id")
					.range(from, from + PAGE - 1);
				if (error) throw new Error(error.message);
				all.push(...(data as ValueInput[]));
				if (data.length < PAGE) return all;
			}
		})(),
	]);
	if (clientRes.error) throw new Error(clientRes.error.message);
	const clients = clientRes.data as ClientInput[];
	const { changed, more } = await applyRule(supabase, clients, values, ctx, MAX_WRITES_PER_PASS);
	return { checked: clients.length, changed: changed.length, more };
}
