import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientFilters, ClientRow } from "./types";
import type { IconName } from "../../components/icons/icon-names";
import { listCsms } from "./csms";

const CLIENT_SELECT = `
	id, name, website, population, domain_authority, legal_status, state_code,
	hubspot_company_id, hubspot_sync_status, hubspot_synced_at,
	general_notes, general_notes_updated_at, general_notes_updated_by,
	ad_spend_per_month, paid_ads_go_live_date,
	csm:csms ( id, name, email, active ),
	status:statuses!inner ( id, name, description, icon, color_line, color_text, color_tint, color_halo, sort_order, active )
`;

type ClientQueryRow = {
	id: string;
	name: string;
	website: string | null;
	population: number | null;
	domain_authority: number | null;
	legal_status: string | null;
	state_code: string | null;
	hubspot_company_id: string | null;
	hubspot_sync_status: "synced" | "error" | "unmatched" | null;
	hubspot_synced_at: string | null;
	general_notes: string | null;
	general_notes_updated_at: string | null;
	general_notes_updated_by: string | null;
	ad_spend_per_month: number | null;
	paid_ads_go_live_date: string | null;
	csm: { id: string; name: string; email: string | null; active: boolean } | null;
	status: {
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
};

function mapClient(row: ClientQueryRow): ClientRow {
	return {
		id: row.id,
		name: row.name,
		website: row.website,
		population: row.population,
		domainAuthority: row.domain_authority,
		legalStatus: row.legal_status,
		stateCode: row.state_code,
		csm: row.csm,
		hubspotCompanyId: row.hubspot_company_id,
		hubspotSyncStatus: row.hubspot_sync_status,
		hubspotSyncedAt: row.hubspot_synced_at,
		generalNotes: row.general_notes,
		generalNotesUpdatedAt: row.general_notes_updated_at,
		generalNotesUpdatedBy: row.general_notes_updated_by,
		adSpendPerMonth: row.ad_spend_per_month,
		paidAdsGoLiveDate: row.paid_ads_go_live_date,
		status: {
			id: row.status.id,
			name: row.status.name,
			description: row.status.description,
			icon: row.status.icon as IconName,
			colorLine: row.status.color_line,
			colorText: row.status.color_text,
			colorTint: row.status.color_tint,
			colorHalo: row.status.color_halo,
			sortOrder: row.status.sort_order,
			active: row.status.active,
		},
	};
}

/**
 * Baseline visibility rule for the Overview page (2026-08-28 user decision,
 * not user-togglable): only clients whose CSM is one of the currently
 * active roster AND who have purchased one of the 2 real website product
 * tiers (Pro or Base — NOT the generic/legacy `purchased_website` flag)
 * ever show on the card grid. The active-CSM-roster approach (rather than
 * hardcoding specific ids) means adding a new CSM later (e.g. "Laura",
 * not yet in HubSpot as of this decision) automatically includes their
 * clients the moment that CSM is synced and marked active — no code change
 * needed. This filter does NOT apply to `getClientById` — a client is still
 * directly reachable by URL regardless of this rule.
 */
export async function listClients(supabase: SupabaseClient, filters: ClientFilters = {}): Promise<ClientRow[]> {
	const activeCsms = await listCsms(supabase);
	const activeCsmIds = activeCsms.map((c) => c.id);

	let query = supabase
		.from("clients")
		.select(CLIENT_SELECT)
		.in("csm_id", activeCsmIds.length > 0 ? activeCsmIds : ["00000000-0000-0000-0000-000000000000"])
		.or("hubspot_purchased_pro_website.eq.true,hubspot_purchased_base_website.eq.true")
		.order("name", { ascending: true });

	if (filters.csmId) query = query.eq("csm_id", filters.csmId);
	if (filters.statusId) query = query.eq("status_id", filters.statusId);
	if (filters.stateCode) query = query.eq("state_code", filters.stateCode);

	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return (data as unknown as ClientQueryRow[]).map(mapClient);
}

export async function getClientById(supabase: SupabaseClient, clientId: string): Promise<ClientRow | null> {
	const { data, error } = await supabase.from("clients").select(CLIENT_SELECT).eq("id", clientId).maybeSingle();
	if (error) throw new Error(error.message);
	return data ? mapClient(data as unknown as ClientQueryRow) : null;
}

export async function updateClientStatus(
	supabase: SupabaseClient,
	clientId: string,
	statusId: string,
): Promise<ClientRow | null> {
	const { error: updateError } = await supabase.from("clients").update({ status_id: statusId }).eq("id", clientId);
	if (updateError) throw new Error(updateError.message);
	return getClientById(supabase, clientId);
}

/** Both fields are simple manually-entered values (PRD §11), not derived from any metric or external source. */
export async function updatePaidAdsSettings(
	supabase: SupabaseClient,
	clientId: string,
	input: { adSpendPerMonth: number | null; goLiveDate: string | null },
): Promise<ClientRow | null> {
	const { error } = await supabase
		.from("clients")
		.update({ ad_spend_per_month: input.adSpendPerMonth, paid_ads_go_live_date: input.goLiveDate })
		.eq("id", clientId);
	if (error) throw new Error(error.message);
	return getClientById(supabase, clientId);
}

export async function updateGeneralNotes(
	supabase: SupabaseClient,
	clientId: string,
	body: string,
	updatedBy: string,
): Promise<ClientRow | null> {
	const { error } = await supabase
		.from("clients")
		.update({
			general_notes: body.trim() === "" ? null : body,
			general_notes_updated_at: new Date().toISOString(),
			general_notes_updated_by: updatedBy,
		})
		.eq("id", clientId);
	if (error) throw new Error(error.message);
	return getClientById(supabase, clientId);
}

/** Every client linked to a HubSpot company — what the sync job iterates (PRD §14). */
export async function listHubspotLinkedClients(
	supabase: SupabaseClient,
): Promise<{ id: string; name: string; hubspotCompanyId: string }[]> {
	const { data, error } = await supabase.from("clients").select("id, name, hubspot_company_id").not("hubspot_company_id", "is", null);
	if (error) throw new Error(error.message);
	return (data as { id: string; name: string; hubspot_company_id: string }[]).map((r) => ({
		id: r.id,
		name: r.name,
		hubspotCompanyId: r.hubspot_company_id,
	}));
}

/** Writes only the fields declared HubSpot-owned in `hubspot_field_mappings` (PRD §14/§15) — never touches manual fields. `csmId` is the already-resolved local csms.id, or undefined to leave it unchanged (e.g. no matching owner this run). */
export async function applyHubspotSync(
	supabase: SupabaseClient,
	clientId: string,
	input: {
		name: string;
		website: string | null;
		population: number | null;
		domainAuthority: number | null;
		csmId?: string;
		purchasedProWebsite: boolean;
		purchasedBaseWebsite: boolean;
	},
): Promise<void> {
	const update: Record<string, unknown> = {
		name: input.name,
		website: input.website,
		population: input.population,
		domain_authority: input.domainAuthority,
		hubspot_purchased_pro_website: input.purchasedProWebsite,
		hubspot_purchased_base_website: input.purchasedBaseWebsite,
		hubspot_sync_status: "synced",
		hubspot_synced_at: new Date().toISOString(),
	};
	if (input.csmId !== undefined) update.csm_id = input.csmId;

	const { error } = await supabase.from("clients").update(update).eq("id", clientId);
	if (error) throw new Error(error.message);
}

/** Every already-imported hubspot_company_id — used to mark search results "already imported" in the import UI (PRD §14/§36). */
export async function listImportedHubspotCompanyIds(supabase: SupabaseClient): Promise<Set<string>> {
	const { data, error } = await supabase.from("clients").select("hubspot_company_id").not("hubspot_company_id", "is", null);
	if (error) throw new Error(error.message);
	return new Set((data as { hubspot_company_id: string }[]).map((r) => r.hubspot_company_id));
}

/** Creates a new client from a HubSpot company search result (PRD §14/§36) — the only way a client comes into existence. `defaultStatusId` is the first-sort-order status (Healthy), not a hardcoded id, since the numbered 1/2/3/4 status model was superseded before this ever shipped. */
export async function createClientFromHubspot(
	supabase: SupabaseClient,
	input: {
		hubspotCompanyId: string;
		name: string;
		website: string | null;
		population: number | null;
		domainAuthority: number | null;
		csmId?: string;
		defaultStatusId: string;
		purchasedProWebsite: boolean;
		purchasedBaseWebsite: boolean;
	},
): Promise<ClientRow> {
	const { data, error } = await supabase
		.from("clients")
		.insert({
			hubspot_company_id: input.hubspotCompanyId,
			name: input.name,
			website: input.website,
			population: input.population,
			domain_authority: input.domainAuthority,
			csm_id: input.csmId ?? null,
			status_id: input.defaultStatusId,
			hubspot_purchased_pro_website: input.purchasedProWebsite,
			hubspot_purchased_base_website: input.purchasedBaseWebsite,
			hubspot_sync_status: "synced",
			hubspot_synced_at: new Date().toISOString(),
		})
		.select("id")
		.single();
	if (error) throw new Error(error.message);
	const client = await getClientById(supabase, (data as { id: string }).id);
	if (!client) throw new Error("Failed to load newly created client");
	return client;
}

/** Clears the HubSpot link without deleting the client record (PRD §14) — the client stops syncing but keeps all its Client-Trends-owned data. */
export async function unlinkHubspotClient(supabase: SupabaseClient, clientId: string): Promise<void> {
	const { error } = await supabase
		.from("clients")
		.update({ hubspot_company_id: null, hubspot_sync_status: null, hubspot_synced_at: null })
		.eq("id", clientId);
	if (error) throw new Error(error.message);
}

export async function markHubspotSyncStatus(
	supabase: SupabaseClient,
	clientId: string,
	status: "error" | "unmatched",
): Promise<void> {
	const { error } = await supabase
		.from("clients")
		.update({ hubspot_sync_status: status, hubspot_synced_at: new Date().toISOString() })
		.eq("id", clientId);
	if (error) throw new Error(error.message);
}
