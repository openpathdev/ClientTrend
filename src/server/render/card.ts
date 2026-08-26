import { html, raw } from "hono/html";
import type { ClientRow, Status } from "../data/types";
import { renderStatusAvatar } from "./statusAvatar";
import { renderStatusDropdown } from "./statusDropdown";
import { displayWebsite, formatInteger, formatPlain, websiteHref } from "./format";
import { iconPaths } from "../../components/icons/icon-names";

/**
 * One client card (PRD §5/§8). The whole card is a clickable "stretched
 * link" to /clients/:id — a real full-size <a> sits underneath at z-0,
 * pointer-events-none on the content wrapper lets clicks fall through to
 * it everywhere except the avatar (status control) and the website link,
 * which re-enable pointer-events so they stay independently clickable
 * without nesting interactive elements inside an <a> (PRD §10/§26).
 */
export function renderClientCard(client: ClientRow, statuses: Status[]) {
	const href = `/clients/${client.id}`;
	const site = websiteHref(client.website);

	return html`<div
		id="client-card-${client.id}"
		data-client-card
		class="group relative rounded-2xl border border-card-border bg-surface p-5 shadow-sm transition hover:shadow-md"
	>
		<a href="${href}" class="absolute inset-0 z-0 rounded-2xl" aria-label="View ${client.name}"></a>

		<div class="relative z-10 pointer-events-none flex items-start gap-3">
			<div class="pointer-events-auto relative" x-data="{ open: false }">
				<button
					type="button"
					x-on:click="open = !open"
					x-bind:aria-expanded="open.toString()"
					aria-haspopup="true"
					class="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
				>
					${renderStatusAvatar(client.status)}
				</button>
				${renderStatusDropdown(client.id, statuses, client.status.id, {
					target: `#client-card-${client.id}`,
					view: "card",
				})}
			</div>
			<div class="min-w-0 pt-1">
				<h3 class="truncate font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink">${client.name}</h3>
				${
					site
						? html`<a
								href="${site}"
								target="_blank"
								rel="noopener noreferrer"
								class="pointer-events-auto font-mono text-[11.5px] text-link hover:underline"
							 >${displayWebsite(client.website)}</a>`
						: html`<span class="font-mono text-[11.5px] text-muted">${displayWebsite(client.website)}</span>`
				}
			</div>
		</div>

		<div class="relative z-10 pointer-events-none mt-4 grid grid-cols-4 gap-2">
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">State</div>
				<div class="mt-1 font-mono text-[13px] text-ink">${formatPlain(client.stateCode)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Pop.</div>
				<div class="mt-1 font-mono text-[13px] text-ink">${formatInteger(client.population)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">DA</div>
				<div class="mt-1 font-mono text-[13px] text-ink">${formatInteger(client.domainAuthority)}</div>
			</div>
			<div>
				<div class="font-sans text-[10.5px] uppercase tracking-[0.08em] text-label">Legal</div>
				<div class="mt-1 truncate font-mono text-[13px] text-ink">${formatPlain(client.legalStatus)}</div>
			</div>
		</div>

		<div class="relative z-10 pointer-events-none mt-4 flex items-center gap-2 border-t border-row-rule pt-3 text-[13px] text-muted">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">${raw(
				iconPaths.user,
			)}</svg>
			${client.csm ? client.csm.name : "Unassigned"}
		</div>
	</div>`;
}
