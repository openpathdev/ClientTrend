import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthlyMetric, MonthlyMetricSource, MonthlyMetricValueType } from "./types";

type MetricRow = {
	id: string;
	key: string;
	label: string;
	value_type: MonthlyMetricValueType;
	min_value: number | null;
	max_value: number | null;
	source: MonthlyMetricSource;
	group_label: string | null;
	sort_order: number;
	active: boolean;
};

function mapMetric(row: MetricRow): MonthlyMetric {
	return {
		id: row.id,
		key: row.key,
		label: row.label,
		valueType: row.value_type,
		minValue: row.min_value,
		maxValue: row.max_value,
		source: row.source,
		groupLabel: row.group_label,
		sortOrder: row.sort_order,
		active: row.active,
	};
}

export async function listMonthlyMetrics(supabase: SupabaseClient): Promise<MonthlyMetric[]> {
	const { data, error } = await supabase
		.from("monthly_metrics")
		.select("*")
		.eq("active", true)
		.order("sort_order", { ascending: true });
	if (error) throw new Error(error.message);
	return (data as MetricRow[]).map(mapMetric);
}

export async function createMonthlyMetric(
	supabase: SupabaseClient,
	input: { key: string; label: string; valueType: MonthlyMetricValueType; sortOrder: number; groupLabel: string | null },
): Promise<void> {
	const { error } = await supabase.from("monthly_metrics").insert({
		key: input.key,
		label: input.label,
		value_type: input.valueType,
		sort_order: input.sortOrder,
		group_label: input.groupLabel,
		source: "manual",
	});
	if (error) throw new Error(error.message);
}
