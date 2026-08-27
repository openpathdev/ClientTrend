import { Hono } from "hono";
import { html } from "hono/html";
import type { AppEnv } from "./bindings";
import { createSupabaseClient } from "./supabase";
import { listStatuses } from "./data/statuses";
import { listCsms } from "./data/csms";
import { listStates } from "./data/states";
import { listClients, updateClientStatus, updateGeneralNotes, updatePaidAdsSettings, getClientById } from "./data/clients";
import { listChanges, createChange, updateChange, deleteChange } from "./data/changes";
import { listLinks, createLink, updateLink, deleteLink } from "./data/links";
import { listMonthlyMetrics, createMonthlyMetric } from "./data/monthlyMetrics";
import { upsertMonthlyDataValue, getMonthlyDataValue, setMonthlyDataValueStatus } from "./data/monthlyData";
import { listPaidAdsMetrics, createPaidAdsMetric } from "./data/paidAdsMetrics";
import { upsertPaidAdsDataValue, getPaidAdsDataValue, setPaidAdsDataValueStatus } from "./data/paidAdsData";
import { listComments, createComment, updateComment, deleteComment } from "./data/comments";
import { renderOverviewPanel } from "./render/overviewPanel";
import { renderClientCard } from "./render/card";
import { renderClientHeader } from "./render/clientHeader";
import { renderNotesSection } from "./render/notesSection";
import { renderChangesSection } from "./render/changesSection";
import { renderLinksSection } from "./render/linksSection";
import { renderMetricCell, renderCellMarkerButton } from "./render/monthlyDataTable";
import { renderCommentPopover } from "./render/commentPanel";
import { renderMetricAdminPanel } from "./render/metricAdminPanel";
import { renderPaidAdsSettings } from "./render/paidAdsSettings";
import { isValidLinkUrl, validateLength, parseMonthlyCellValue } from "./validation";
import { CHANGE_CATEGORIES, type ChangeCategory, type ClientFilters, type CommentSection, type MonthlyMetricValueType } from "./data/types";

export const app = new Hono<AppEnv>();

/**
 * Identity is verified once, upstream, by Astro's auth middleware
 * (src/middleware.ts) — this just carries that result into Hono's
 * context so route handlers can read `c.get("userEmail")` for
 * created_by/updated_by stamping (PRD §23).
 */
app.use("*", async (c, next) => {
	const userEmail = c.env.userEmail;
	if (!userEmail) {
		const isApi = c.req.path.startsWith("/api/");
		if (isApi) return c.json({ error: "Unauthorized" }, 401);
		return c.html('<p class="text-sm text-red-600" role="alert">Unauthorized</p>', 401);
	}
	c.set("userEmail", userEmail);
	await next();
});

function readFilters(c: { req: { query: (key: string) => string | undefined } }): ClientFilters {
	return {
		csmId: c.req.query("csm") || undefined,
		statusId: c.req.query("status") || undefined,
		stateCode: c.req.query("state") || undefined,
	};
}

app.get("/api/health", (c) => c.json({ status: "ok", user: c.get("userEmail") }));

/** Filtered card-grid + filter bar fragment, used both for HTMX swaps and the initial full-page render (PRD §8, §18). */
app.get("/partials/clients", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const filters = readFilters(c);
	const [statuses, csms, states, clients] = await Promise.all([
		listStatuses(supabase),
		listCsms(supabase),
		listStates(supabase),
		listClients(supabase, filters),
	]);
	return c.html(renderOverviewPanel({ clients, statuses, csms, states, filters }));
});

/**
 * Update a client's status (PRD §6). `view` tells us which shaped fragment
 * to return: the Overview card (Phase 2) or the detail-page header
 * (Phase 3) — same underlying mutation, two different callers.
 */
app.patch("/api/clients/:id/status", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const body = await c.req.parseBody();
	const statusId = typeof body.statusId === "string" ? body.statusId : undefined;
	const view = body.view === "header" ? "header" : "card";
	if (!statusId) return c.text("Missing statusId", 400);

	const statuses = await listStatuses(supabase);
	if (!statuses.some((s) => s.id === statusId)) return c.text("Unknown status", 400);

	const updated = await updateClientStatus(supabase, clientId, statusId);
	if (!updated) return c.text("Client not found", 404);

	return c.html(view === "header" ? renderClientHeader(updated, statuses) : renderClientCard(updated, statuses));
});

// ---- General Notes (PRD §13) — a single freeform block per client, not a list ----

