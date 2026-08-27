import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlyDataValue } from "./types";

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

function mapValue(row: ValueRow): MonthlyDataValue {
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

/** All values for a client within an inclusive [startMonth, endMonth] range (first-of-month dates). */
export async function listMonthlyDataValues(
	supabase: SupabaseClient,
	clientId: string,
	startMonth: string,
	endMonth: string,
): Promise<MonthlyDataValue[]> {
	const { data, error } = await supabase
		.from("monthly_data_values")
		.select("*")
		.eq("client_id", clientId)
		.gte("month", startMonth)
		.lte("month", endMonth);
	if (error) throw error;
	return (data as ValueRow[]).map(mapValue);
}

export async function upsertMonthlyDataValue(
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
	const { error } = await supabase.from("monthly_data_values").upsert(
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
