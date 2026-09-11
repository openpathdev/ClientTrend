import { describe, expect, it } from "vitest";
import { isValidLinkUrl, isValidUuid, parseMonthlyCellValue, validateLength } from "./validation";

describe("isValidUuid", () => {
	it("accepts a well-formed uuid", () => {
		expect(isValidUuid("0276569e-74b0-4a9b-a6ed-a2f7782aee0c")).toBe(true);
	});

	it("accepts uppercase hex", () => {
		expect(isValidUuid("0276569E-74B0-4A9B-A6ED-A2F7782AEE0C")).toBe(true);
	});

	it("rejects a malformed id", () => {
		expect(isValidUuid("not-a-uuid")).toBe(false);
	});

	it("rejects an empty string", () => {
		expect(isValidUuid("")).toBe(false);
	});
});

describe("isValidLinkUrl", () => {
	it("accepts a well-formed https URL", () => {
		expect(isValidLinkUrl("https://example.com/path")).toBe(true);
	});

	it("accepts a well-formed http URL", () => {
		expect(isValidLinkUrl("http://example.com")).toBe(true);
	});

	it("rejects a javascript: scheme", () => {
		expect(isValidLinkUrl("javascript:alert(1)")).toBe(false);
	});

	it("rejects a data: scheme", () => {
		expect(isValidLinkUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
	});

	it("rejects a non-URL string", () => {
		expect(isValidLinkUrl("not a url")).toBe(false);
	});
});

describe("validateLength", () => {
	it("accepts a value within bounds", () => {
		expect(validateLength("hello", 1, 10)).toBe(true);
	});

	it("rejects below the minimum", () => {
		expect(validateLength("", 1, 10)).toBe(false);
	});

	it("rejects above the maximum", () => {
		expect(validateLength("x".repeat(11), 1, 10)).toBe(false);
	});

	it("trims whitespace before measuring length", () => {
		expect(validateLength("   ", 1, 10)).toBe(false);
	});
});

describe("parseMonthlyCellValue", () => {
	describe("text-typed metrics", () => {
		it("accepts arbitrary non-numeric text", () => {
			expect(parseMonthlyCellValue("some notes", "text", null, null)).toEqual({
				ok: true,
				value: null,
				valueText: "some notes",
			});
		});

		it("treats an empty string as clearing the value", () => {
			expect(parseMonthlyCellValue("", "text", null, null)).toEqual({ ok: true, value: null, valueText: null });
		});

		it("rejects text over 500 characters", () => {
			const result = parseMonthlyCellValue("x".repeat(501), "text", null, null);
			expect(result).toEqual({ ok: false, error: "Value must be 500 characters or fewer." });
		});

		it("accepts text at exactly 500 characters", () => {
			const result = parseMonthlyCellValue("x".repeat(500), "text", null, null);
			expect(result.ok).toBe(true);
		});
	});

	describe("integer/percent metrics", () => {
		it("accepts a valid number", () => {
			expect(parseMonthlyCellValue("42", "integer", null, null)).toEqual({ ok: true, value: 42, valueText: null });
		});

		it("treats an empty string as clearing the value", () => {
			expect(parseMonthlyCellValue("", "integer", null, null)).toEqual({ ok: true, value: null, valueText: null });
		});

		it("rejects non-numeric input", () => {
			expect(parseMonthlyCellValue("abc", "percent", null, null)).toEqual({ ok: false, error: "Value must be a number." });
		});

		it("rejects a value below the configured minimum", () => {
			expect(parseMonthlyCellValue("-5", "integer", 0, 100)).toEqual({ ok: false, error: "Value must be at least 0." });
		});

		it("rejects a value above the configured maximum", () => {
			expect(parseMonthlyCellValue("150", "percent", 0, 100)).toEqual({ ok: false, error: "Value must be at most 100." });
		});

		it("accepts a value exactly at the boundary", () => {
			expect(parseMonthlyCellValue("100", "percent", 0, 100)).toEqual({ ok: true, value: 100, valueText: null });
		});

		it("has no bounds enforced when min/max are null", () => {
			expect(parseMonthlyCellValue("-999999", "integer", null, null)).toEqual({ ok: true, value: -999999, valueText: null });
		});
	});
});