app.patch("/api/clients/:id/notes", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const client = await getClientById(supabase, clientId);
	if (!client) return c.text("Client not found", 404);

	const body = await c.req.parseBody();
	const noteBody = typeof body.body === "string" ? body.body : "";

	if (noteBody.length > 5000) {
		return c.html(renderNotesSection(client, "Notes must be 5,000 characters or fewer."), 400);
	}

	const updated = await updateGeneralNotes(supabase, clientId, noteBody, c.get("userEmail"));
	if (!updated) return c.text("Client not found", 404);
	return c.html(renderNotesSection(updated));
});

// ---- Changes (PRD §13) ----

function readChangeCategory(value: unknown): ChangeCategory | null {
	if (typeof value === "string" && (CHANGE_CATEGORIES as readonly string[]).includes(value)) {
		return value as ChangeCategory;
	}
	return null;
}

app.post("/api/clients/:id/changes", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const client = await getClientById(supabase, clientId);
	if (!client) return c.text("Client not found", 404);

	const body = await c.req.parseBody();
	const changeDate = typeof body.changeDate === "string" ? body.changeDate : "";
	const description = typeof body.description === "string" ? body.description : "";
	const category = readChangeCategory(body.category);
	const changes = await listChanges(supabase, clientId);

	if (!changeDate || !validateLength(description, 1, 5000)) {
		return c.html(renderChangesSection(clientId, changes, "Date and description are required."), 400);
	}

	await createChange(supabase, clientId, { changeDate, description: description.trim(), category }, c.get("userEmail"));
	return c.html(renderChangesSection(clientId, await listChanges(supabase, clientId)));
});

app.patch("/api/clients/:id/changes/:changeId", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const changeId = c.req.param("changeId");
	const body = await c.req.parseBody();
	const changeDate = typeof body.changeDate === "string" ? body.changeDate : "";
	const description = typeof body.description === "string" ? body.description : "";
	const category = readChangeCategory(body.category);
	const changes = await listChanges(supabase, clientId);

	if (!changeDate || !validateLength(description, 1, 5000)) {
		return c.html(renderChangesSection(clientId, changes, "Date and description are required."), 400);
	}

	await updateChange(supabase, changeId, { changeDate, description: description.trim(), category });
	return c.html(renderChangesSection(clientId, await listChanges(supabase, clientId)));
});

app.delete("/api/clients/:id/changes/:changeId", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	await deleteChange(supabase, c.req.param("changeId"));
	return c.html(renderChangesSection(clientId, await listChanges(supabase, clientId)));
});

// ---- Links (PRD §13) ----

app.post("/api/clients/:id/links", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const client = await getClientById(supabase, clientId);
	if (!client) return c.text("Client not found", 404);

	const body = await c.req.parseBody();
	const title = typeof body.title === "string" ? body.title.trim() : "";
	const url = typeof body.url === "string" ? body.url.trim() : "";
	const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
	const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
	const links = await listLinks(supabase, clientId);

	if (!validateLength(title, 1, 200) || !isValidLinkUrl(url)) {
		return c.html(renderLinksSection(clientId, links, "Title is required and URL must be a valid http(s) address."), 400);
	}

	await createLink(supabase, clientId, { title, url, description, category }, c.get("userEmail"));
	return c.html(renderLinksSection(clientId, await listLinks(supabase, clientId)));
});

app.patch("/api/clients/:id/links/:linkId", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const linkId = c.req.param("linkId");
	const body = await c.req.parseBody();
	const title = typeof body.title === "string" ? body.title.trim() : "";
	const url = typeof body.url === "string" ? body.url.trim() : "";
	const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
	const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
	const links = await listLinks(supabase, clientId);

	if (!validateLength(title, 1, 200) || !isValidLinkUrl(url)) {
		return c.html(renderLinksSection(clientId, links, "Title is required and URL must be a valid http(s) address."), 400);
	}

	await updateLink(supabase, linkId, { title, url, description, category });
	return c.html(renderLinksSection(clientId, await listLinks(supabase, clientId)));
});

app.delete("/api/clients/:id/links/:linkId", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	await deleteLink(supabase, c.req.param("linkId"));
	return c.html(renderLinksSection(clientId, await listLinks(supabase, clientId)));
});

// ---- Monthly Data (PRD §10/§20) ----

