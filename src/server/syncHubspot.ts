import type { CloudflareBindings } from "./bindings";
import { createSupabaseClient } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllOwners, fetchCompanySyncProperties, searchCompanyIdsByCsm, fetchSubscriptionEligibility, normalizeHubspotText, parseHubspotInteger, resolveStateCode, HubspotRateLimitError } from "./hubspot";
import { upsertCsmFromOwner, listCsmsWithOwnerId, listCsms, canonicalOwnerId, ownerIdVariants } from "./data/csms";
import { listStatuses } from "./data/statuses";
import {
	listHubspotLinkedClients,
	applyHubspotSync,
	markHubspotSyncStatus,
	createClientFromHubspot,
	listImportedHubspotCompanyIds,
} from "./data/clients";
import { createSyncRun, finishSyncRun, incrementSyncRunCounts, logSyncResult } from "./data/hubspotSyncLog";

const MAX_RATE_LIMIT_RETRIES = 3;

// Each client now costs up to ~7 HubSpot/Supabase subrequests (1 property
// fetch + up to 4 for fetchSubscriptionEligibility + 2 log/write calls), so a
// single Worker invocation can't get through all ~40+ linked clients before
// hitting Cloudflare's ~50-subrequest-per-invocation ceiling (confirmed live,
// 2026-08-29, the same limit hit during the bulk-import backfill). Instead
// this processes one bounded batch per invocation and, if clients remain,
// chains to a fresh invocation of itself (see the route in app.ts) — each
// invocation gets its own subrequest budget. The Owners roster sync (~25
// owners, 1 Supabase upsert each) is kept as its own separate first
// invocation for the same reason — combined with even one client's worth of
// calls it was enough to blow the ceiling on its own (confirmed live).
const BATCH_SIZE = 5;

// Catch-up candidates cost up to ~7 subrequests each (1 property fetch, up
// to 4 for fetchSubscriptionEligibility, 2 to create the client), plus ~6
// fixed per invocation (search, imported list, CSM/status lookups, run
// counts) — 4 per invocation keeps well under the ~50 ceiling.
const CATCHUP_BATCH_SIZE = 4;

export type SyncStepResult = {
	runId: string;
	clientsProcessed: number;
	clientsFailed: number;
	status: "succeeded" | "failed" | "partial" | "more";
	/** Set with status "more": the next client batch to process. */
	nextCursor?: number;
	/** Set with status "more": the next invocation is the catch-up import, starting after company id `nextAfter` (absent = from the start). */
	nextPhase?: "catchup";
	nextAfter?: string;
};

function finalStatus(totals: { clientsProcessed: number; clientsFailed: number }): "succeeded" | "failed" | "partial" {
	return totals.clientsFailed === 0 ? "succeeded" : totals.clientsProcessed === 0 ? "failed" : "partial";
}

/**
 * Syncs the 5 simple Company properties + CSM assignment + subscription
 * eligibility for one bounded batch of HubSpot-linked clients, starting at
 * `cursor` (an index into the deterministically-ordered linked-clients
 * list), plus the HubSpot Owners roster on the first batch only (PRD §14).
 * Deliberately does NOT touch `her_journey_org_data` — that 20MB+ file
 * property is handled by the separate `scripts/sync_org_data.py`, run
 * outside the Worker (see that script's docstring for why).
 *
 * Triggered by `POST /api/admin/hubspot-sync/run`, itself called by an
 * external cron (Astro's Cloudflare adapter has no `scheduled()` hook to
 * attach a native Cloudflare Cron Trigger to — see that route for detail).
 * The route self-chains through remaining batches via `waitUntil`, so the
 * external cron only needs to fire this once per sync.
 */
