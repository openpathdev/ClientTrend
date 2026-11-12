import { describe, expect, it } from "vitest";
import { campaignToMetric, missingCampaignRows, parseCampaignName } from "./campaigns";
import type { MonthlyMetric } from "./types";
import { planPaste, parseClipboardTable } from "../pasteImport";

const paidAdsMetric = (id: string, label: string, sortOrder: number, source: "manual" | "hubspot" = "manual"): MonthlyMetric => ({
	id,
	key: id,
	label,
	valueType: "text",
	minValue: null,
	maxValue: null,
	source,
	groupLabel: null,
	sortOrder,
	active: true,
});

describe("campaignToMetric", () => {
	it("copies the Paid Ads row's label and order under the campaign row's own id", () => {
		expect(campaignToMetric("row1", paidAdsMetric("m1", "Lead Rate", 2, "hubspot"))).toMatchObject({
			id: "row1",
			key: "row1",
			label: "Lead Rate",
			valueType: "text",
			source: "manual",
			sortOrder: 2,
		});
	});

	it("lets a campaign take a spreadsheet paste like any manual row", () => {
		const metrics = [campaignToMetric("c1", paidAdsMetric("m1", "Initiation Rate", 1)), campaignToMetric("c2", paidAdsMetric("m2", "Lead Rate", 2))];
		const plan = planPaste({ grid: parseClipboardTable("10\t12\n3\t4"), startMetricId: "c1", startMonth: "2026-01-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows.map((r) => r.metric?.id)).toEqual(["c1", "c2"]);
		expect(plan.counts.new).toBe(4);
	});
});

describe("missingCampaignRows", () => {
	it("fills every campaign with every Paid Ads row it doesn't have yet", () => {
		const rows = [
			{ group_id: "g1", metric_id: "m1" },
			{ group_id: "g1", metric_id: "m2" },
			{ group_id: "g2", metric_id: "m1" },
		];
		expect(missingCampaignRows(["g1", "g2", "g3"], rows, ["m1", "m2"])).toEqual([
			{ group_id: "g2", metric_id: "m2" },
			{ group_id: "g3", metric_id: "m1" },
			{ group_id: "g3", metric_id: "m2" },
		]);
	});

	it("needs nothing when every campaign is complete", () => {
		expect(missingCampaignRows(["g1"], [{ group_id: "g1", metric_id: "m1" }], ["m1"])).toEqual([]);
	});
});

describe("parseCampaignName", () => {
	it("trims and allows blank", () => {
		expect(parseCampaignName("  Fall radio  ")).toEqual({ ok: true, name: "Fall radio" });
		expect(parseCampaignName("   ")).toEqual({ ok: true, name: "" });
	});

	it("rejects names over 200 characters", () => {
		expect(parseCampaignName("x".repeat(201)).ok).toBe(false);
		expect(parseCampaignName("x".repeat(200)).ok).toBe(true);
	});
});
