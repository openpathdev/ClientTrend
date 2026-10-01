import { describe, expect, it } from "vitest";
import { withClockSkewRetry } from "./supabase";

const skewResponse = () =>
	new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });
const okResponse = () => new Response("[]", { status: 200 });
const noSleep = async () => {};

function fakeFetch(responses: (() => Response)[]) {
	let calls = 0;
	const impl = (async () => responses[Math.min(calls++, responses.length - 1)]()) as typeof fetch;
	return { impl, calls: () => calls };
}

describe("withClockSkewRetry", () => {
	it("passes a successful response straight through", async () => {
		const f = fakeFetch([okResponse]);
		const res = await withClockSkewRetry(f.impl, noSleep)("https://x");
		expect(res.status).toBe(200);
		expect(f.calls()).toBe(1);
	});

	it("retries a clock-skew rejection and returns the successful retry", async () => {
		const f = fakeFetch([skewResponse, okResponse]);
		const res = await withClockSkewRetry(f.impl, noSleep)("https://x");
		expect(res.status).toBe(200);
		expect(f.calls()).toBe(2);
	});

	it("gives up after two retries and returns the last rejection", async () => {
		const f = fakeFetch([skewResponse]);
		const res = await withClockSkewRetry(f.impl, noSleep)("https://x");
		expect(res.status).toBe(401);
		expect(f.calls()).toBe(3);
	});

	it("does not retry other 401s", async () => {
		const f = fakeFetch([() => new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 })]);
		const res = await withClockSkewRetry(f.impl, noSleep)("https://x");
		expect(res.status).toBe(401);
		expect(f.calls()).toBe(1);
	});

	it("leaves the returned response body readable", async () => {
		const f = fakeFetch([skewResponse]);
		const res = await withClockSkewRetry(f.impl, noSleep)("https://x");
		expect(await res.json()).toEqual({ code: "PGRST303", message: "JWT issued at future" });
	});
});
