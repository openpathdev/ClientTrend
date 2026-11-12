import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlyDataValue, MonthlyMetric } from "./types";
import { listPaidAdsMetrics } from "./paidAdsMetrics";

/**
 * Per-client Campaigns (see the campaigns migrations). Each campaign is a
 * section (`campaign_groups`) holding a blank copy of the Paid Ads table:
 * one `client_campaigns` row per active Paid Ads metric. Rows are returned
 * in the same `MonthlyMetric` shape the catalog sections use — label, value
 * type and order from the Paid Ads metric, but the id is the
 * client_campaigns row id — and cells as `MonthlyDataValue` with that row
 * id in `metricId`. That lets the shared grid renderer, cell routes,
 * comments and spreadsheet paste work on Campaigns unchanged, with every
 * cell unique to its campaign.
 */

export const CAMPAIGN_NAME_MAX = 200;

type CampaignRow = { id: string; group_id: string; metric_id: string };

/** A campaign's copy of one Paid Ads row. Always manual — nothing fills campaign cells automatically. */
export function campaignToMetric(rowId: string, metric: MonthlyMetric): MonthlyMetric {
	return { ...metric, id: rowId, key: rowId, source: "manual" };
}

/** The (section, Paid Ads metric) pairs that don't have a row yet — new sections, or a metric added to Paid Ads later. */
export function missingCampaignRows(groupIds: string[], rows: { group_id: string; metric_id: string }[], metricIds: string[]): { group_id: string; metric_id: string }[] {
	const have = new Set(rows.map((r) => `${r.group_id}|${r.metric_id}`));
	return groupIds.flatMap((groupId) => metricIds.filter((metricId) => !have.has(`${groupId}|${metricId}`)).map((metricId) => ({ group_id: groupId, metric_id: metricId })));
}

/**
 * Trimmed name, or an error if it's too long. Blank is allowed — the
 * campaign shows as "Untitled campaign". Also used for the Paid Ads title
 * (same 200-character limit), with `label` naming the field in the error.
 */
export function parseCampaignName(raw: string, label = "Campaign name"): { ok: true; name: string } | { ok: false; error: string } {
	const name = raw.trim();
	if (name.length > CAMPAIGN_NAME_MAX) return { ok: false, error: `${label} must be ${CAMPAIGN_NAME_MAX} characters or fewer.` };
	return { ok: true, name };
}

export type CampaignGroup = { id: string; name: string; sortOrder: number };

/** The client's campaigns (each its own table under Paid Ads), in display order. */
export async function listCampaignGroups(supabase: SupabaseClient, clientId: string): Promise<CampaignGroup[]> {
	const { data, error } = await supabase
		.from("campaign_groups")
		.select("id, name, sort_order")
		.eq("client_id", clientId)
		.order("sort_order")
		.order("created_at");
	if (error) throw new Error(error.message);
	return (data as { id: string; name: string; sort_order: number }[]).map((g) => ({ id: g.id, name: g.name, sortOrder: g.sort_order }));
}

async function selectCampaignRows(supabase: SupabaseClient, clientId: string): Promise<CampaignRow[]> {
	const { data, error } = await supabase.from("client_campaigns").select("id, group_id, metric_id").eq("client_id", clientId).not("metric_id", "is", null);
	if (error) throw new Error(error.message);
	return data as CampaignRow[];
}

/**
 * Every campaign row the client has, each with its section id, in Paid Ads
 * order. Rows whose Paid Ads metric has been deactivated are left out, the
 * same as on the Paid Ads table.
 */
async function listCampaignRows(supabase: SupabaseClient, clientId: string): Promise<{ groupId: string; metric: MonthlyMetric }[]> {
	const [rows, metrics] = await Promise.all([selectCampaignRows(supabase, clientId), listPaidAdsMetrics(supabase)]);
	const metricsById = new Map(metrics.map((m) => [m.id, m]));
	return rows
		.flatMap((row) => {
			const metric = metricsById.get(row.metric_id);
			return metric ? [{ groupId: row.group_id, metric: campaignToMetric(row.id, metric) }] : [];
		})
		.sort((a, b) => a.metric.sortOrder - b.metric.sortOrder);
}

