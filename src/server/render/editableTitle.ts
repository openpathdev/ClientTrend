import { html } from "hono/html";

/**
 * A section heading the CSM can rename in place: click the title to edit it,
 * Enter or leaving the field saves, Escape cancels. The PATCH route returns
 * this same fragment, which replaces itself. Used for the Paid Ads title and
 * each Campaigns section's title.
 *
 * `value` is what's stored ("" when unset); `fallback` is what shows when it's
 * blank. When `fallbackIsDefault` is true, the fallback is a real default
 * name ("Paid Ads") shown in normal text; otherwise it's a muted italic
 * placeholder prompting a rename ("Untitled section").
 */
export function renderEditableTitle(params: {
	value: string;
	fallback: string;
	fallbackIsDefault?: boolean;
	endpoint: string;
	ariaLabel: string;
	/** Extra form fields sent with the save, e.g. the loaded month window. */
	vals?: Record<string, string>;
	error?: string;
}) {
	const { value, fallback, fallbackIsDefault = false, endpoint, ariaLabel, vals, error } = params;
	const muted = !value && !fallbackIsDefault;
	return html`<span class="editable-title flex items-center gap-2" x-data="{ editing: false }">
		<h2 x-show="!editing" class="font-sans text-[15px] font-semibold tracking-[-0.01em] ${muted ? "italic text-muted" : "text-ink"}">
			<button type="button" x-on:click="editing = true; $nextTick(() => $refs.title.select())" class="text-left hover:underline" title="Click to rename">
				${value || fallback}
			</button>
		</h2>
		<input
			x-show="editing"
			x-cloak
			x-ref="title"
			x-on:blur="editing = false"
			x-on:keydown.escape="editing = false; $el.value = $el.defaultValue"
			type="text"
			name="name"
			value="${value || (fallbackIsDefault ? fallback : "")}"
			maxlength="200"
			placeholder="${fallback}"
			aria-label="${ariaLabel}"
			hx-patch="${endpoint}"
			${vals ? html`hx-vals='${JSON.stringify(vals)}'` : ""}
			hx-trigger="change, keyup[key=='Enter']"
			hx-target="closest .editable-title"
			hx-swap="outerHTML"
			class="w-[260px] rounded border border-card-border px-2 py-0.5 font-sans text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-selected-filter"
		/>
		${error ? html`<span class="text-[11.5px] font-normal text-needs-attention-text" role="alert">${error}</span>` : ""}
	</span>`;
}
