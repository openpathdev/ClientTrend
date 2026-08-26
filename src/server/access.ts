/**
 * Cloudflare Access JWT verification (PRD §23).
 *
 * In production, Cloudflare Access sits in front of the Worker and blocks
 * unauthenticated requests before they ever arrive here — this module is
 * defense-in-depth plus the mechanism for extracting the verified identity
 * (the `email` claim) so it can be stamped on created_by/updated_by.
 *
 * In local dev, CF_ACCESS_TEAM_DOMAIN is left unset, and requests are treated
 * as a fixed dev identity so `npm run dev` works without a real Access setup.
 */
import type { CloudflareBindings } from "./bindings";

const DEV_USER_EMAIL = "dev@localhost";
const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

type Jwk = JsonWebKey & { kid?: string };

// Per-isolate JWKS cache — Workers may reuse the isolate across requests, so
// this avoids re-fetching certs on every request without needing external storage.
let jwksCache: { teamDomain: string; keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

function base64UrlToUint8Array(base64Url: string): Uint8Array {
	const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function base64UrlToJson<T>(base64Url: string): T {
	const bytes = base64UrlToUint8Array(base64Url);
	return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function getJwks(teamDomain: string): Promise<Jwk[]> {
	if (jwksCache && jwksCache.teamDomain === teamDomain && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
		return jwksCache.keys;
	}
	const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
	if (!res.ok) throw new Error(`Failed to fetch Access certs: ${res.status}`);
	const body = (await res.json()) as { keys: Jwk[] };
	jwksCache = { teamDomain, keys: body.keys, fetchedAt: Date.now() };
	return body.keys;
}

/**
 * Verifies the Cloudflare Access JWT on the request and returns the
 * authenticated user's email, or null if verification fails/is absent.
 */
export async function verifyAccessRequest(request: Request, env: CloudflareBindings): Promise<string | null> {
	if (!env.CF_ACCESS_TEAM_DOMAIN) {
		// Local dev fallback — no Access configured.
		return DEV_USER_EMAIL;
	}

	const token = request.headers.get(ACCESS_JWT_HEADER);
	if (!token) return null;

	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [headerB64, payloadB64, signatureB64] = parts;

	let header: { kid?: string; alg?: string };
	let payload: { aud?: string[] | string; exp?: number; email?: string };
	try {
		header = base64UrlToJson(headerB64);
		payload = base64UrlToJson(payloadB64);
	} catch {
		return null;
	}

	if (!header.kid || header.alg !== "RS256") return null;
	if (!payload.exp || payload.exp * 1000 < Date.now()) return null;

	const aud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
	if (!aud.includes(env.CF_ACCESS_AUD)) return null;

	const keys = await getJwks(env.CF_ACCESS_TEAM_DOMAIN);
	const jwk = keys.find((k) => k.kid === header.kid);
	if (!jwk) return null;

	const publicKey = await crypto.subtle.importKey(
		"jwk",
		jwk,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["verify"],
	);

	const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
	const signature = base64UrlToUint8Array(signatureB64);
	const valid = await crypto.subtle.verify(
		"RSASSA-PKCS1-v1_5",
		publicKey,
		signature as BufferSource,
		signedData as BufferSource,
	);
	if (!valid) return null;

	return payload.email ?? null;
}
