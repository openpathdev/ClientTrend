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
import { html } from "hono/html";
import { listCampaignGroups, listCampaignsByGroup, listCampaignDataValues, syncCampaignRows } from "./data/campaigns";
import {
	renderAddCampaignGroupButton,
	renderCampaignGroupTitle,
	renderCampaignsEmpty,
	renderCampaignsOff,
	renderCampaignsToggle,
} from "./render/campaignsSection";
import { renderEditableTitle } from "./render/editableTitle";

export const DEFAULT_PAID_ADS_TITLE = "Paid Ads";

/** The Paid Ads heading — CSMs can rename it per client; blank goes back to "Paid Ads". */
export function renderPaidAdsTitle(client: ClientRow, error?: string) {
	return renderEditableTitle({
		value: client.paidAdsTitle ?? "",
		fallback: DEFAULT_PAID_ADS_TITLE,
		fallbackIsDefault: true,
		endpoint: `/api/clients/${client.id}/paid-ads/title`,
		ariaLabel: "Paid Ads title",
		error,
	});
}

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
	notice?: Parameters<typeof renderMonthlyDataTable>[0]["notice"],
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
		notice,
	}).toString();
}

export async function renderPaidAdsSection(
	supabase: SupabaseClient,
	client: ClientRow,
	statuses: Status[],
	monthCount: number,
	previousMonthCount?: number,
	notice?: Parameters<typeof renderMonthlyDataTable>[0]["notice"],
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
		title: renderPaidAdsTitle(client),
		metrics,
		months,
		values,
		statuses,
		comments,
		headerExtra: await renderPaidAdsSettings(client),
		previousMonthCount,
		notice,
	}).toString();
}

/**
 * Per-client Campaigns — one or more campaigns, each its own table with a
 * CSM-editable title and a blank copy of the Paid Ads rows. Only queried and
 * drawn while the client has Campaigns switched on. All campaigns sit in one
 * `#campaigns-section` wrapper and share one month window, so "Load earlier
 * months" and every campaign-level change re-render them together.
 */
export async function renderCampaignsSection(
	supabase: SupabaseClient,
	client: ClientRow,
	statuses: Status[],
	monthCount: number,
	previousMonthCount?: number,
	notice?: Parameters<typeof renderMonthlyDataTable>[0]["notice"],
): Promise<string> {
	if (!client.campaignsEnabled) return renderCampaignsOff(client.id, monthCount).toString();
	const months = trailingMonths(monthCount);
	await syncCampaignRows(supabase, client.id);
	const [groups, campaignsByGroup, values, comments] = await Promise.all([
		listCampaignGroups(supabase, client.id),
		listCampaignsByGroup(supabase, client.id),
		listCampaignDataValues(supabase, client.id, months[0], months[months.length - 1]),
		listCommentsForRange(supabase, client.id, "campaigns", months[0], months[months.length - 1]),
	]);
	const tables = groups.map((group, i) =>
		renderMonthlyDataTable({
			clientId: client.id,
			section: "campaigns",
			domId: `campaign-group-${group.id}`,
			reloadTarget: "#campaigns-section",
			title: renderCampaignGroupTitle(client.id, group, monthCount),
			metrics: campaignsByGroup.get(group.id) ?? [],
			months,
			values,
			statuses,
			comments,
			// The on/off switch covers every campaign, so it sits on the first one only.
			headerExtra: i === 0 ? renderCampaignsToggle(client.id, true, monthCount) : undefined,
			previousMonthCount,
		}),
	);
	return html`<div id="campaigns-section" class="flex flex-col gap-4">
		${notice ?? ""}
		${groups.length > 0 ? tables : renderCampaignsEmpty(client.id, monthCount)}
		${renderAddCampaignGroupButton(client.id, monthCount)}
	</div>`.toString();
}
