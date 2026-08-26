import { html } from "hono/html";
import type { Status } from "../data/types";

/**
 * The status-change dropdown opened by clicking a card's avatar (PRD §6),
 * reused on the client detail header (Phase 3). Alpine owns open/close
 * (local UI state); each option is an HTMX request that swaps the calling
 * view (`target`) back in once the update succeeds — the card grid passes
 * `view: "card"`, the detail header passes `view: "header"`, so one PATCH
 * endpoint can return the right shaped fragment for either caller (PRD §19).
 */
export function renderStatusDropdown(
	clientId: string,
	statuses: Status[],
	currentStatusId: string,
	options: { target: string; view: "card" | "header" },
) {
	return html`<div
		x-show="open"
		x-cloak
		x-transition
		x-on:click.outside="open = false"
		class="absolute left-0 z-20 mt-2 w-48 rounded-lg border border-card-border bg-surface py-1 shadow-lg"
		role="menu"
	>
		${statuses.map(
			(status) => html`<button
				type="button"
				role="menuitem"
				hx-patch="/api/clients/${clientId}/status"
				hx-vals='{"statusId":"${status.id}","view":"${options.view}"}'
				hx-target="${options.target}"
				hx-swap="outerHTML"
				x-on:click="open = false"
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-zebra-row ${status.id === currentStatusId ? "font-medium" : ""}"
			>
				<span class="h-2 w-2 shrink-0 rounded-full" style="background-color:${status.colorLine}"></span>
				${status.name}
			</button>`,
		)}
	</div>`;
}
