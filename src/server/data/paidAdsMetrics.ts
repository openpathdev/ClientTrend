import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaidAdsMetric, MonthlyMetricSource, MonthlyMetricValueType } from "./types";

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

function mapMetric(row: MetricRow): PaidAdsMetric {
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

export async function listPaidAdsMetrics(supabase: SupabaseClient): Promise<PaidAdsMetric[]> {
	const { data, error } = await supabase
		.from("paid_ads_metrics")
		.select("*")
		.eq("active", true)
		.order("sort_order", { ascending: true });
	if (error) throw new Error(error.message);
	return (data as MetricRow[]).map(mapMetric);
}

export async function createPaidAdsMetric(
	supabase: SupabaseClient,
	input: { key: string; label: string; valueType: MonthlyMetricValueType; sortOrder: number },
): Promise<void> {
	const { error } = await supabase.from("paid_ads_metrics").insert({
		key: input.key,
		label: input.label,
		value_type: input.valueType,
		sort_order: input.sortOrder,
		source: "manual",
	});
	if (error) throw new Error(error.message);
}
