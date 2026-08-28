import { html, raw } from "hono/html";
import type { ClientRow, Status } from "../data/types";
import { renderStatusAvatar } from "./statusAvatar";
import { renderStatusDropdown } from "./statusDropdown";
import { displayWebsite, formatInteger, formatPlain, websiteHref } from "./format";
import { iconPaths } from "../../components/icons/icon-names";

/**
 * Client detail page header (PRD §9/§25), matching the client-page design
 * reference: status name inline next to the website (not just the icon),
 * CSM as a top-right chip, four stats below (Ad Spend/mo joins once Phase
 * 5 Paid Ads data exists — PRD §11). Name/Website/Population/Domain
 * Authority/CSM are HubSpot-owned (read-only, PRD §14/§15); Status remains
 * the one editable control, reusing the same avatar+dropdown as the
 * Overview card (PRD §19), just re-targeted at this header via
 * `view: "header"` instead of `view: "card"`.
 */
export function renderClientHeader(client: ClientRow, statuses: Status[]) {
	const site = websiteHref(client.website);

	return html`<div id="client-header" class="rounded-2xl border border-card-border bg-surface p-6 shadow-sm">
		<div class="flex items-start justify-between gap-4">
			<div class="flex items-start gap-4">
				<div class="relative" x-data="{ open: false }">
					<button
						type="button"
						x-on:click="open = !open"
						x-bind:aria-expanded="open.toString()"
						aria-haspopup="true"
						class="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
					>
						${renderStatusAvatar(client.status)}
					</button>
					${renderStatusDropdown(client.id, statuses, client.status.id, { target: "#client-header", view: "header" })}
				</div>

				<div class="min-w-0">
					<h1 class="font-sans text-[26px] font-semibold tracking-[-0.02em] text-ink">${client.name}</h1>
					<div class="mt-0.5 flex items-center gap-1.5 font-mono text-[13px]">
						${
							site
								? html`<a href="${site}" target="_blank" rel="noopener noreferrer" class="text-link hover:underline"
									 >${displayWebsite(client.website)}</a>`
								: html`<span class="text-muted">${displayWebsite(client.website)}</span>`
						}
						<span class="text-muted">·</span>
						<span class="text-muted">${client.status.name}</span>
						${
							client.hubspotSyncedAt
								? html`<span class="text-muted" title="Synced from HubSpot ${new Date(client.hubspotSyncedAt).toLocaleString()}"
										>· synced</span
									>`
								: ""
						}
						${
							client.hubspotCompanyId
								? html`<span class="text-muted">·</span>
									<span x-data="{ confirming: false }">
										<button
											type="button"
											x-show="!confirming"
											x-on:click="confirming = true"
											class="text-muted hover:underline"
										>
											unlink
										</button>
										<span x-show="confirming" x-cloak class="whitespace-nowrap">
											<button
												type="button"
												hx-post="/api/clients/${client.id}/hubspot-unlink"
												hx-target="#client-header"
												hx-swap="outerHTML"
												class="font-medium text-needs-attention-text hover:underline"
											>
												Confirm unlink
											</button>
											<button type="button" x-on:click="confirming = false" class="ml-1 text-muted hover:underline">Cancel</button>
										</span>
									</span>`
								: ""
						}
					</div>
				</div>
			</div>

			<span class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zebra-row px-3 py-1.5 text-[13px] text-ink">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"
					>${raw(iconPaths.user)}</svg
				>
				${client.csm ? client.csm.name : "Unassigned"}
			</span>
		</div>

		<div class="mt-5 grid grid-cols-2 gap-4 border-t border-row-rule pt-4 sm:grid-cols-4">
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">State</div>
				<div class="mt-1 font-mono text-[13px] text-ink">${formatPlain(client.stateCode)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Population</div>
				<div class="mt-1 font-mono text-[13px] text-ink">${formatInteger(client.population)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Domain Authority</div>
				<div class="mt-1 font-mono text-[13px] text-ink">${formatInteger(client.domainAuthority)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Legal Status</div>
				<div class="mt-1 font-mono text-[13px] text-ink">${formatPlain(client.legalStatus)}</div>
			</div>
		</div>
	</div>`;
}
