import { describe, expect, it } from "vitest";
import { filterQuery } from "./overviewPanel";

describe("filterQuery", () => {
	it("returns an empty string when no filters are set", () => {
		expect(filterQuery({})).toBe("");
	});

	it("builds a query string for a single filter", () => {
		expect(filterQuery({ csmId: "csm-1" })).toBe("?csm=csm-1");
	});

	it("builds a query string combining multiple filters", () => {
		const qs = filterQuery({ csmId: "csm-1", statusId: "status-1", stateCode: "KY" });
		const params = new URLSearchParams(qs.slice(1));
		expect(params.get("csm")).toBe("csm-1");
		expect(params.get("status")).toBe("status-1");
		expect(params.get("state")).toBe("KY");
	});

	it("applies an override on top of existing filters", () => {
		expect(filterQuery({ csmId: "csm-1" }, { csmId: "csm-2" })).toBe("?csm=csm-2");
	});

	it("clears a filter when the override is undefined", () => {
		expect(filterQuery({ csmId: "csm-1", statusId: "status-1" }, { statusId: undefined })).toBe("?csm=csm-1");
	});

	it("does not mutate the original filters object", () => {
		const filters = { csmId: "csm-1" };
		filterQuery(filters, { csmId: "csm-2" });
		expect(filters.csmId).toBe("csm-1");
	});
});
