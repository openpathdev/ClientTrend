import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlyDataValue } from "./types";

type ValueRow = {
	id: string;
	client_id: string;
	metric_id: string;
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
		metricId: row.metric_id,
		month: row.month,
		value: row.value,
		valueText: row.value_text,
		statusId: row.status_id,
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
	if (error) throw new Error(error.message);
	return (data as ValueRow[]).map(mapValue);
}

/** Single cell read — used by the value-PUT route's invalid-input path so a redisplayed cell keeps its true highlight/comment state. */
export async function getMonthlyDataValue(
	supabase: SupabaseClient,
	clientId: string,
	metricId: string,
	month: string,
): Promise<MonthlyDataValue | null> {
	const { data, error } = await supabase
		.from("monthly_data_values")
		.select("*")
		.eq("client_id", clientId)
		.eq("metric_id", metricId)
		.eq("month", month)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? mapValue(data as ValueRow) : null;
}

/** Upserts a cell's value; returns the resulting row so callers see its true statusId (never touched here) rather than guessing. */
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
): Promise<MonthlyDataValue> {
	const { data, error } = await supabase
		.from("monthly_data_values")
		.upsert(
			{
				client_id: input.clientId,
				metric_id: input.metricId,
				month: input.month,
				value: input.value,
				value_text: input.valueText,
				updated_by: input.updatedBy,
			},
			{ onConflict: "client_id,metric_id,month" },
		)
		.select()
		.single();
	if (error) throw new Error(error.message);
	return mapValue(data as ValueRow);
}

/**
 * Writes many cells in one request (Performance spreadsheet paste and its undo).
 * Only the value columns and updated_by are sent, so each cell's highlight
 * (status_id) is left as it is.
 */
export async function bulkUpsertMonthlyDataValues(
	supabase: SupabaseClient,
	rows: { clientId: string; metricId: string; month: string; value: number | null; valueText: string | null; updatedBy: string }[],
): Promise<void> {
	if (rows.length === 0) return;
	const { error } = await supabase.from("monthly_data_values").upsert(
		rows.map((r) => ({
			client_id: r.clientId,
			metric_id: r.metricId,
			month: r.month,
			value: r.value,
			value_text: r.valueText,
			updated_by: r.updatedBy,
		})),
		{ onConflict: "client_id,metric_id,month" },
	);
	if (error) throw new Error(error.message);
}

/** Sets (or clears, with statusId=null) a cell's highlight only — value/value_text/updated_by are left untouched. */
export async function setMonthlyDataValueStatus(
	supabase: SupabaseClient,
	input: { clientId: string; metricId: string; month: string; statusId: string | null },
): Promise<MonthlyDataValue> {
	const { data, error } = await supabase
		.from("monthly_data_values")
		.upsert(
			{ client_id: input.clientId, metric_id: input.metricId, month: input.month, status_id: input.statusId },
			{ onConflict: "client_id,metric_id,month" },
		)
		.select()
		.single();
	if (error) throw new Error(error.message);
	return mapValue(data as ValueRow);
}
