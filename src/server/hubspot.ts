import type { CloudflareBindings } from "./bindings";

/**
 * Thin server-only HubSpot API client (PRD §14, §24). Every call here is
 * made only from the sync route (`POST /api/admin/hubspot-sync/run`,
 * triggered by an external cron — see that route's comment for why this
 * isn't a native Cloudflare Cron Trigger), never from a user-facing page
 * render.
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

export class HubspotRateLimitError extends Error {
	constructor(public retryAfterSeconds: number) {
		super(`HubSpot rate limited; retry after ${retryAfterSeconds}s`);
	}
}

async function hubspotFetch(env: CloudflareBindings, path: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(`${HUBSPOT_BASE}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${env.HUBSPOT_API_TOKEN}`, ...(init?.headers ?? {}) },
	});
	if (res.status === 429) {
		const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
		throw new HubspotRateLimitError(retryAfter);
	}
	return res;
}

export type HubspotOwner = {
	id: string;
	email: string | null;
	firstName: string | null;
	lastName: string | null;
	archived: boolean;
};

/** Paginates through the full Owners list — typically small (dozens, not thousands), so no need to cap pages. */
export async function fetchAllOwners(env: CloudflareBindings): Promise<HubspotOwner[]> {
	const owners: HubspotOwner[] = [];
	let after: string | undefined;
	do {
		const query = after ? `?after=${after}&limit=100` : "?limit=100";
		const res = await hubspotFetch(env, `/crm/v3/owners${query}`);
		if (!res.ok) throw new Error(`Owners fetch failed: HTTP ${res.status}`);
		const body = (await res.json()) as { results: HubspotOwner[]; paging?: { next?: { after: string } } };
		owners.push(...body.results);
		after = body.paging?.next?.after;
	} while (after);
	return owners;
}

export type HubspotSearchResultCompany = {
	id: string;
	properties: Record<string, string | null>;
};

const IMPORT_ELIGIBILITY_PROPERTIES = ["purchased_website", "website___purchased_pro_website", "website___purchased_base_website"];

/**
 * Searches HubSpot companies eligible for import (PRD §14/§36): any of the
 * 3 purchase properties is true, optionally further narrowed by a free-text
 * `query` (HubSpot's search endpoint matches this against a company's
 * default searchable properties, which includes name/domain). The 3
 * eligibility properties are OR'd via 3 separate filterGroups (HubSpot
 * ANDs filters within one group, ORs across groups) — there is no single
 * "any of these 3 is true" filter operator.
 */
export async function searchEligibleCompanies(env: CloudflareBindings, query: string): Promise<HubspotSearchResultCompany[]> {
	const res = await hubspotFetch(env, "/crm/v3/objects/companies/search", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			query: query || undefined,
			filterGroups: IMPORT_ELIGIBILITY_PROPERTIES.map((propertyName) => ({
				filters: [{ propertyName, operator: "EQ", value: "true" }],
			})),
			properties: ["name", "domain", "service_area_population", "domain_authority", "csm"],
			limit: 20,
		}),
	});
	if (!res.ok) throw new Error(`Company search failed: HTTP ${res.status}`);
	const body = (await res.json()) as { results: HubspotSearchResultCompany[] };
	return body.results;
}

export type HubspotCompanyResult =
	| { status: "ok"; properties: Record<string, string | null> }
	| { status: "not_found" };

const COMPANY_SYNC_PROPERTIES = ["name", "domain", "service_area_population", "domain_authority", "csm"];

/** Fetches the simple, directly-mapped Company properties (PRD §14) — never `her_journey_org_data`, see scripts/sync_org_data.py for why that's handled separately. Website product eligibility is NOT among these — see `fetchSubscriptionEligibility` below for why. */
export async function fetchCompanySyncProperties(env: CloudflareBindings, hubspotCompanyId: string): Promise<HubspotCompanyResult> {
	const res = await hubspotFetch(
		env,
		`/crm/v3/objects/companies/${hubspotCompanyId}?properties=${COMPANY_SYNC_PROPERTIES.join(",")}`,
	);
	if (res.status === 404) return { status: "not_found" };
	if (!res.ok) throw new Error(`Company ${hubspotCompanyId} fetch failed: HTTP ${res.status}`);
	const body = (await res.json()) as { properties: Record<string, string | null>; archived?: boolean };
	if (body.archived) return { status: "not_found" };
	return { status: "ok", properties: body.properties };
}

