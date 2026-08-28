import type { SupabaseClient } from "@supabase/supabase-js";
import type { Link } from "./types";

type LinkRow = {
	id: string;
	client_id: string;
	title: string;
	url: string;
	description: string | null;
	category: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
};

function mapLink(row: LinkRow): Link {
	return {
		id: row.id,
		clientId: row.client_id,
		title: row.title,
		url: row.url,
		description: row.description,
		category: row.category,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function listLinks(supabase: SupabaseClient, clientId: string): Promise<Link[]> {
	const { data, error } = await supabase
		.from("links")
		.select("*")
		.eq("client_id", clientId)
		.order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return (data as LinkRow[]).map(mapLink);
}

export async function createLink(
	supabase: SupabaseClient,
	clientId: string,
	input: { title: string; url: string; description: string | null; category: string | null },
	createdBy: string,
): Promise<void> {
	const { error } = await supabase.from("links").insert({
		client_id: clientId,
		title: input.title,
		url: input.url,
		description: input.description,
		category: input.category,
		created_by: createdBy,
	});
	if (error) throw new Error(error.message);
}

export async function updateLink(
	supabase: SupabaseClient,
	linkId: string,
	input: { title: string; url: string; description: string | null; category: string | null },
): Promise<void> {
	const { error } = await supabase
		.from("links")
		.update({ title: input.title, url: input.url, description: input.description, category: input.category })
		.eq("id", linkId);
	if (error) throw new Error(error.message);
}

export async function deleteLink(supabase: SupabaseClient, linkId: string): Promise<void> {
	const { error } = await supabase.from("links").delete().eq("id", linkId);
	if (error) throw new Error(error.message);
}
