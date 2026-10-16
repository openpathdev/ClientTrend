import { describe, expect, it } from "vitest";
import { campaignToMetric, parseCampaignName } from "./campaigns";
import { planPaste, parseClipboardTable } from "../pasteImport";

describe("campaignToMetric", () => {
	it("maps a campaign row to an always-manual text metric", () => {
		expect(campaignToMetric({ id: "c1", name: "Spring billboard", sort_order: 2 })).toMatchObject({
			id: "c1",
			key: "c1",
			label: "Spring billboard",
			valueType: "text",
			source: "manual",
			groupLabel: null,
			sortOrder: 2,
		});
	});

	it("lets a campaign take a spreadsheet paste like any manual row", () => {
		const metrics = [campaignToMetric({ id: "c1", name: "A", sort_order: 1 }), campaignToMetric({ id: "c2", name: "", sort_order: 2 })];
		const plan = planPaste({ grid: parseClipboardTable("10\t12\n3\t4"), startMetricId: "c1", startMonth: "2026-01-01", metrics, existing: [], currentMonth: "2026-10-01" });
		expect(plan.rows.map((r) => r.metric?.id)).toEqual(["c1", "c2"]);
		expect(plan.counts.new).toBe(4);
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