app.put("/api/clients/:id/monthly-data/:metricId/:month", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const metricId = c.req.param("metricId");
	const month = c.req.param("month");

	const [metrics, statuses] = await Promise.all([listMonthlyMetrics(supabase), listStatuses(supabase)]);
	const metricIndex = metrics.findIndex((m) => m.id === metricId);
	const metric = metrics[metricIndex];
	if (!metric) return c.text("Unknown metric", 404);
	if (metric.source === "hubspot") return c.text("This metric is HubSpot-owned and read-only", 400);

	const body = await c.req.parseBody();
	const raw = typeof body.value === "string" ? body.value : "";
	const parsed = parseMonthlyCellValue(raw, metric.valueType, metric.minValue, metric.maxValue);
	const bgClass = metricIndex % 2 === 0 ? "bg-surface" : "bg-zebra-row";

	if (!parsed.ok) {
		const current = await getMonthlyDataValue(supabase, clientId, metricId, month);
		const status = current?.statusId ? (statuses.find((s) => s.id === current.statusId) ?? null) : null;
		const cellComments = await listComments(supabase, clientId, "monthly_data", metricId, month);
		return c.html(
			renderMetricCell(
				clientId,
				"monthly_data",
				metric,
				month,
				{ id: current?.id ?? "", clientId, metricId, month, value: null, valueText: raw, statusId: current?.statusId ?? null, updatedBy: null, updatedAt: "" },
				bgClass,
				status,
				statuses,
				cellComments,
			),
			400,
		);
	}

	const updatedBy = c.get("userEmail");
	const saved = await upsertMonthlyDataValue(supabase, {
		clientId,
		metricId,
		month,
		value: parsed.value,
		valueText: parsed.valueText,
		updatedBy,
	});

	const status = saved.statusId ? (statuses.find((s) => s.id === saved.statusId) ?? null) : null;
	const cellComments = await listComments(supabase, clientId, "monthly_data", metricId, month);
	return c.html(renderMetricCell(clientId, "monthly_data", metric, month, saved, bgClass, status, statuses, cellComments));
});

app.patch("/api/clients/:id/monthly-data/:metricId/:month/highlight", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const metricId = c.req.param("metricId");
	const month = c.req.param("month");

	const [metrics, statuses] = await Promise.all([listMonthlyMetrics(supabase), listStatuses(supabase)]);
	const metricIndex = metrics.findIndex((m) => m.id === metricId);
	const metric = metrics[metricIndex];
	if (!metric) return c.text("Unknown metric", 404);

	const body = await c.req.parseBody();
	const raw = typeof body.statusId === "string" ? body.statusId : "";
	const statusId = raw === "" ? null : raw;
	if (statusId !== null && !statuses.some((s) => s.id === statusId)) return c.text("Unknown status", 400);

	const saved = await setMonthlyDataValueStatus(supabase, { clientId, metricId, month, statusId });
	const bgClass = metricIndex % 2 === 0 ? "bg-surface" : "bg-zebra-row";
	const status = saved.statusId ? (statuses.find((s) => s.id === saved.statusId) ?? null) : null;
	const cellComments = await listComments(supabase, clientId, "monthly_data", metricId, month);
	return c.html(renderMetricCell(clientId, "monthly_data", metric, month, saved, bgClass, status, statuses, cellComments));
});

// ---- Paid Ads (PRD §11) — same metric/value pattern as Monthly Data, separate tables ----

app.put("/api/clients/:id/paid-ads/:metricId/:month", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const metricId = c.req.param("metricId");
	const month = c.req.param("month");

	const [metrics, statuses] = await Promise.all([listPaidAdsMetrics(supabase), listStatuses(supabase)]);
	const metricIndex = metrics.findIndex((m) => m.id === metricId);
	const metric = metrics[metricIndex];
	if (!metric) return c.text("Unknown metric", 404);
	if (metric.source === "hubspot") return c.text("This metric is read-only", 400);

	const body = await c.req.parseBody();
	const raw = typeof body.value === "string" ? body.value : "";
	const parsed = parseMonthlyCellValue(raw, metric.valueType, metric.minValue, metric.maxValue);
	const bgClass = metricIndex % 2 === 0 ? "bg-surface" : "bg-zebra-row";

	if (!parsed.ok) {
		const current = await getPaidAdsDataValue(supabase, clientId, metricId, month);
		const status = current?.statusId ? (statuses.find((s) => s.id === current.statusId) ?? null) : null;
		const cellComments = await listComments(supabase, clientId, "paid_ads", metricId, month);
		return c.html(
			renderMetricCell(
				clientId,
				"paid_ads",
				metric,
				month,
				{ id: current?.id ?? "", clientId, metricId, month, value: null, valueText: raw, statusId: current?.statusId ?? null, updatedBy: null, updatedAt: "" },
				bgClass,
				status,
				statuses,
				cellComments,
			),
			400,
		);
	}

	const updatedBy = c.get("userEmail");
	const saved = await upsertPaidAdsDataValue(supabase, {
		clientId,
		metricId,
		month,
		value: parsed.value,
		valueText: parsed.valueText,
		updatedBy,
	});

	const status = saved.statusId ? (statuses.find((s) => s.id === saved.statusId) ?? null) : null;
	const cellComments = await listComments(supabase, clientId, "paid_ads", metricId, month);
	return c.html(renderMetricCell(clientId, "paid_ads", metric, month, saved, bgClass, status, statuses, cellComments));
});

