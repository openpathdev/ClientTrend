import { html } from "hono/html";
import type { HubspotSearchResultCompany } from "../hubspot";
import { formatInteger, formatPlain } from "./format";

/**
 * Client Import / Matching (PRD §14/§36) — the only way a new client is
 * created. Search hits HubSpot live (not Supabase) since eligible companies
 * not yet imported don't exist in our database at all. Each result row is
 * independently swappable by id so importing one company doesn't disturb
 * the rest of the list or reset the search box.
 */
function renderResultRow(company: HubspotSearchResultCompany, alreadyImported: boolean) {
	const rowId = `hubspot-result-${company.id}`;
	const props = company.properties;
	return html`<div id="${rowId}" class="flex items-center justify-between gap-3 border-b border-row-rule py-3 last:border-b-0">
		<div class="min-w-0">
			<p class="truncate font-sans text-[13.5px] font-medium text-ink">${formatPlain(props.name)}</p>
			<p class="font-mono text-[11.5px] text-muted">
				${formatPlain(props.domain)} · Pop. ${formatInteger(props.service_area_population ? Number(props.service_area_population) : null)} · DA ${formatInteger(props.domain_authority ? Number(props.domain_authority) : null)}
			</p>
		</div>
		${
			alreadyImported
				? html`<span class="shrink-0 rounded-full bg-zebra-row px-3 py-1.5 text-[12px] text-muted">Already imported</span>`
				: html`<button
						type="button"
						hx-post="/api/admin/hubspot-companies/${company.id}/import"
						hx-target="#${rowId}"
						hx-swap="outerHTML"
						class="shrink-0 rounded-md bg-selected-filter px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
					>
						Import
					</button>`
		}
	</div>`;
}

export function renderImportedRow(hubspotCompanyId: string, clientId: string) {
	return html`<div
		id="hubspot-result-${hubspotCompanyId}"
		class="flex items-center justify-between gap-3 border-b border-row-rule py-3 last:border-b-0"
	>
		<span class="text-[13px] text-ink">Imported ✓</span>
		<a href="/clients/${clientId}" class="shrink-0 text-[12.5px] font-medium text-link hover:underline">View client &rarr;</a>
	</div>`;
}

export function renderHubspotResults(
	results: HubspotSearchResultCompany[],
	importedIds: Set<string>,
	error?: string,
) {
	if (error) {
		return html`<p class="py-3 text-[12.5px] text-needs-attention-text" role="alert">${error}</p>`;
	}
	if (results.length === 0) {
		return html`<p class="py-3 text-[13px] text-muted">No eligible HubSpot companies matched.</p>`;
	}
	return html`${results.map((c) => renderResultRow(c, importedIds.has(c.id)))}`;
}

export function renderHubspotImportPanel() {
	return html`<section id="hubspot-import-panel" class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
		<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">Import a client from HubSpot</h2>
		<p class="mt-1 text-[12.5px] text-muted">
			Only companies eligible for import are shown — those with a purchased website property set in HubSpot (PRD §14).
		</p>
		<input
			type="search"
			name="q"
			aria-label="Search HubSpot companies by name or domain"
			placeholder="Search by company name or domain…"
			hx-get="/api/admin/hubspot-companies"
			hx-trigger="input changed delay:400ms, search"
			hx-target="#hubspot-import-results"
			hx-swap="innerHTML"
			hx-indicator="#hubspot-import-loading"
			class="mt-3 w-full rounded-md border border-card-border px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
		/>
		<span id="hubspot-import-loading" class="htmx-indicator mt-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-card-border border-t-ink" role="status" aria-label="Searching"></span>
		<div id="hubspot-import-results" class="mt-2"></div>
	</section>`;
}