/** Every campaign row the client has, across all its campaigns. */
export async function listCampaigns(supabase: SupabaseClient, clientId: string): Promise<MonthlyMetric[]> {
	return (await listCampaignRows(supabase, clientId)).map((r) => r.metric);
}

/** Campaign rows keyed by campaign (section) id. */
export async function listCampaignsByGroup(supabase: SupabaseClient, clientId: string): Promise<Map<string, MonthlyMetric[]>> {
	const byGroup = new Map<string, MonthlyMetric[]>();
	for (const { groupId, metric } of await listCampaignRows(supabase, clientId)) {
		const list = byGroup.get(groupId) ?? [];
		list.push(metric);
		byGroup.set(groupId, list);
	}
	return byGroup;
}

/** The rows of the campaign `rowId` is in — a spreadsheet paste stays inside that campaign's table. */
export async function listCampaignsInGroupOf(supabase: SupabaseClient, clientId: string, rowId: string): Promise<MonthlyMetric[]> {
	const rows = await listCampaignRows(supabase, clientId);
	const groupId = rows.find((r) => r.metric.id === rowId)?.groupId;
	return rows.filter((r) => r.groupId === groupId).map((r) => r.metric);
}

/**
 * Gives every one of the client's campaigns a row for every active Paid Ads
 * metric — called before drawing, so a metric added to Paid Ads later shows
 * up in existing campaigns too. Only writes when something is missing.
 */
export async function syncCampaignRows(supabase: SupabaseClient, clientId: string, createdBy = "system"): Promise<void> {
	const [groups, rows, metrics] = await Promise.all([listCampaignGroups(supabase, clientId), selectCampaignRows(supabase, clientId), listPaidAdsMetrics(supabase)]);
	const missing = missingCampaignRows(
		groups.map((g) => g.id),
		rows,
		metrics.map((m) => m.id),
	);
	if (missing.length === 0) return;
	const { error } = await supabase.from("client_campaigns").upsert(
		missing.map((m) => ({ client_id: clientId, group_id: m.group_id, metric_id: m.metric_id, name: "", sort_order: 0, created_by: createdBy })),
		{ onConflict: "group_id,metric_id", ignoreDuplicates: true },
	);
	if (error) throw new Error(error.message);
}

/** Adds a blank campaign (a copy of the Paid Ads rows) after the client's existing ones. */
export async function createCampaignGroup(supabase: SupabaseClient, clientId: string, name: string, createdBy: string): Promise<void> {
	const existing = await listCampaignGroups(supabase, clientId);
	const sortOrder = existing.reduce((max, g) => Math.max(max, g.sortOrder), 0) + 1;
	const { error } = await supabase.from("campaign_groups").insert({ client_id: clientId, name, sort_order: sortOrder, created_by: createdBy });
	if (error) throw new Error(error.message);
	await syncCampaignRows(supabase, clientId, createdBy);
}

