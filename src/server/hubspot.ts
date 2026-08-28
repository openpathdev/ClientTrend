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

const COMPANY_SYNC_PROPERTIES = [
	"name",
	"domain",
	"service_area_population",
	"domain_authority",
	"csm",
	"website___purchased_pro_website",
	"website___purchased_base_website",
];

/** Fetches the 5 simple, directly-mapped Company properties (PRD §14) — never `her_journey_org_data`, see scripts/sync_org_data.py for why that's handled separately. */
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
