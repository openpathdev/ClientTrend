import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientFilters, ClientRow } from "./types";
import type { IconName } from "../../components/icons/icon-names";

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

export async function listClients(supabase: SupabaseClient, filters: ClientFilters = {}): Promise<ClientRow[]> {
	let query = supabase.from("clients").select(CLIENT_SELECT).order("name", { ascending: true });

	if (filters.csmId) query = query.eq("csm_id", filters.csmId);
	if (filters.statusId) query = query.eq("status_id", filters.statusId);
	if (filters.stateCode) query = query.eq("state_code", filters.stateCode);

	const { data, error } = await query;
	if (error) throw error;
	return (data as unknown as ClientQueryRow[]).map(mapClient);
}

export async function getClientById(supabase: SupabaseClient, clientId: string): Promise<ClientRow | null> {
	const { data, error } = await supabase.from("clients").select(CLIENT_SELECT).eq("id", clientId).maybeSingle();
	if (error) throw error;
	return data ? mapClient(data as unknown as ClientQueryRow) : null;
}

export async function updateClientStatus(
	supabase: SupabaseClient,
	clientId: string,
	statusId: string,
): Promise<ClientRow | null> {
	const { error: updateError } = await supabase.from("clients").update({ status_id: statusId }).eq("id", clientId);
	if (updateError) throw updateError;
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
	if (error) throw error;
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
	if (error) throw error;
	return getClientById(supabase, clientId);
}