/** Returns the renamed campaign, or null if it doesn't belong to this client. */
export async function renameCampaignGroup(supabase: SupabaseClient, clientId: string, groupId: string, name: string): Promise<CampaignGroup | null> {
	const { data, error } = await supabase
		.from("campaign_groups")
		.update({ name })
		.eq("id", groupId)
		.eq("client_id", clientId)
		.select("id, name, sort_order")
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;
	const row = data as { id: string; name: string; sort_order: number };
	return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

/** Deletes the campaign — its rows and their values cascade — plus those rows' cell comments, which have no FK. */
export async function deleteCampaignGroup(supabase: SupabaseClient, clientId: string, groupId: string): Promise<void> {
	const { data, error: listError } = await supabase.from("client_campaigns").select("id").eq("client_id", clientId).eq("group_id", groupId);
	if (listError) throw new Error(listError.message);
	const rowIds = (data as { id: string }[]).map((r) => r.id);
	if (rowIds.length > 0) {
		const { error: commentsError } = await supabase.from("comments").delete().eq("client_id", clientId).eq("section", "campaigns").in("metric_id", rowIds);
		if (commentsError) throw new Error(commentsError.message);
	}
	const { error } = await supabase.from("campaign_groups").delete().eq("id", groupId).eq("client_id", clientId);
	if (error) throw new Error(error.message);
}

export async function setCampaignsEnabled(supabase: SupabaseClient, clientId: string, enabled: boolean): Promise<void> {
	const { error } = await supabase.from("clients").update({ campaigns_enabled: enabled }).eq("id", clientId);
	if (error) throw new Error(error.message);
}

// ---- Cells — mirror monthlyData.ts, with campaign_id standing in for metric_id ----

type ValueRow = {
	id: string;
	client_id: string;
	campaign_id: string;
	month: string;
	value: number | null;
	value_text: string | null;
	status_id: string | null;
	updated_by: string | null;
	updated_at: string;
};

function mapValue(row: ValueRow): MonthlyDataValue {
	return {
		id: row.id,
		clientId: row.client_id,
		metricId: row.campaign_id,
		month: row.month,
		value: row.value,
		valueText: row.value_text,
		statusId: row.status_id,
		updatedBy: row.updated_by,
		updatedAt: row.updated_at,
	};
}

const CONFLICT = "client_id,campaign_id,month";

export async function listCampaignDataValues(supabase: SupabaseClient, clientId: string, startMonth: string, endMonth: string): Promise<MonthlyDataValue[]> {
	const { data, error } = await supabase
		.from("campaign_data_values")
		.select("*")
		.eq("client_id", clientId)
		.gte("month", startMonth)
		.lte("month", endMonth);
	if (error) throw new Error(error.message);
	return (data as ValueRow[]).map(mapValue);
}

export async function getCampaignDataValue(supabase: SupabaseClient, clientId: string, campaignId: string, month: string): Promise<MonthlyDataValue | null> {
	const { data, error } = await supabase
		.from("campaign_data_values")
		.select("*")
		.eq("client_id", clientId)
		.eq("campaign_id", campaignId)
		.eq("month", month)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? mapValue(data as ValueRow) : null;
}

export async function upsertCampaignDataValue(
	supabase: SupabaseClient,
	input: { clientId: string; metricId: string; month: string; value: number | null; valueText: string | null; updatedBy: string },
): Promise<MonthlyDataValue> {
	const { data, error } = await supabase
		.from("campaign_data_values")
		.upsert(
			{ client_id: input.clientId, campaign_id: input.metricId, month: input.month, value: input.value, value_text: input.valueText, updated_by: input.updatedBy },
			{ onConflict: CONFLICT },
		)
		.select()
		.single();
	if (error) throw new Error(error.message);
	return mapValue(data as ValueRow);
}

export async function bulkUpsertCampaignDataValues(
	supabase: SupabaseClient,
	rows: { clientId: string; metricId: string; month: string; value: number | null; valueText: string | null; updatedBy: string }[],
): Promise<void> {
	if (rows.length === 0) return;
	const { error } = await supabase.from("campaign_data_values").upsert(
		rows.map((r) => ({ client_id: r.clientId, campaign_id: r.metricId, month: r.month, value: r.value, value_text: r.valueText, updated_by: r.updatedBy })),
		{ onConflict: CONFLICT },
	);
	if (error) throw new Error(error.message);
}

export async function setCampaignDataValueStatus(
	supabase: SupabaseClient,
	input: { clientId: string; metricId: string; month: string; statusId: string | null },
): Promise<MonthlyDataValue> {
	const { data, error } = await supabase
		.from("campaign_data_values")
		.upsert({ client_id: input.clientId, campaign_id: input.metricId, month: input.month, status_id: input.statusId }, { onConflict: CONFLICT })
		.select()
		.single();
	if (error) throw new Error(error.message);
	return mapValue(data as ValueRow);
}
