import { describe, expect, it } from "vitest";
import { canonicalOwnerId } from "./csms";

describe("canonicalOwnerId", () => {
	it("maps a known duplicate owner id to its canonical @828collective.com id", () => {
		// Nancy Kirchoff's @openpathdigital.com duplicate -> her @828collective.com id
		expect(canonicalOwnerId("577351169")).toBe("471622286");
	});

	it("maps Laura Calhoun's duplicate the same way", () => {
		expect(canonicalOwnerId("97937265")).toBe("98304593");
	});

	it("passes through an id with no known duplicate unchanged", () => {
		expect(canonicalOwnerId("999999999")).toBe("999999999");
	});

	it("passes through an already-canonical id unchanged", () => {
		expect(canonicalOwnerId("471622286")).toBe("471622286");
	});
});