export async function runHubspotSync(
	env: CloudflareBindings,
	options?: { cursor?: number; runId?: string },
): Promise<SyncStepResult> {
	const supabase = createSupabaseClient(env);
	const runId = options?.runId ?? (await createSyncRun(supabase));

	if (options?.cursor === undefined) {
		// Phase 1: sync the Owners roster (PRD §14) — must happen before any
		// Company/client batch, since csm resolution below depends on
		// csms.hubspot_owner_id already being fresh. Kept as its own
		// invocation: with ~25 owners (1 Supabase upsert each), this alone
		// leaves no subrequest budget to also process a batch of clients in
		// the same call (confirmed live, 2026-08-29).
		try {
			const owners = await fetchAllOwners(env);
			for (const owner of owners) {
				if (owner.archived) continue;
				const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || (owner.email ?? "Unknown Owner");
				await upsertCsmFromOwner(supabase, { hubspotOwnerId: owner.id, name, email: owner.email });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await finishSyncRun(supabase, runId, { status: "failed", errorSummary: message });
			return { runId, clientsProcessed: 0, clientsFailed: 0, status: "failed" };
		}
		return { runId, clientsProcessed: 0, clientsFailed: 0, status: "more", nextCursor: 0 };
	}

	const cursor = options.cursor;
	let clientsProcessed = 0;
	let clientsFailed = 0;
	let rateLimited = false;

	try {
		const csmByOwnerId = new Map((await listCsmsWithOwnerId(supabase)).map((c) => [c.hubspotOwnerId, c.id]));
		const allClients = await listHubspotLinkedClients(supabase);
		const batch = allClients.slice(cursor, cursor + BATCH_SIZE);

		let consumed = 0;
		for (const client of batch) {
			if (rateLimited) break;
			consumed++;

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

					const eligibility = await fetchSubscriptionEligibility(env, client.hubspotCompanyId);

					await applyHubspotSync(supabase, client.id, {
						name: props.name ?? client.name,
						website: props.domain ?? null,
						population: props.service_area_population ? Number(props.service_area_population) : null,
						domainAuthority: props.domain_authority ? Number(props.domain_authority) : null,
						stateCode: resolveStateCode(props.state, props.hs_state_code),
						legalStatus: normalizeHubspotText(props.legal_status),
						csmId,
						purchasedProWebsite: eligibility.purchasedProWebsite,
						purchasedBaseWebsite: eligibility.purchasedBaseWebsite,
						newClientGoal: parseHubspotInteger(props.hj_new_client_goal),
						amadGoal: parseHubspotInteger(props.hj_amad_goal),
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

		const totals = await incrementSyncRunCounts(supabase, runId, clientsProcessed, clientsFailed);
		const nextCursor = cursor + consumed;
		const hasMore = !rateLimited && nextCursor < allClients.length;

		if (hasMore) {
			return { runId, clientsProcessed, clientsFailed, status: "more", nextCursor };
		}

		// All linked clients done — hand off to the catch-up import (its own
		// invocation(s), for subrequest budget). Skipped when HubSpot is
		// rate-limiting us: the catch-up would only add more calls.
		if (!rateLimited) {
			return { runId, clientsProcessed, clientsFailed, status: "more", nextPhase: "catchup" };
		}

		const status = finalStatus(totals);
		await finishSyncRun(supabase, runId, { status });
		return { runId, clientsProcessed: totals.clientsProcessed, clientsFailed: totals.clientsFailed, status };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await finishSyncRun(supabase, runId, { status: "failed", errorSummary: message });
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
 * still counts) AND it has an active subscription with a "Website: Pro
 * Package"/"Website: Base Package" line item (2026-08-29 decision — see
 * `fetchSubscriptionEligibility`'s doc comment for why this isn't the
 * simpler Company-property check it started as).
 */
export async function tryAutoImportCompany(env: CloudflareBindings, hubspotCompanyId: string): Promise<AutoImportResult> {
	const supabase = createSupabaseClient(env);

	const existing = await supabase.from("clients").select("id").eq("hubspot_company_id", hubspotCompanyId).maybeSingle();
	if (existing.error) throw new Error(existing.error.message);
	if (existing.data) return { status: "already_imported", clientId: (existing.data as { id: string }).id };

	return importCompanyIfEligible(env, supabase, hubspotCompanyId, await loadAutoImportContext(supabase));
}

type AutoImportContext = {
	/** HubSpot Owner id -> csms.id, active CSMs only (canonical owner ids; resolve a company's `csm` through `canonicalOwnerId` first). */
	activeCsmByOwnerId: Map<string, string>;
	defaultStatusId: string;
};

async function loadAutoImportContext(supabase: SupabaseClient): Promise<AutoImportContext> {
	const [activeCsms, ownerLinks, statuses] = await Promise.all([listCsms(supabase), listCsmsWithOwnerId(supabase), listStatuses(supabase)]);
	const activeCsmIds = new Set(activeCsms.map((c) => c.id));
	return {
		activeCsmByOwnerId: new Map(ownerLinks.filter((o) => activeCsmIds.has(o.id)).map((o) => [o.hubspotOwnerId, o.id])),
		defaultStatusId: statuses[0].id,
	};
}

/** The eligibility check + import shared by the webhook auto-import and the daily catch-up (see `tryAutoImportCompany`'s doc comment for the rules). Assumes the caller already knows the company isn't imported yet. */
async function importCompanyIfEligible(
	env: CloudflareBindings,
	supabase: SupabaseClient,
	hubspotCompanyId: string,
	ctx: AutoImportContext,
): Promise<AutoImportResult> {
	const result = await fetchCompanySyncProperties(env, hubspotCompanyId);
	if (result.status === "not_found") return { status: "not_found" };
	const props = result.properties;

	const csmId = props.csm ? ctx.activeCsmByOwnerId.get(canonicalOwnerId(props.csm)) : undefined;
	if (!csmId) return { status: "ineligible", reason: `csm "${props.csm ?? "(none)"}" is not one of the active CSMs` };

	const { purchasedProWebsite, purchasedBaseWebsite } = await fetchSubscriptionEligibility(env, hubspotCompanyId);
	if (!purchasedProWebsite && !purchasedBaseWebsite) {
		return { status: "ineligible", reason: "no active Website: Pro/Base Package subscription" };
	}

	const client = await createClientFromHubspot(supabase, {
		hubspotCompanyId,
		name: props.name ?? "Untitled",
		website: props.domain ?? null,
		population: props.service_area_population ? Number(props.service_area_population) : null,
		domainAuthority: props.domain_authority ? Number(props.domain_authority) : null,
		stateCode: resolveStateCode(props.state, props.hs_state_code),
		legalStatus: normalizeHubspotText(props.legal_status),
		csmId,
		defaultStatusId: ctx.defaultStatusId,
		purchasedProWebsite,
		purchasedBaseWebsite,
		newClientGoal: parseHubspotInteger(props.hj_new_client_goal),
		amadGoal: parseHubspotInteger(props.hj_amad_goal),
	});
	return { status: "imported", clientId: client.id };
}

/** HubSpot object ids are numeric strings, too long to compare safely as numbers. */
function compareHubspotIds(a: string, b: string): number {
	return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Final phase of every sync run (2026-10-06): imports companies that are
 * eligible but were never imported. Auto-import only fires when a
 * company's `csm` *changes* (webhook), so a company that became eligible
 * before the webhook existed — or whose change event never arrived — was
 * never picked up (found: HOPE CENTER of LIVINGSTON COUNTY and Nest
 * Pregnancy Care, both csm set before the webhook went live). Candidates
 * are companies whose `csm` is an active CSM (either duplicate-owner
 * variant) and that aren't imported yet; each goes through exactly the
 * same check as the webhook (`importCompanyIfEligible`). Processes
 * CATCHUP_BATCH_SIZE candidates per invocation, ascending by company id,
 * resuming after `afterId`; the route self-chains while more remain.
 * Imports count toward the run's clients_processed and are logged.
 */
export async function runCatchupImport(env: CloudflareBindings, runId: string, afterId?: string): Promise<SyncStepResult> {
	const supabase = createSupabaseClient(env);
	let imported = 0;
	let failed = 0;
	try {
		const ctx = await loadAutoImportContext(supabase);
		const ownerIds = ownerIdVariants([...ctx.activeCsmByOwnerId.keys()]);
		const [companyIds, importedIds] = await Promise.all([
			searchCompanyIdsByCsm(env, ownerIds),
			listImportedHubspotCompanyIds(supabase),
		]);
		const candidates = companyIds
			.filter((id) => !importedIds.has(id) && (afterId === undefined || compareHubspotIds(id, afterId) > 0))
			.sort(compareHubspotIds);
		const batch = candidates.slice(0, CATCHUP_BATCH_SIZE);

		for (const companyId of batch) {
			try {
				const result = await importCompanyIfEligible(env, supabase, companyId, ctx);
				if (result.status === "imported") {
					imported++;
					await logSyncResult(supabase, runId, result.clientId, "synced", `Imported by daily catch-up (HubSpot company ${companyId})`);
				}
			} catch (err) {
				failed++;
				console.error(`Catch-up import of HubSpot company ${companyId} failed:`, err);
			}
		}

		const totals = await incrementSyncRunCounts(supabase, runId, imported, failed);
		if (candidates.length > batch.length) {
			return { runId, clientsProcessed: imported, clientsFailed: failed, status: "more", nextPhase: "catchup", nextAfter: batch[batch.length - 1] };
		}
		const status = finalStatus(totals);
		await finishSyncRun(supabase, runId, { status });
		return { runId, clientsProcessed: totals.clientsProcessed, clientsFailed: totals.clientsFailed, status };
	} catch (err) {
		// The regular sync already finished; a catch-up failure shouldn't
		// mark that work failed, just record why the catch-up didn't run.
		const message = err instanceof Error ? err.message : String(err);
		const totals = await incrementSyncRunCounts(supabase, runId, imported, failed);
		const status = finalStatus(totals);
		await finishSyncRun(supabase, runId, { status, errorSummary: `Catch-up import failed: ${message}` });
		return { runId, clientsProcessed: totals.clientsProcessed, clientsFailed: totals.clientsFailed, status };
	}
}