app.patch("/api/clients/:id/paid-ads/:metricId/:month/highlight", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const metricId = c.req.param("metricId");
	const month = c.req.param("month");

	const [metrics, statuses] = await Promise.all([listPaidAdsMetrics(supabase), listStatuses(supabase)]);
	const metricIndex = metrics.findIndex((m) => m.id === metricId);
	const metric = metrics[metricIndex];
	if (!metric) return c.text("Unknown metric", 404);

	const body = await c.req.parseBody();
	const raw = typeof body.statusId === "string" ? body.statusId : "";
	const statusId = raw === "" ? null : raw;
	if (statusId !== null && !statuses.some((s) => s.id === statusId)) return c.text("Unknown status", 400);

	const saved = await setPaidAdsDataValueStatus(supabase, { clientId, metricId, month, statusId });
	const bgClass = metricIndex % 2 === 0 ? "bg-surface" : "bg-zebra-row";
	const status = saved.statusId ? (statuses.find((s) => s.id === saved.statusId) ?? null) : null;
	const cellComments = await listComments(supabase, clientId, "paid_ads", metricId, month);
	return c.html(renderMetricCell(clientId, "paid_ads", metric, month, saved, bgClass, status, statuses, cellComments));
});

/** Go-live date + ad spend/mo — simple manually-entered client fields, not derived from any metric (PRD §11). */
app.patch("/api/clients/:id/paid-ads-settings", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const client = await getClientById(supabase, clientId);
	if (!client) return c.text("Client not found", 404);

	const body = await c.req.parseBody();
	const goLiveRaw = typeof body.goLiveDate === "string" ? body.goLiveDate.trim() : "";
	const spendRaw = typeof body.adSpendPerMonth === "string" ? body.adSpendPerMonth.trim() : "";

	const goLiveDate = goLiveRaw === "" ? null : goLiveRaw;
	let adSpendPerMonth: number | null = null;
	if (spendRaw !== "") {
		const parsed = Number(spendRaw);
		if (!Number.isFinite(parsed) || parsed < 0) {
			return c.html(renderPaidAdsSettings(client, "Ad spend must be a non-negative number."), 400);
		}
		adSpendPerMonth = parsed;
	}

	const updated = await updatePaidAdsSettings(supabase, clientId, { adSpendPerMonth, goLiveDate });
	if (!updated) return c.text("Client not found", 404);
	return c.html(renderPaidAdsSettings(updated));
});

// ---- Comments (PRD §12), shared by Monthly Data and Paid Ads ----

function readSection(value: unknown): CommentSection {
	return value === "paid_ads" ? "paid_ads" : "monthly_data";
}

/** Looks up the metric in the catalog matching `section` — this app-level check is what replaces the DB FK (comments.metric_id has none, PRD §12). */
async function findMetric(supabase: ReturnType<typeof createSupabaseClient>, section: CommentSection, metricId: string) {
	const metrics = section === "paid_ads" ? await listPaidAdsMetrics(supabase) : await listMonthlyMetrics(supabase);
	return metrics.find((m) => m.id === metricId) ?? null;
}

app.get("/api/clients/:id/comments", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const section = readSection(c.req.query("section"));
	const metricId = c.req.query("metricId") ?? "";
	const month = c.req.query("month") ?? "";
	const comments = await listComments(supabase, clientId, section, metricId, month);
	return c.html(renderCommentPopover(clientId, section, metricId, month, comments));
});

app.post("/api/clients/:id/comments", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const body = await c.req.parseBody();
	const section = readSection(body.section);
	const metricId = typeof body.metricId === "string" ? body.metricId : "";
	const month = typeof body.month === "string" ? body.month : "";
	const commentBody = typeof body.body === "string" ? body.body : "";

	const metric = await findMetric(supabase, section, metricId);
	if (!metric) return c.text("Unknown metric", 404);

	if (!validateLength(commentBody, 1, 2000)) {
		const comments = await listComments(supabase, clientId, section, metricId, month);
		return c.html(renderCommentPopover(clientId, section, metricId, month, comments, "Comment must be 1-2,000 characters."), 400);
	}

	await createComment(supabase, { clientId, section, metricId, month, body: commentBody.trim(), createdBy: c.get("userEmail") });
	const comments = await listComments(supabase, clientId, section, metricId, month);
	return c.html(html`${renderCellMarkerButton(clientId, section, metric, month, comments, true)}${renderCommentPopover(clientId, section, metricId, month, comments)}`);
});

