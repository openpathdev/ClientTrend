import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRow, Status } from "./data/types";
import { trailingMonths } from "./months";
import { listMonthlyMetrics } from "./data/monthlyMetrics";
import { listMonthlyDataValues } from "./data/monthlyData";
import { listPaidAdsMetrics } from "./data/paidAdsMetrics";
import { listPaidAdsDataValues } from "./data/paidAdsData";
import { listCommentsForRange } from "./data/comments";
import { renderMonthlyDataTable } from "./render/monthlyDataTable";
import { renderPaidAdsSettings } from "./render/paidAdsSettings";

/**
 * Fetch-then-render orchestration for the Monthly Data / Paid Ads sections
 * of the client detail page (PRD §10/§20) — shared between the initial
 * Astro page load and the "load earlier months" HTMX routes in app.ts, so
 * this sequence lives in exactly one place. Deliberately NOT under
 * `render/` — every file there only imports `../data/types` and never
 * touches Supabase directly; this file is the orchestration layer that
 * calls both `data/*` and `render/*`, same role `syncHubspot.ts` plays for
 * the HubSpot sync job.
 *
 * `statuses` is a caller-supplied param rather than fetched internally,
 * matching every existing mutation route in app.ts (each does its own
 * fresh, small `listStatuses` call per request rather than threading a
 * cache through) — it's a tiny lookup table, so refetching it is cheap.
 *
 * `previousMonthCount`, when set, means this call is a "load earlier
 * months" reload rather than the initial page render — see
 * `renderMonthlyDataTable`'s doc comment for how it's used to keep the
 * table scrolled to a sensible position after the swap.
 */
export async function renderMonthlyDataSection(
	supabase: SupabaseClient,
	client: ClientRow,
	statuses: Status[],
	monthCount: number,
	previousMonthCount?: number,
): Promise<string> {
	const months = trailingMonths(monthCount);
	const [metrics, values, comments] = await Promise.all([
		listMonthlyMetrics(supabase),
		listMonthlyDataValues(supabase, client.id, months[0], months[months.length - 1]),
		listCommentsForRange(supabase, client.id, "monthly_data", months[0], months[months.length - 1]),
	]);
	return renderMonthlyDataTable({
		clientId: client.id,
		section: "monthly_data",
		title: "Performance",
		metrics,
		months,
		values,
		statuses,
		comments,
		previousMonthCount,
	}).toString();
}

export async function renderPaidAdsSection(
	supabase: SupabaseClient,
	client: ClientRow,
	statuses: Status[],
	monthCount: number,
	previousMonthCount?: number,
): Promise<string> {
	const months = trailingMonths(monthCount);
	const [metrics, values, comments] = await Promise.all([
		listPaidAdsMetrics(supabase),
		listPaidAdsDataValues(supabase, client.id, months[0], months[months.length - 1]),
		listCommentsForRange(supabase, client.id, "paid_ads", months[0], months[months.length - 1]),
	]);
	return renderMonthlyDataTable({
		clientId: client.id,
		section: "paid_ads",
		title: "Paid Ads",
		metrics,
		months,
		values,
		statuses,
		comments,
		headerExtra: await renderPaidAdsSettings(client),
		previousMonthCount,
	}).toString();
}
