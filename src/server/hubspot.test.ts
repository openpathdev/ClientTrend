import { describe, expect, it } from "vitest";
import { normalizeHubspotText, parseHubspotInteger, resolveStateCode } from "./hubspot";

describe("normalizeHubspotText", () => {
	it("passes through a clean value unchanged", () => {
		expect(normalizeHubspotText("KY")).toBe("KY");
	});

	it("trims a trailing tab character (real data seen in this HubSpot account)", () => {
		expect(normalizeHubspotText("1\t")).toBe("1");
	});

	it("trims leading/trailing whitespace", () => {
		expect(normalizeHubspotText("  TX  ")).toBe("TX");
	});

	it("returns null for an empty string", () => {
		expect(normalizeHubspotText("")).toBe(null);
	});

	it("returns null for a whitespace-only string", () => {
		expect(normalizeHubspotText("   \t")).toBe(null);
	});

	it("returns null unchanged for a null input", () => {
		expect(normalizeHubspotText(null)).toBe(null);
	});
});

describe("parseHubspotInteger", () => {
	it("returns null for a null input", () => {
		expect(parseHubspotInteger(null)).toBe(null);
	});

	it("returns null for an empty string", () => {
		expect(parseHubspotInteger("")).toBe(null);
	});

	it("trims surrounding whitespace", () => {
		expect(parseHubspotInteger("  12 ")).toBe(12);
	});

	it("returns null for a non-numeric value", () => {
		expect(parseHubspotInteger("abc")).toBe(null);
	});

	it("accepts HubSpot's decimal form of a whole number", () => {
		expect(parseHubspotInteger("12.0")).toBe(12);
	});
});

describe("resolveStateCode", () => {
	it("prefers the human-entered state over an enrichment-filled code that disagrees", () => {
		expect(resolveStateCode("TX", "NC")).toBe("TX");
	});

	it("converts a full state name to its code", () => {
		expect(resolveStateCode("South Carolina", "SC")).toBe("SC");
		expect(resolveStateCode("new mexico", null)).toBe("NM");
	});

	it("trims stray whitespace and accepts lowercase codes", () => {
		expect(resolveStateCode(" tx\t", null)).toBe("TX");
	});

	it("falls back to hs_state_code when state is blank or unrecognised", () => {
		expect(resolveStateCode(null, "KY")).toBe("KY");
		expect(resolveStateCode("Ontario", "VT")).toBe("VT");
	});

	it("returns null rather than a value outside the states table", () => {
		expect(resolveStateCode("Ontario", "ON")).toBe(null);
		expect(resolveStateCode(null, null)).toBe(null);
	});
});
