import type { SupabaseClient } from "@supabase/supabase-js";
import type { Change, ChangeCategory } from "./types";

type ChangeRow = {
	id: string;
	client_id: string;
	change_date: string;
	description: string;
	category: string | null;
	source: "manual" | "system";
	created_by: string;
	created_at: string;
};

function mapChange(row: ChangeRow): Change {
	return {
		id: row.id,
		clientId: row.client_id,
		changeDate: row.change_date,
		description: row.description,
		category: row.category as ChangeCategory | null,
		source: row.source,
		createdBy: row.created_by,
		createdAt: row.created_at,
	};
}

export async function listChanges(supabase: SupabaseClient, clientId: string): Promise<Change[]> {
	const { data, error } = await supabase
		.from("changes")
		.select("*")
		.eq("client_id", clientId)
		.order("change_date", { ascending: false })
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data as ChangeRow[]).map(mapChange);
}

export async function createChange(
	supabase: SupabaseClient,
	clientId: string,
	input: { changeDate: string; description: string; category: ChangeCategory | null },
	createdBy: string,
): Promise<void> {
	const { error } = await supabase.from("changes").insert({
		client_id: clientId,
		change_date: input.changeDate,
		description: input.description,
		category: input.category,
		created_by: createdBy,
	});
	if (error) throw error;
}

export async function updateChange(
	supabase: SupabaseClient,
	changeId: string,
	input: { changeDate: string; description: string; category: ChangeCategory | null },
): Promise<void> {
	const { error } = await supabase
		.from("changes")
		.update({ change_date: input.changeDate, description: input.description, category: input.category })
		.eq("id", changeId);
	if (error) throw error;
}

export async function deleteChange(supabase: SupabaseClient, changeId: string): Promise<void> {
	const { error } = await supabase.from("changes").delete().eq("id", changeId);
	if (error) throw error;
}
