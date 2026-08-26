import { html } from "hono/html";
import type { ClientFilters, ClientRow, Csm, StateRef, Status } from "../data/types";
import { renderClientCard } from "./card";

function filterQuery(filters: ClientFilters, overrides: Partial<ClientFilters> = {}) {
	const merged = { ...filters, ...overrides };
	const params = new URLSearchParams();
	if (merged.csmId) params.set("csm", merged.csmId);
	if (merged.statusId) params.set("status", merged.statusId);
	if (merged.stateCode) params.set("state", merged.stateCode);
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

function chipClass(active: boolean) {
	return active
		? "bg-selected-filter text-white border-selected-filter"
		: "bg-surface text-ink border-card-border hover:bg-zebra-row";
}

function renderStatusChips(statuses: Status[], filters: ClientFilters) {
	const allActive = !filters.statusId;
	return html`<button
			type="button"
			hx-get="/partials/clients${filterQuery(filters, { statusId: undefined })}"
			hx-target="#overview-panel"
			hx-swap="outerHTML"
			hx-indicator="#overview-loading"
			hx-push-url="${filterQuery(filters, { statusId: undefined }) || "/"}"
			class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${chipClass(allActive)}"
		>All statuses</button>
		${statuses.map((status) => {
			const active = filters.statusId === status.id;
			const style = active ? "" : `background-color:${status.colorTint};border-color:${status.colorLine};color:${status.colorText}`;
			return html`<button
				type="button"
				hx-get="/partials/clients${filterQuery(filters, { statusId: status.id })}"
				hx-target="#overview-panel"
				hx-swap="outerHTML"
				hx-push-url="${filterQuery(filters, { statusId: status.id })}"
				style="${style}"
				class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${chipClass(active)}"
			>
				<span class="h-2 w-2 rounded-full" style="background-color:${active ? "currentColor" : status.colorLine}"></span>
				${status.name}
			</button>`;
		})}`;
}

function renderCsmChips(csms: Csm[], filters: ClientFilters) {
	const allActive = !filters.csmId;
	return html`<button
			type="button"
			hx-get="/partials/clients${filterQuery(filters, { csmId: undefined })}"
			hx-target="#overview-panel"
			hx-swap="outerHTML"
			hx-indicator="#overview-loading"
			hx-push-url="${filterQuery(filters, { csmId: undefined }) || "/"}"
			class="rounded-full border px-3 py-1.5 text-[13px] font-medium ${chipClass(allActive)}"
		>All CSMs</button>
		${csms.map((csm) => {
			const active = filters.csmId === csm.id;
			return html`<button
				type="button"
				hx-get="/partials/clients${filterQuery(filters, { csmId: csm.id })}"
				hx-target="#overview-panel"
				hx-swap="outerHTML"
				hx-push-url="${filterQuery(filters, { csmId: csm.id })}"
				class="rounded-full border px-3 py-1.5 text-[13px] font-medium ${chipClass(active)}"
			>${csm.name}</button>`;
		})}`;
}

function renderStateDropdown(states: StateRef[], filters: ClientFilters) {
	const selected = states.find((s) => s.code === filters.stateCode);
	return html`<div class="relative" x-data="{ open: false, q: '' }">
		<button
			type="button"
			x-on:click="open = !open"
			x-bind:aria-expanded="open.toString()"
			aria-haspopup="listbox"
			class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium ${chipClass(Boolean(filters.stateCode))}"
		>
			<span>${selected ? selected.name : "All states"}</span>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 15.5 5 8.5l1.4-1.4L12 12.7l5.6-5.6L19 8.5z"/></svg>
		</button>
		<div
			x-show="open"
			x-cloak
			x-transition
			x-on:click.outside="open = false"
			class="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-card-border bg-surface p-2 shadow-lg"
		>
			<input
				type="text"
				x-model="q"
				x-on:keydown.escape="open = false"
				placeholder="Search states…"
				aria-label="Search states"
				class="mb-1 w-full rounded-md border border-card-border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<div class="max-h-64 overflow-y-auto" role="listbox">
				<button
					type="button"
					hx-get="/partials/clients${filterQuery(filters, { stateCode: undefined })}"
					hx-target="#overview-panel"
					hx-swap="outerHTML"
					hx-indicator="#overview-loading"
					hx-push-url="${filterQuery(filters, { stateCode: undefined }) || "/"}"
					x-on:click="open = false"
					class="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-zebra-row"
				>All states</button>
				${states.map(
					(state) => html`<button
						type="button"
						hx-get="/partials/clients${filterQuery(filters, { stateCode: state.code })}"
						hx-target="#overview-panel"
						hx-swap="outerHTML"
						hx-indicator="#overview-loading"
						hx-push-url="${filterQuery(filters, { stateCode: state.code })}"
						x-on:click="open = false"
						x-show="q === '' || '${state.name.toLowerCase()}'.includes(q.toLowerCase()) || '${state.code.toLowerCase()}'.includes(q.toLowerCase())"
						role="option"
						class="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-zebra-row"
					>${state.name}</button>`,
				)}
			</div>
		</div>
	</div>`;
}

function renderEmptyState(hasFilters: boolean) {
	if (hasFilters) {
		return html`<div class="col-span-full rounded-2xl border border-dashed border-card-border bg-surface p-10 text-center">
			<p class="text-[14px] text-muted">No clients match the selected filters.</p>
			<a href="/" class="mt-2 inline-block text-[13px] font-medium text-link hover:underline">Clear filters</a>
		</div>`;
	}
	return html`<div class="col-span-full rounded-2xl border border-dashed border-card-border bg-surface p-10 text-center">
		<p class="text-[14px] text-muted">No clients yet.</p>
	</div>`;
}

export function renderOverviewPanel(data: {
	clients: ClientRow[];
	statuses: Status[];
	csms: Csm[];
	states: StateRef[];
	filters: ClientFilters;
}) {
	const { clients, statuses, csms, states, filters } = data;
	const hasFilters = Boolean(filters.csmId || filters.statusId || filters.stateCode);

	return html`<div id="overview-panel">
		<div class="flex flex-wrap items-center gap-2">
			${renderStatusChips(statuses, filters)}
			<span class="mx-1 h-5 w-px bg-section-rule"></span>
			${renderCsmChips(csms, filters)}
			<span class="mx-1 h-5 w-px bg-section-rule"></span>
			<span id="overview-loading" class="htmx-indicator h-4 w-4 animate-spin rounded-full border-2 border-card-border border-t-ink" role="status" aria-label="Loading"></span>
			${renderStateDropdown(states, filters)}
		</div>

		<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			${clients.length > 0 ? clients.map((client) => renderClientCard(client, statuses)) : renderEmptyState(hasFilters)}
		</div>
	</div>`;
}
