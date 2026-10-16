import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommentSection } from "./types";

/** One written cell's before/after — stored as-is in paste_imports.changes (see that migration). */
export type PasteChange = {
	metric_id: string;
	month: string;
	old_value: number | null;
	old_value_text: string | null;
	old_updated_by: string | null;
	new_value: number | null;
	new_value_text: string | null;
};

export type PasteImport = {
	id: string;
	clientId: string;
	section: CommentSection;
	changes: PasteChange[];
	undoneAt: string | null;
};

type PasteImportRow = {
	id: string;
	client_id: string;
	section: CommentSection;
	changes: PasteChange[];
	undone_at: string | null;
};

export async function createPasteImport(
	supabase: SupabaseClient,
	input: { clientId: string; section: CommentSection; changes: PasteChange[]; createdBy: string },
): Promise<string> {
	const { data, error } = await supabase
		.from("paste_imports")
		.insert({ client_id: input.clientId, section: input.section, changes: input.changes, created_by: input.createdBy })
		.select("id")
		.single();
	if (error) throw new Error(error.message);
	return (data as { id: string }).id;
}

/** Used when the value upsert fails right after the record was written, so a failed paste doesn't leave an undo-able record behind. */
export async function deletePasteImport(supabase: SupabaseClient, id: string): Promise<void> {
	const { error } = await supabase.from("paste_imports").delete().eq("id", id);
	if (error) throw new Error(error.message);
}

export async function getPasteImport(supabase: SupabaseClient, id: string): Promise<PasteImport | null> {
	const { data, error } = await supabase.from("paste_imports").select("id, client_id, section, changes, undone_at").eq("id", id).maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;
	const row = data as PasteImportRow;
	return { id: row.id, clientId: row.client_id, section: row.section, changes: row.changes, undoneAt: row.undone_at };
}

/** Marks undone only if not already — returns false when another request got there first. */
export async function markPasteImportUndone(supabase: SupabaseClient, id: string, undoneBy: string): Promise<boolean> {
	const { data, error } = await supabase
		.from("paste_imports")
		.update({ undone_at: new Date().toISOString(), undone_by: undoneBy })
		.eq("id", id)
		.is("undone_at", null)
		.select("id");
	if (error) throw new Error(error.message);
	return (data as unknown[]).length > 0;
}
