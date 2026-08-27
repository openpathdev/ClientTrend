import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment, CommentSection } from "./types";

type CommentRow = {
	id: string;
	client_id: string;
	section: CommentSection;
	month: string;
	body: string;
	created_by: string;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
};

function mapComment(row: CommentRow): Comment {
	return {
		id: row.id,
		clientId: row.client_id,
		section: row.section,
		month: row.month,
		body: row.body,
		createdBy: row.created_by,
		updatedBy: row.updated_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function listComments(
	supabase: SupabaseClient,
	clientId: string,
	section: CommentSection,
	month: string,
): Promise<Comment[]> {
	const { data, error } = await supabase
		.from("comments")
		.select("*")
		.eq("client_id", clientId)
		.eq("section", section)
		.eq("month", month)
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data as CommentRow[]).map(mapComment);
}

/** Comment counts per month, for the month-header indicator badges (PRD §12). */
export async function getCommentCounts(
	supabase: SupabaseClient,
	clientId: string,
	section: CommentSection,
	startMonth: string,
	endMonth: string,
): Promise<Map<string, number>> {
	const { data, error } = await supabase
		.from("comments")
		.select("month")
		.eq("client_id", clientId)
		.eq("section", section)
		.gte("month", startMonth)
		.lte("month", endMonth);
	if (error) throw error;
	const counts = new Map<string, number>();
	for (const row of data as { month: string }[]) {
		counts.set(row.month, (counts.get(row.month) ?? 0) + 1);
	}
	return counts;
}

export async function createComment(
	supabase: SupabaseClient,
	input: { clientId: string; section: CommentSection; month: string; body: string; createdBy: string },
): Promise<void> {
	const { error } = await supabase.from("comments").insert({
		client_id: input.clientId,
		section: input.section,
		month: input.month,
		body: input.body,
		created_by: input.createdBy,
	});
	if (error) throw error;
}

export async function updateComment(
	supabase: SupabaseClient,
	commentId: string,
	body: string,
	updatedBy: string,
): Promise<void> {
	const { error } = await supabase.from("comments").update({ body, updated_by: updatedBy }).eq("id", commentId);
	if (error) throw error;
}

export async function deleteComment(supabase: SupabaseClient, commentId: string): Promise<void> {
	const { error } = await supabase.from("comments").delete().eq("id", commentId);
	if (error) throw error;
}
