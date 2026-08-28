import type { SupabaseClient } from "@supabase/supabase-js";
import type { Csm } from "./types";

type CsmRow = { id: string; name: string; email: string | null; active: boolean };

export async function listCsms(supabase: SupabaseClient): Promise<Csm[]> {
	const { data, error } = await supabase
		.from("csms")
		.select("id, name, email, active")
		.eq("active", true)
		.order("name", { ascending: true });
	if (error) throw new Error(error.message);
	return data as CsmRow[];
}

/** All CSMs with a HubSpot Owner link — used to build the `hubspot_owner_id -> csms.id` lookup the Company `csm` property is resolved against (PRD §14). */
export async function listCsmsWithOwnerId(supabase: SupabaseClient): Promise<{ id: string; hubspotOwnerId: string }[]> {
	const { data, error } = await supabase.from("csms").select("id, hubspot_owner_id").not("hubspot_owner_id", "is", null);
	if (error) throw new Error(error.message);
	return (data as { id: string; hubspot_owner_id: string }[]).map((r) => ({ id: r.id, hubspotOwnerId: r.hubspot_owner_id }));
}

/** Upserts one CSM row keyed on hubspot_owner_id — called once per HubSpot Owner at the start of each sync run, before Companies are processed (PRD §14). */
export async function upsertCsmFromOwner(
	supabase: SupabaseClient,
	input: { hubspotOwnerId: string; name: string; email: string | null },
): Promise<void> {
	const { error } = await supabase
		.from("csms")
		.upsert(
			{ hubspot_owner_id: input.hubspotOwnerId, name: input.name, email: input.email },
			{ onConflict: "hubspot_owner_id" },
		);
	if (error) throw new Error(error.message);
}
