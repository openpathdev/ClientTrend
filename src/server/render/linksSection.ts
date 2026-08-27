import { html } from "hono/html";
import type { Link } from "../data/types";

function renderLinkItem(clientId: string, link: Link) {
	return html`<div x-data="{ editing: false, confirming: false }" class="border-b border-row-rule py-3 last:border-b-0">
		<div x-show="!editing">
			<div class="flex items-center gap-2">
				<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="font-sans text-[13.5px] font-medium text-link hover:underline"
					>${link.title}</a
				>
				${link.category ? html`<span class="rounded-full bg-zebra-row px-2 py-0.5 text-[11px] text-muted">${link.category}</span>` : ""}
			</div>
			<div class="font-mono text-[11.5px] text-muted">${link.url}</div>
			${link.description ? html`<p class="mt-1 whitespace-pre-wrap text-[13px] text-ink">${link.description}</p>` : ""}
			<div class="mt-1.5 flex items-center gap-3">
				<button type="button" x-on:click="editing = true" class="text-[11.5px] font-medium text-link hover:underline">Edit</button>
				<button
					type="button"
					x-show="!confirming"
					x-on:click="confirming = true"
					class="text-[11.5px] font-medium text-needs-attention-text hover:underline"
				>
					Delete
				</button>
				<span x-show="confirming" x-cloak class="flex items-center gap-2 text-[11.5px]">
					<span class="text-muted">Delete this link?</span>
					<button
						type="button"
						hx-delete="/api/clients/${clientId}/links/${link.id}"
						hx-target="#links-section"
						hx-swap="outerHTML"
						class="font-medium text-needs-attention-text hover:underline"
					>
						Yes, delete
					</button>
					<button type="button" x-on:click="confirming = false" class="font-medium text-muted hover:underline">Cancel</button>
				</span>
			</div>
		</div>
		<form
			x-show="editing"
			hx-patch="/api/clients/${clientId}/links/${link.id}"
			hx-target="#links-section"
			hx-swap="outerHTML"
			class="flex flex-col gap-2"
		>
			<input
				type="text"
				name="title"
				value="${link.title}"
				required
				placeholder="Title"
				class="w-full rounded-md border border-card-border px-2 py-1.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<input
				type="url"
				name="url"
				value="${link.url}"
				required
				placeholder="https://…"
				class="w-full rounded-md border border-card-border px-2 py-1.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<div class="flex items-center gap-3">
				<button type="submit" class="text-[11.5px] font-medium text-link hover:underline">Save</button>
				<button type="button" x-on:click="editing = false" class="text-[11.5px] font-medium text-muted hover:underline">Cancel</button>
			</div>
		</form>
	</div>`;
}

export function renderLinksSection(clientId: string, links: Link[], error?: string) {
	return html`<section id="links-section" class="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
		<h2 class="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">Links</h2>

		<form hx-post="/api/clients/${clientId}/links" hx-target="#links-section" hx-swap="outerHTML" class="mt-3 flex flex-col gap-2">
			${error ? html`<p class="text-[12.5px] text-needs-attention-text" role="alert">${error}</p>` : ""}
			<input
				type="text"
				name="title"
				required
				placeholder="Title"
				class="w-full rounded-md border border-card-border px-2 py-1.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<input
				type="url"
				name="url"
				required
				placeholder="https://…"
				class="w-full rounded-md border border-card-border px-2 py-1.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-selected-filter"
			/>
			<button
				type="submit"
				class="self-start rounded-md bg-selected-filter px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
			>
				Add link
			</button>
		</form>

		<div class="mt-4">
			${
				links.length > 0
					? links.map((link) => renderLinkItem(clientId, link))
					: html`<p class="text-[13px] text-muted">No links yet.</p>`
			}
		</div>
	</section>`;
}
