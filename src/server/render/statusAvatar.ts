import { html, raw } from "hono/html";
import { iconPaths } from "../../components/icons/icon-names";
import type { Status } from "../data/types";

/**
 * The colored avatar ring used on cards and as the status-dropdown trigger
 * (PRD §6/§8; ClientTrends-StyleGuide.pdf "Status in use → Avatar ring").
 * Built from the same four status values as the card and filter chip.
 */
export function renderStatusAvatar(status: Status, options: { size?: "md" | "sm" } = {}) {
	const size = options.size ?? "md";
	const dimension = size === "md" ? "h-14 w-14" : "h-9 w-9";
	const iconSize = size === "md" ? "text-2xl" : "text-lg";
	const path = iconPaths[status.icon] ?? iconPaths.like;

	return html`<span
		class="inline-flex ${dimension} shrink-0 items-center justify-center rounded-full border-2 ${iconSize}"
		style="background-color:${status.colorTint};border-color:${status.colorLine};color:${status.colorText}"
		title="${status.name}"
		aria-label="Status: ${status.name}"
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
			${raw(path)}
		</svg>
	</span>`;
}
