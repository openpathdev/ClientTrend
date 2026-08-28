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

/**
 * Maps a HubSpot Owner id to its canonical variant for the same real
 * person — several active CSMs (Nancy Kirchoff, Kyle Johnson, Ethan
 * Kirkelie) have TWO Owner records in HubSpot, one per email domain
 * (`@openpathdigital.com` and `@828collective.com`, an artifact of an
 * account migration); `@828collective.com` was chosen as canonical
 * (2026-08-28/29 user decision) and only that row is `active`. A
 * Company's `csm` property may still reference the older/duplicate id
 * depending on when it was set — without this alias, such a company would
 * fail to resolve to any active CSM at all (silently skipped by
 * auto-import, or left with a stale csm_id by the regular sync). This is
 * hardcoded rather than derived because it's one-off tribal knowledge
 * about this specific HubSpot account, not a general pattern — see the
 * "known limitation" this was written to close, in tasks.md.
 */
const CSM_OWNER_ID_ALIASES: Record<string, string> = {
	"577351169": "471622286", // Nancy Kirchoff
	"94150336": "2103711256", // Kyle Johnson
	"71270498": "1339539521", // Ethan Kirkelie
};

export function canonicalOwnerId(hubspotOwnerId: string): string {
	return CSM_OWNER_ID_ALIASES[hubspotOwnerId] ?? hubspotOwnerId;
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