app.patch("/api/clients/:id/comments/:commentId", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	const commentId = c.req.param("commentId");
	const body = await c.req.parseBody();
	const section = readSection(body.section);
	const metricId = typeof body.metricId === "string" ? body.metricId : "";
	const month = typeof body.month === "string" ? body.month : "";
	const commentBody = typeof body.body === "string" ? body.body : "";

	if (!validateLength(commentBody, 1, 2000)) {
		const comments = await listComments(supabase, clientId, section, metricId, month);
		return c.html(renderCommentPopover(clientId, section, metricId, month, comments, "Comment must be 1-2,000 characters."), 400);
	}

	await updateComment(supabase, commentId, commentBody.trim(), c.get("userEmail"));
	const comments = await listComments(supabase, clientId, section, metricId, month);
	const metric = await findMetric(supabase, section, metricId);
	if (!metric) return c.text("Unknown metric", 404);
	return c.html(html`${renderCellMarkerButton(clientId, section, metric, month, comments, true)}${renderCommentPopover(clientId, section, metricId, month, comments)}`);
});

app.delete("/api/clients/:id/comments/:commentId", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const clientId = c.req.param("id");
	// htmx sends hx-vals for DELETE as URL query params, not a request body
	// (its `methodsThatUseUrlParams` list includes "delete") — unlike the
	// POST/PATCH comment routes above, which correctly read parseBody().
	const section = readSection(c.req.query("section"));
	const metricId = c.req.query("metricId") ?? "";
	const month = c.req.query("month") ?? "";

	await deleteComment(supabase, c.req.param("commentId"));
	const comments = await listComments(supabase, clientId, section, metricId, month);
	const metric = await findMetric(supabase, section, metricId);
	if (!metric) return c.text("Unknown metric", 404);
	return c.html(html`${renderCellMarkerButton(clientId, section, metric, month, comments, true)}${renderCommentPopover(clientId, section, metricId, month, comments)}`);
});

// ---- Metric catalog admin (PRD §20) ----

function readMetricValueType(value: unknown): MonthlyMetricValueType {
	return value === "integer" || value === "percent" ? value : "text";
}

app.post("/api/admin/monthly-metrics", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const body = await c.req.parseBody();
	const key = typeof body.key === "string" ? body.key.trim() : "";
	const label = typeof body.label === "string" ? body.label.trim() : "";
	const valueType = readMetricValueType(body.valueType);
	const groupLabel = typeof body.groupLabel === "string" && body.groupLabel.trim() ? body.groupLabel.trim() : null;

	const metrics = await listMonthlyMetrics(supabase);
	const keyValid = /^[a-z0-9_]+$/.test(key);
	const keyTaken = metrics.some((m) => m.key === key);

	if (!keyValid || keyTaken || !validateLength(label, 1, 200)) {
		const error = keyTaken
			? "That key is already in use."
			: "Key must be lowercase letters, numbers, and underscores; label is required.";
		return c.html(renderMetricAdminPanel("monthly", metrics, error), 400);
	}

	const nextSortOrder = metrics.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1;
	await createMonthlyMetric(supabase, { key, label, valueType, sortOrder: nextSortOrder, groupLabel });
	return c.html(renderMetricAdminPanel("monthly", await listMonthlyMetrics(supabase)));
});

app.post("/api/admin/paid-ads-metrics", async (c) => {
	const supabase = createSupabaseClient(c.env);
	const body = await c.req.parseBody();
	const key = typeof body.key === "string" ? body.key.trim() : "";
	const label = typeof body.label === "string" ? body.label.trim() : "";
	const valueType = readMetricValueType(body.valueType);

	const metrics = await listPaidAdsMetrics(supabase);
	const keyValid = /^[a-z0-9_]+$/.test(key);
	const keyTaken = metrics.some((m) => m.key === key);

	if (!keyValid || keyTaken || !validateLength(label, 1, 200)) {
		const error = keyTaken
			? "That key is already in use."
			: "Key must be lowercase letters, numbers, and underscores; label is required.";
		return c.html(renderMetricAdminPanel("paid_ads", metrics, error), 400);
	}

	const nextSortOrder = metrics.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1;
	await createPaidAdsMetric(supabase, { key, label, valueType, sortOrder: nextSortOrder });
	return c.html(renderMetricAdminPanel("paid_ads", await listPaidAdsMetrics(supabase)));
});

export default app;
