import type { SupabaseClient } from "@supabase/supabase-js";
import type { Change, ChangeCategory, ChangeKind } from "./types";

type ChangeRow = {
	id: string;
	client_id: string;
	change_date: string;
	description: string;
	category: string | null;
	kind: ChangeKind;
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
		kind: row.kind,
		source: row.source,
		createdBy: row.created_by,
		createdAt: row.created_at,
	};
}

/** `kind` splits the general "List of changes" from the Ad Changes list under Paid Ads. */
export async function listChanges(supabase: SupabaseClient, clientId: string, kind: ChangeKind = "general"): Promise<Change[]> {
	const { data, error } = await supabase
		.from("changes")
		.select("*")
		.eq("client_id", clientId)
		.eq("kind", kind)
		.order("change_date", { ascending: false })
		.order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return (data as ChangeRow[]).map(mapChange);
}

export async function createChange(
	supabase: SupabaseClient,
	clientId: string,
	input: { changeDate: string; description: string; category: ChangeCategory | null },
	createdBy: string,
	kind: ChangeKind = "general",
): Promise<void> {
	const { error } = await supabase.from("changes").insert({
		client_id: clientId,
		change_date: input.changeDate,
		description: input.description,
		category: input.category,
		kind,
		created_by: createdBy,
	});
	if (error) throw new Error(error.message);
}

export async function updateChange(
	supabase: SupabaseClient,
	clientId: string,
	changeId: string,
	input: { changeDate: string; description: string; category: ChangeCategory | null },
	kind: ChangeKind = "general",
): Promise<void> {
	const { error } = await supabase
		.from("changes")
		.update({ change_date: input.changeDate, description: input.description, category: input.category })
		.eq("id", changeId)
		.eq("client_id", clientId)
		.eq("kind", kind);
	if (error) throw new Error(error.message);
}

export async function deleteChange(supabase: SupabaseClient, clientId: string, changeId: string, kind: ChangeKind = "general"): Promise<void> {
	const { error } = await supabase.from("changes").delete().eq("id", changeId).eq("client_id", clientId).eq("kind", kind);
	if (error) throw new Error(error.message);
}
