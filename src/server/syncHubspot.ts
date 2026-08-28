import type { CloudflareBindings } from "./bindings";
import { createSupabaseClient } from "./supabase";
import { fetchAllOwners, fetchCompanySyncProperties, HubspotRateLimitError } from "./hubspot";
import { upsertCsmFromOwner, listCsmsWithOwnerId, listCsms, canonicalOwnerId } from "./data/csms";
import { listStatuses } from "./data/statuses";
import { listHubspotLinkedClients, applyHubspotSync, markHubspotSyncStatus, createClientFromHubspot } from "./data/clients";
import { createSyncRun, finishSyncRun, logSyncResult } from "./data/hubspotSyncLog";

const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Syncs the 5 simple Company properties + CSM assignment for every
 * HubSpot-linked client, plus the HubSpot Owners roster (PRD §14).
 * Deliberately does NOT touch `her_journey_org_data` — that 20MB+ file
 * property is handled by the separate `scripts/sync_org_data.py`, run
 * outside the Worker (see that script's docstring for why).
 *
 * Triggered by `POST /api/admin/hubspot-sync/run`, itself called by an
 * external cron (Astro's Cloudflare adapter has no `scheduled()` hook to
 * attach a native Cloudflare Cron Trigger to — see that route for detail).
 */
export async function runHubspotSync(env: CloudflareBindings): Promise<{
	runId: string;
	clientsProcessed: number;
	clientsFailed: number;
	status: "succeeded" | "failed" | "partial";
}> {
	const supabase = createSupabaseClient(env);
	const runId = await createSyncRun(supabase);

	let clientsProcessed = 0;
	let clientsFailed = 0;
	let rateLimited = false;

	try {
		// Owners must sync before Companies — csm resolution below depends on
		// csms.hubspot_owner_id already being fresh (PRD §14).
		const owners = await fetchAllOwners(env);
		for (const owner of owners) {
			if (owner.archived) continue;
			const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || (owner.email ?? "Unknown Owner");
			await upsertCsmFromOwner(supabase, { hubspotOwnerId: owner.id, name, email: owner.email });
		}

		const csmByOwnerId = new Map((await listCsmsWithOwnerId(supabase)).map((c) => [c.hubspotOwnerId, c.id]));
		const clients = await listHubspotLinkedClients(supabase);

		for (const client of clients) {
			if (rateLimited) break;

			let attempt = 0;
			for (;;) {
				try {
					const result = await fetchCompanySyncProperties(env, client.hubspotCompanyId);
					if (result.status === "not_found") {
						await markHubspotSyncStatus(supabase, client.id, "unmatched");
						await logSyncResult(supabase, runId, client.id, "unmatched", "HubSpot company not found or archived");
						clientsFailed++;
						break;
					}

					const props = result.properties;
					const csmId = props.csm ? csmByOwnerId.get(canonicalOwnerId(props.csm)) : undefined;
					if (props.csm && !csmId) {
						// No matching owner yet — leave csm_id unchanged rather than nulling it (PRD §14).
						await logSyncResult(supabase, runId, client.id, "synced", `csm property "${props.csm}" did not match any known owner; csm_id left unchanged`);
					}

					await applyHubspotSync(supabase, client.id, {
						name: props.name ?? client.name,
						website: props.domain ?? null,
						population: props.service_area_population ? Number(props.service_area_population) : null,
						domainAuthority: props.domain_authority ? Number(props.domain_authority) : null,
						csmId,
						purchasedProWebsite: props.website___purchased_pro_website === "true",
						purchasedBaseWebsite: props.website___purchased_base_website === "true",
					});
					await logSyncResult(supabase, runId, client.id, "synced");
					clientsProcessed++;
					break;
				} catch (err) {
					if (err instanceof HubspotRateLimitError) {
						attempt++;
						if (attempt > MAX_RATE_LIMIT_RETRIES) {
							rateLimited = true;
							await logSyncResult(supabase, runId, client.id, "error", "Deferred: HubSpot rate limit exceeded max retries this run");
							clientsFailed++;
							break;
						}
						await new Promise((resolve) => setTimeout(resolve, err.retryAfterSeconds * 1000));
						continue;
					}
					await markHubspotSyncStatus(supabase, client.id, "error");
					const message = err instanceof Error ? err.message : String(err);
					await logSyncResult(supabase, runId, client.id, "error", message);
					clientsFailed++;
					break;
				}
			}
		}

		const status = clientsFailed === 0 ? "succeeded" : clientsProcessed === 0 ? "failed" : "partial";
		await finishSyncRun(supabase, runId, { status, clientsProcessed, clientsFailed });
		return { runId, clientsProcessed, clientsFailed, status };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await finishSyncRun(supabase, runId, { status: "failed", clientsProcessed, clientsFailed, errorSummary: message });
		return { runId, clientsProcessed, clientsFailed, status: "failed" };
	}
}

export type AutoImportResult =
	| { status: "imported"; clientId: string }
	| { status: "already_imported"; clientId: string }
	| { status: "ineligible"; reason: string }
	| { status: "not_found" };

/**
 * Triggered by a HubSpot Workflow's "Send a webhook" action, configured by
 * the user in the HubSpot portal (2026-08-29 decision — a true push
 * trigger, not polling; not configurable via the Private App API, which
 * 403s on the Webhooks API for private apps, only public/marketplace
 * apps). Given a company id, re-fetches its current properties from
 * HubSpot directly (never trusts the webhook payload's own shape/content,
 * since HubSpot Workflow webhook actions are user-configurable and could
 * send almost anything) and imports it if — and only if — it's eligible:
 * `csm` resolves to one of the currently *active* CSMs (via
 * `canonicalOwnerId`, so either email-domain variant of a duplicate owner
 * still counts) AND it has purchased the Pro or Base website product
 * (2026-08-28/29 decision — same rule as the Overview page's baseline
 * visibility filter, see `listClients`).
 */
export async function tryAutoImportCompany(env: CloudflareBindings, hubspotCompanyId: string): Promise<AutoImportResult> {
	const supabase = createSupabaseClient(env);

	const existing = await supabase.from("clients").select("id").eq("hubspot_company_id", hubspotCompanyId).maybeSingle();
	if (existing.error) throw new Error(existing.error.message);
	if (existing.data) return { status: "already_imported", clientId: (existing.data as { id: string }).id };

	const result = await fetchCompanySyncProperties(env, hubspotCompanyId);
	if (result.status === "not_found") return { status: "not_found" };
	const props = result.properties;

	const [activeCsms, ownerLinks, statuses] = await Promise.all([listCsms(supabase), listCsmsWithOwnerId(supabase), listStatuses(supabase)]);
	const activeCsmIds = new Set(activeCsms.map((c) => c.id));
	const activeCsmByOwnerId = new Map(ownerLinks.filter((o) => activeCsmIds.has(o.id)).map((o) => [o.hubspotOwnerId, o.id]));

	const csmId = props.csm ? activeCsmByOwnerId.get(canonicalOwnerId(props.csm)) : undefined;
	if (!csmId) return { status: "ineligible", reason: `csm "${props.csm ?? "(none)"}" is not one of the active CSMs` };

	const purchasedProWebsite = props.website___purchased_pro_website === "true";
	const purchasedBaseWebsite = props.website___purchased_base_website === "true";
	if (!purchasedProWebsite && !purchasedBaseWebsite) {
		return { status: "ineligible", reason: "no Pro or Base website product purchased" };
	}

	const client = await createClientFromHubspot(supabase, {
		hubspotCompanyId,
		name: props.name ?? "Untitled",
		website: props.domain ?? null,
		population: props.service_area_population ? Number(props.service_area_population) : null,
		domainAuthority: props.domain_authority ? Number(props.domain_authority) : null,
		csmId,
		defaultStatusId: statuses[0].id,
		purchasedProWebsite,
		purchasedBaseWebsite,
	});
	return { status: "imported", clientId: client.id };
}