export type SubscriptionEligibility = { purchasedProWebsite: boolean; purchasedBaseWebsite: boolean };

const WEBSITE_LINE_ITEM_NAMES = new Set(["Website: Pro Package", "Website: Base Package"]);

/**
 * Determines website-product eligibility from a company's actual HubSpot
 * commerce data (Subscriptions → Line Items), NOT the manually-maintained
 * `website___purchased_pro_website`/`website___purchased_base_website`
 * Company properties this originally used (2026-08-29 decision, after
 * finding two real companies where those properties were simply never
 * set despite an active subscription, AND finding a third — Alpha
 * Women's Center — where the property said "Pro" but its actual
 * subscription's line items only contained "Website: Base Package").
 * Only ACTIVE subscriptions count; only the exact line-item names
 * "Website: Pro Package"/"Website: Base Package" count — every other
 * line item (add-ons, grants, PPC, etc.) is disregarded per the user's
 * explicit instruction, even though a subscription's own `hs_name` often
 * only shows one bundled item plus "+ N more" and can't be trusted alone.
 *
 * Uses batch-read endpoints throughout (subscriptions batch/read, the v4
 * batch associations endpoint, line_items batch/read) specifically to
 * keep this to ~4 HubSpot API calls per company regardless of how many
 * subscriptions/line items exist — Cloudflare's per-invocation subrequest
 * ceiling was already hit once during the bulk-import backfill, and this
 * check runs on every sync/import, so per-company call count matters.
 */
export async function fetchSubscriptionEligibility(env: CloudflareBindings, hubspotCompanyId: string): Promise<SubscriptionEligibility> {
	const none: SubscriptionEligibility = { purchasedProWebsite: false, purchasedBaseWebsite: false };

	const assocRes = await hubspotFetch(env, `/crm/v4/objects/companies/${hubspotCompanyId}/associations/subscriptions`);
	if (!assocRes.ok) throw new Error(`Subscription associations fetch failed: HTTP ${assocRes.status}`);
	const assocBody = (await assocRes.json()) as { results: { toObjectId: number }[] };
	const subscriptionIds = assocBody.results.map((r) => String(r.toObjectId));
	if (subscriptionIds.length === 0) return none;

	const statusRes = await hubspotFetch(env, "/crm/v3/objects/subscriptions/batch/read", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ properties: ["hs_is_status_active"], inputs: subscriptionIds.map((id) => ({ id })) }),
	});
	if (!statusRes.ok) throw new Error(`Subscription batch read failed: HTTP ${statusRes.status}`);
	const statusBody = (await statusRes.json()) as { results: { id: string; properties: { hs_is_status_active: string | null } }[] };
	const activeSubscriptionIds = statusBody.results.filter((r) => r.properties.hs_is_status_active === "1").map((r) => r.id);
	if (activeSubscriptionIds.length === 0) return none;

	const lineItemAssocRes = await hubspotFetch(env, "/crm/v4/associations/subscriptions/line_items/batch/read", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ inputs: activeSubscriptionIds.map((id) => ({ id })) }),
	});
	if (!lineItemAssocRes.ok) throw new Error(`Subscription line-item associations batch read failed: HTTP ${lineItemAssocRes.status}`);
	const lineItemAssocBody = (await lineItemAssocRes.json()) as { results: { from: { id: string }; to: { toObjectId: number }[] }[] };
	const lineItemIds = [...new Set(lineItemAssocBody.results.flatMap((r) => r.to.map((t) => String(t.toObjectId))))];
	if (lineItemIds.length === 0) return none;

	const lineItemRes = await hubspotFetch(env, "/crm/v3/objects/line_items/batch/read", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ properties: ["name"], inputs: lineItemIds.map((id) => ({ id })) }),
	});
	if (!lineItemRes.ok) throw new Error(`Line item batch read failed: HTTP ${lineItemRes.status}`);
	const lineItemBody = (await lineItemRes.json()) as { results: { properties: { name: string | null } }[] };
	const names = new Set(lineItemBody.results.map((r) => r.properties.name).filter((n): n is string => n !== null && WEBSITE_LINE_ITEM_NAMES.has(n)));

	return {
		purchasedProWebsite: names.has("Website: Pro Package"),
		purchasedBaseWebsite: names.has("Website: Base Package"),
	};
}
