// One-off (2026-11-12): converts the free-form Campaigns rows CSMs entered
// before each campaign became a copy of the Paid Ads table.
//
// CSMs had been stacking Paid Ads-style blocks by hand, e.g.
//   "Snapchat" (name-only row), "Initiation Rate", "Lead Rate", "Leads", ...
// or "Instagram Initiation Rate", "Lead Rate", ...
// Each block becomes one campaign (campaign_groups row) named from the header
// row or the prefix before "Initiation Rate". The existing client_campaigns
// rows are re-pointed (group_id + metric_id) rather than copied, so their
// values, comments and paste history carry over untouched. Name-only and
// blank rows are deleted — the script refuses to run if any of them holds a
// value or a comment.
//
// Dry run by default; pass --apply to write.
//   set -a; source .dev.vars; set +a; node scripts/convert_campaign_rows.mjs [--apply]

import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function must({ data, error }) {
	if (error) throw new Error(error.message);
	return data;
}

/** Paid Ads metric key a hand-typed row name stands for, or null for a name-only/blank row. */
function metricKeyFor(name) {
	const n = name.toLowerCase();
	if (n.includes("initiation")) return "initiation_rate";
	if (n.includes("lead rate")) return "lead_rate";
	if (/^leads\b/.test(n.trim())) return "leads_text";
	if (n.includes("session") || n.includes("click")) return "sessions_clicks";
	if (n.includes("cpc")) return "cpc";
	if (n.includes("ctr")) return "ctr";
	return null;
}

const metrics = must(await supabase.from("paid_ads_metrics").select("id, key, label"));
const metricByKey = new Map(metrics.map((m) => [m.key, m]));

const rows = must(
	await supabase.from("client_campaigns").select("id, client_id, group_id, name, sort_order, created_at").is("metric_id", null).order("sort_order").order("created_at"),
);
const values = must(await supabase.from("campaign_data_values").select("campaign_id, value, value_text"));
const comments = must(await supabase.from("comments").select("metric_id").eq("section", "campaigns"));
const hasValue = new Set(values.filter((v) => v.value !== null || (v.value_text ?? "").trim() !== "").map((v) => v.campaign_id));
const hasComment = new Set(comments.map((c) => c.metric_id));
const clientIds = [...new Set(rows.map((r) => r.client_id))];
const clients = clientIds.length ? must(await supabase.from("clients").select("id, name").in("id", clientIds)) : [];
const clientName = new Map(clients.map((c) => [c.id, c.name]));

const problems = [];
const plans = [];

for (const clientId of clientIds) {
	const clientRows = rows.filter((r) => r.client_id === clientId);
	const blocks = [];
	const drop = [];
	let current = null;
	let pendingName = null;

	for (const row of clientRows) {
		const key = metricKeyFor(row.name);
		if (!key) {
			if (hasValue.has(row.id) || hasComment.has(row.id)) problems.push(`${clientName.get(clientId)}: name-only row "${row.name}" has values or comments`);
			drop.push(row);
			if (row.name.trim()) pendingName = row.name.trim();
			current = null;
			continue;
		}
		if (key === "initiation_rate" || !current || current.rows.some((r) => r.key === key)) {
			const prefix = key === "initiation_rate" ? row.name.replace(/initiation\s*rate/i, "").trim() : "";
			current = { name: pendingName ?? prefix, rows: [] };
			blocks.push(current);
			pendingName = null;
		}
		current.rows.push({ ...row, key });
	}
	// Only name-only/blank rows: keep one blank campaign (named if there was a name row).
	if (blocks.length === 0) blocks.push({ name: pendingName ?? "", rows: [] });
	plans.push({ clientId, blocks, drop });
}

for (const { clientId, blocks, drop } of plans) {
	console.log(`\n## ${clientName.get(clientId)}`);
	blocks.forEach((b, i) => {
		console.log(`  Campaign ${i + 1}: ${b.name ? JSON.stringify(b.name) : "(untitled)"}`);
		for (const r of b.rows) {
			const label = metricByKey.get(r.key).label;
			const note = r.name.trim() === label ? "" : `   (was "${r.name}")`;
			console.log(`     ${label}${hasValue.has(r.id) ? "" : " [empty]"}${note}`);
		}
	});
	if (drop.length) console.log(`  Remove name-only/blank rows: ${drop.map((r) => JSON.stringify(r.name)).join(", ")}`);
}

if (problems.length) {
	console.error(`\nNot converting — fix these first:\n  ${problems.join("\n  ")}`);
	process.exit(1);
}
if (!apply) {
	console.log("\nDry run only. Re-run with --apply to write.");
	process.exit(0);
}

for (const { clientId, blocks, drop } of plans) {
	// Only the sections the free-form rows sat in — never a campaign a CSM has already added the new way.
	const oldGroups = [...new Set(rows.filter((r) => r.client_id === clientId).map((r) => r.group_id))];
	for (const [i, block] of blocks.entries()) {
		const group = must(await supabase.from("campaign_groups").insert({ client_id: clientId, name: block.name, sort_order: i + 1, created_by: "migration" }).select("id").single());
		for (const r of block.rows) {
			must(await supabase.from("client_campaigns").update({ group_id: group.id, metric_id: metricByKey.get(r.key).id }).eq("id", r.id));
		}
	}
	if (drop.length) must(await supabase.from("client_campaigns").delete().in("id", drop.map((r) => r.id)));
	// The "Campaigns" section the previous migration made now holds at most the blank Paid Ads
	// rows the app auto-added when the page was viewed. Delete it only if none of those got data.
	for (const groupId of oldGroups) {
		const left = must(await supabase.from("client_campaigns").select("id").eq("group_id", groupId)).map((r) => r.id);
		const leftValues = left.length ? must(await supabase.from("campaign_data_values").select("id, value, value_text").in("campaign_id", left)) : [];
		const leftComments = left.length ? must(await supabase.from("comments").select("id").eq("section", "campaigns").in("metric_id", left)) : [];
		const used = leftValues.some((v) => v.value !== null || (v.value_text ?? "").trim() !== "") || leftComments.length > 0;
		if (used) console.warn(`  Kept section ${groupId} for ${clientName.get(clientId)}: it has data entered after the upgrade.`);
		else must(await supabase.from("campaign_groups").delete().eq("id", groupId));
	}
	console.log(`Converted ${clientName.get(clientId)}: ${blocks.length} campaign(s)`);
}
console.log("\nDone. Missing Paid Ads rows are added to each campaign the next time its page loads.");
