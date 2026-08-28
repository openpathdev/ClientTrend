import type { CloudflareBindings } from "./bindings";
import { createSupabaseClient } from "./supabase";
import { fetchAllOwners, fetchCompanySyncProperties, HubspotRateLimitError } from "./hubspot";
import { upsertCsmFromOwner, listCsmsWithOwnerId } from "./data/csms";
import { listHubspotLinkedClients, applyHubspotSync, markHubspotSyncStatus } from "./data/clients";
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
					const csmId = props.csm ? csmByOwnerId.get(props.csm) : undefined;
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
