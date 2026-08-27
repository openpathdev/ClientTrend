import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comment, CommentSection } from "./types";
import { cellKey } from "../cellKey";

type CommentRow = {
	id: string;
	client_id: string;
	section: CommentSection;
	metric_id: string;
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
		metricId: row.metric_id,
		month: row.month,
		body: row.body,
		createdBy: row.created_by,
		updatedBy: row.updated_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/** Comments for one specific cell (client, section, metric, month) — PRD §12 per-cell model. */
export async function listComments(
	supabase: SupabaseClient,
	clientId: string,
	section: CommentSection,
	metricId: string,
	month: string,
): Promise<Comment[]> {
	const { data, error } = await supabase
		.from("comments")
		.select("*")
		.eq("client_id", clientId)
		.eq("section", section)
		.eq("metric_id", metricId)
		.eq("month", month)
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data as CommentRow[]).map(mapComment);
}

/**
 * All comments for a client+section across a month range, grouped per cell —
 * one bulk fetch feeding both the per-cell flag badge and its hover-preview
 * text, so hovering a cell never needs a network round trip (PRD §12).
 */
export async function listCommentsForRange(
	supabase: SupabaseClient,
	clientId: string,
	section: CommentSection,
	startMonth: string,
	endMonth: string,
): Promise<Map<string, Comment[]>> {
	const { data, error } = await supabase
		.from("comments")
		.select("*")
		.eq("client_id", clientId)
		.eq("section", section)
		.gte("month", startMonth)
		.lte("month", endMonth)
		.order("created_at", { ascending: false });
	if (error) throw error;
	const byCell = new Map<string, Comment[]>();
	for (const row of (data as CommentRow[]).map(mapComment)) {
		const key = cellKey(row.metricId, row.month);
		byCell.set(key, [...(byCell.get(key) ?? []), row]);
	}
	return byCell;
}

export async function createComment(
	supabase: SupabaseClient,
	input: { clientId: string; section: CommentSection; metricId: string; month: string; body: string; createdBy: string },
): Promise<void> {
	const { error } = await supabase.from("comments").insert({
		client_id: input.clientId,
		section: input.section,
		metric_id: input.metricId,
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
