import type { SupabaseClient } from "@supabase/supabase-js";
import type { Status } from "./types";
import type { IconName } from "../../components/icons/icon-names";

type StatusRow = {
	id: string;
	name: string;
	description: string | null;
	icon: string;
	color_line: string;
	color_text: string;
	color_tint: string;
	color_halo: string;
	sort_order: number;
	active: boolean;
};

function mapStatus(row: StatusRow): Status {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		icon: row.icon as IconName,
		colorLine: row.color_line,
		colorText: row.color_text,
		colorTint: row.color_tint,
		colorHalo: row.color_halo,
		sortOrder: row.sort_order,
		active: row.active,
	};
}

export async function listStatuses(supabase: SupabaseClient): Promise<Status[]> {
	const { data, error } = await supabase
		.from("statuses")
		.select("id, name, description, icon, color_line, color_text, color_tint, color_halo, sort_order, active")
		.eq("active", true)
		.order("sort_order", { ascending: true });
	if (error) throw error;
	return (data as StatusRow[]).map(mapStatus);
}
