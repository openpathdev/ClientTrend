import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaidAdsDataValue } from "./types";

type ValueRow = {
	id: string;
	client_id: string;
	metric_id: string;
	month: string;
	value: number | null;
	value_text: string | null;
	updated_by: string | null;
	updated_at: string;
};

function mapValue(row: ValueRow): PaidAdsDataValue {
	return {
		id: row.id,
		clientId: row.client_id,
		metricId: row.metric_id,
		month: row.month,
		value: row.value,
		valueText: row.value_text,
		updatedBy: row.updated_by,
		updatedAt: row.updated_at,
	};
}

export async function listPaidAdsDataValues(
	supabase: SupabaseClient,
	clientId: string,
	startMonth: string,
	endMonth: string,
): Promise<PaidAdsDataValue[]> {
	const { data, error } = await supabase
		.from("paid_ads_data_values")
		.select("*")
		.eq("client_id", clientId)
		.gte("month", startMonth)
		.lte("month", endMonth);
	if (error) throw error;
	return (data as ValueRow[]).map(mapValue);
}

export async function upsertPaidAdsDataValue(
	supabase: SupabaseClient,
	input: {
		clientId: string;
		metricId: string;
		month: string;
		value: number | null;
		valueText: string | null;
		updatedBy: string;
	},
): Promise<void> {
	const { error } = await supabase.from("paid_ads_data_values").upsert(
		{
			client_id: input.clientId,
			metric_id: input.metricId,
			month: input.month,
			value: input.value,
			value_text: input.valueText,
			updated_by: input.updatedBy,
		},
		{ onConflict: "client_id,metric_id,month" },
	);
	if (error) throw error;
}
