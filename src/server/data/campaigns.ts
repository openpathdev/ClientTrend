import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlyDataValue, MonthlyMetric } from "./types";

/**
 * Per-client "Campaigns" rows and their monthly values (see the campaigns
 * migration). Rows are returned in the same `MonthlyMetric` shape the
 * catalog sections use, and cells as `MonthlyDataValue` with the campaign
 * id in `metricId`. That lets the shared grid renderer, cell routes,
 * comments and spreadsheet paste work on Campaigns unchanged.
 */

export const CAMPAIGN_NAME_MAX = 200;
/** Blank rows created the first time a client's Campaigns table is switched on. */
export const STARTER_CAMPAIGN_COUNT = 3;

type CampaignRow = { id: string; name: string; sort_order: number };

export function campaignToMetric(row: CampaignRow): MonthlyMetric {
	return {
		id: row.id,
		key: row.id,
		label: row.name,
		valueType: "text",
		minValue: null,
		maxValue: null,
		source: "manual",
		groupLabel: null,
		sortOrder: row.sort_order,
		active: true,
	};
}

/** Trimmed name, or an error if it's too long. Blank is allowed — the row shows as "Untitled campaign". */
export function parseCampaignName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
	const name = raw.trim();
	if (name.length > CAMPAIGN_NAME_MAX) return { ok: false, error: `Campaign name must be ${CAMPAIGN_NAME_MAX} characters or fewer.` };
	return { ok: true, name };
}

export async function listCampaigns(supabase: SupabaseClient, clientId: string): Promise<MonthlyMetric[]> {
	const { data, error } = await supabase
		.from("client_campaigns")
		.select("id, name, sort_order")
		.eq("client_id", clientId)
		.order("sort_order")
		.order("created_at");
	if (error) throw new Error(error.message);
	return (data as CampaignRow[]).map(campaignToMetric);
}

/** Appends `count` blank rows after the client's existing campaigns. */
export async function createCampaigns(supabase: SupabaseClient, clientId: string, count: number, createdBy: string): Promise<void> {
	const existing = await listCampaigns(supabase, clientId);
	const nextOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;
	const rows = Array.from({ length: count }, (_, i) => ({ client_id: clientId, name: "", sort_order: nextOrder + i, created_by: createdBy }));
	const { error } = await supabase.from("client_campaigns").insert(rows);
	if (error) throw new Error(error.message);
}

/** Returns the renamed row, or null if it doesn't belong to this client. */
export async function renameCampaign(supabase: SupabaseClient, clientId: string, campaignId: string, name: string): Promise<MonthlyMetric | null> {
	const { data, error } = await supabase
		.from("client_campaigns")
		.update({ name })
		.eq("id", campaignId)
		.eq("client_id", clientId)
		.select("id, name, sort_order")
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? campaignToMetric(data as CampaignRow) : null;
}

/** Deletes the row (its values cascade) and its cell comments, which have no FK to cascade from. */
export async function deleteCampaign(supabase: SupabaseClient, clientId: string, campaignId: string): Promise<void> {
	const { error: commentsError } = await supabase
		.from("comments")
		.delete()
		.eq("client_id", clientId)
		.eq("section", "campaigns")
		.eq("metric_id", campaignId);
	if (commentsError) throw new Error(commentsError.message);
	const { error } = await supabase.from("client_campaigns").delete().eq("id", campaignId).eq("client_id", clientId);
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
