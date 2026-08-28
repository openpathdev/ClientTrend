#!/usr/bin/env python3
"""
Populates the 9 HubSpot-sourced Monthly Data metrics (PRD §14) for one
client, from that client's `her_journey_org_data` HubSpot file property.

Why this is a separate script, not part of the Cloudflare Worker sync job:
`her_journey_org_data` is a HubSpot FILE property (not a JSON string, despite
the original assumption) — reading it means downloading a file that can run
into the tens of megabytes per client (21.9MB for the test company used to
build this script) and contains raw session-level event data, not ready-made
monthly numbers. Parsing that repeatedly, per client, inside a Workers
scheduled handler risks CPU/memory limits. This script does that heavy
lifting offline (run manually or via your own cron elsewhere) and writes
the *results* — 9 numbers per client per month — into Supabase; the Worker
itself never touches the raw file.

Metric formulas below were ported from (not imported from — that project is
a separate app, gitignored out of this repo, kept at ProcessData/ purely as
reference) that project's processors/compute_metrics.py and
processors/aggregate_stats.py, which is the actual code that produces the
her_journey_org_data file in the first place. Formula choices where more
than one candidate existed were confirmed with the client (2026-08-28/29):
  - Click to Convo % = conversationQualifiedRate (qualified ÷ validated)
  - Appointment %    = funnelRates.scheduledRate  (scheduled ÷ qualified)
  - Unique Visitors  = non-offline session count
  - Unique Clients   = distinct client identity, deduped across sessions
  - Widget Click %   = widget sessions ÷ total sessions (no source field;
    this is our own formula, confirmed acceptable)
  - Hubspot Submission Clients = distinct client identity among sessions
    with submitted=True — PROVISIONAL, not one of the original 8 metrics,
    proposed by us and not yet explicitly confirmed.

Usage:
    python3 scripts/sync_org_data.py --client-id <supabase-client-uuid> [--months 12] [--dry-run]

Requires HUBSPOT_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — read
from .dev.vars in the repo root (same file the Worker uses locally), or
already-exported environment variables.
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# ── Env loading (mirrors .dev.vars — see CLAUDE.md / .dev.vars.example) ──────

def load_dev_vars() -> dict:
	env = {}
	dev_vars_path = REPO_ROOT / ".dev.vars"
	if dev_vars_path.exists():
		for line in dev_vars_path.read_text().splitlines():
			line = line.strip()
			if not line or line.startswith("#") or "=" not in line:
				continue
			key, _, value = line.partition("=")
			env[key.strip()] = value.strip()
	return env


import os  # noqa: E402 (after REPO_ROOT/load_dev_vars, matches script's top-to-bottom narrative)

_ENV = {**load_dev_vars(), **os.environ}

HUBSPOT_API_TOKEN = _ENV.get("HUBSPOT_API_TOKEN")
SUPABASE_URL = _ENV.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _ENV.get("SUPABASE_SERVICE_ROLE_KEY")

for name, value in (
	("HUBSPOT_API_TOKEN", HUBSPOT_API_TOKEN),
	("SUPABASE_URL", SUPABASE_URL),
	("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
):
	if not value:
		print(f"Error: {name} not set (checked .dev.vars and environment)", file=sys.stderr)
		sys.exit(1)


# ── Tiny HTTP helper, shelling out to curl ──────────────────────────────────
# Uses curl rather than urllib: this repo's dev environment (and plausibly
# the machine this script eventually runs on) has Python builds whose ssl
# module doesn't trust the system cert store out of the box (a common
# macOS python.org-installer footgun), while curl already works reliably
# here — sidesteps the cert issue entirely instead of bundling certifi.

def _request(url: str, headers: dict, method: str = "GET", body: bytes = None) -> bytes:
	cmd = ["curl", "-sS", "-X", method, "-w", "\n%{http_code}"]
	for key, value in headers.items():
		cmd += ["-H", f"{key}: {value}"]
	if body is not None:
		cmd += ["--data-binary", "@-"]
	cmd.append(url)

	result = subprocess.run(cmd, input=body, capture_output=True)
	if result.returncode != 0:
		raise RuntimeError(f"{method} {url} -> curl failed: {result.stderr.decode(errors='replace')}")

	output = result.stdout
	response_body, _, status_code = output.rpartition(b"\n")
	if not status_code.isdigit() or not (200 <= int(status_code) < 300):
		raise RuntimeError(f"{method} {url} -> HTTP {status_code.decode(errors='replace')}: {response_body.decode(errors='replace')}")
	return response_body


def hubspot_get(path: str) -> dict:
	body = _request(
		f"https://api.hubapi.com{path}",
		headers={"Authorization": f"Bearer {HUBSPOT_API_TOKEN}"},
	)
	return json.loads(body)


def supabase_get(path: str) -> list | dict:
	body = _request(
		f"{SUPABASE_URL}/rest/v1/{path}",
		headers={
			"apikey": SUPABASE_SERVICE_ROLE_KEY,
			"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
		},
	)
	return json.loads(body)


def supabase_upsert(table: str, rows: list[dict], on_conflict: str) -> None:
	body = json.dumps(rows).encode("utf-8")
	_request(
		f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}",
		headers={
			"apikey": SUPABASE_SERVICE_ROLE_KEY,
			"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
			"Content-Type": "application/json",
			"Prefer": "resolution=merge-duplicates",
		},
		method="POST",
		body=body,
	)


# ── HubSpot: resolve the company's her_journey_org_data file, download it ───

def fetch_org_data(hubspot_company_id: str) -> dict:
	company = hubspot_get(
		f"/crm/v3/objects/companies/{hubspot_company_id}?properties=her_journey_org_data"
	)
	file_id = company.get("properties", {}).get("her_journey_org_data")
	if not file_id:
		raise RuntimeError(f"Company {hubspot_company_id} has no her_journey_org_data file set")

	signed = hubspot_get(f"/files/v3/files/{file_id}/signed-url")
	download_url = signed["url"]

	print(f"Downloading her_journey_org_data ({signed.get('size', '?')} bytes)...", file=sys.stderr)
	body = _request(download_url, headers={})
	return json.loads(body)


# ── Metric computation — ported from ProcessData/processors/{compute_metrics,aggregate_stats}.py ──

_QUALIFIED_LABELS = {"Abortion Determined", "Abortion Minded", "Abortion Vulnerable", "Likely to Carry"}
_AV_AM_AD_LABELS = {"Abortion Vulnerable", "Abortion Minded", "Abortion Determined"}
_AM_AD_LABELS = {"Abortion Minded", "Abortion Determined"}


def _parse_ts(value: str):
	if not value:
		return None
	s = value.strip()
	if s.endswith("Z") or s.endswith("z"):
		s = s[:-1] + "+00:00"
	try:
		return datetime.fromisoformat(s)
	except ValueError:
		return None


def _is_qualified_conversation(s: dict) -> bool:
	if not s.get("validated"):
		return False
	if s.get("clientClassification") in _QUALIFIED_LABELS:
		return True
	if s.get("appointmentScheduled") or s.get("appointmentKept") or s.get("appointmentNoShow"):
		return True
	sp = s.get("servicesProvided") or {}
	if sp.get("ultrasound") or sp.get("pregnancyTest"):
		return True
	ss = s.get("seekingServices") or {}
	if ss.get("prenatal") or ss.get("nonPregnancy") or ss.get("stiTesting") or ss.get("stiTreatment"):
		return True
	return False


def _distinct_client_ids(sessions: list) -> set:
	ids = set()
	for s in sessions:
		for i in s.get("interactions") or []:
			if i.get("fakeClientID") is not None:
				ids.add(i["fakeClientID"])
	return ids


def _month_bounds(month: str):
	"""`month` is first-of-month YYYY-MM-01 (matches src/server/months.ts). Returns
	[start, end) as tz-aware UTC datetimes covering the whole calendar month."""
	year, mon, _ = (int(p) for p in month.split("-"))
	start = datetime(year, mon, 1, tzinfo=timezone.utc)
	end = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if mon == 12 else datetime(year, mon + 1, 1, tzinfo=timezone.utc)
	return start, end


def compute_month_metrics(sessions: list, month: str) -> dict:
	start, end = _month_bounds(month)

	def in_month(s):
		ts = _parse_ts(s.get("timestamp"))
		return ts is not None and start <= ts < end

	month_sessions = [s for s in sessions if in_month(s)]

	non_offline = [s for s in month_sessions if not s.get("isOffline")]
	unique_visitors = len(non_offline)

	widget_clicks = sum(1 for s in month_sessions if s.get("isWidgetSession"))
	widget_click_pct = round(widget_clicks / unique_visitors * 100, 1) if unique_visitors else 0

	unique_clients = len(_distinct_client_ids(month_sessions))

	validated = sum(1 for s in month_sessions if s.get("validated"))
	qualified = sum(1 for s in month_sessions if _is_qualified_conversation(s))
	click_to_convo_pct = round(qualified / validated * 100, 1) if validated else 0

	appointments_scheduled = sum(1 for s in month_sessions if s.get("appointmentScheduled"))
	appointment_pct = round(appointments_scheduled / qualified * 100, 1) if qualified else 0

	am_ad = sum(1 for s in month_sessions if s.get("validated") and s.get("clientClassification") in _AM_AD_LABELS)
	av_am_ad = sum(1 for s in month_sessions if s.get("validated") and s.get("clientClassification") in _AV_AM_AD_LABELS)

	submission_sessions = [s for s in month_sessions if s.get("submitted")]
	hubspot_submission_clients = len(_distinct_client_ids(submission_sessions))

	return {
		"unique_visitors": unique_visitors,
		"widget_clicks": widget_clicks,
		"widget_click_pct": widget_click_pct,
		"unique_clients": unique_clients,
		"click_to_convo_pct": click_to_convo_pct,
		"appointment_pct": appointment_pct,
		"am_ad": am_ad,
		"av_am_ad": av_am_ad,
		"hubspot_submission_clients": hubspot_submission_clients,
	}


def trailing_months(count: int) -> list[str]:
	now = datetime.now(timezone.utc)
	months = []
	y, m = now.year, now.month
	for i in range(count - 1, -1, -1):
		mm = m - i
		yy = y
		while mm <= 0:
			mm += 12
			yy -= 1
		months.append(f"{yy:04d}-{mm:02d}-01")
	return months


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--client-id", required=True, help="Supabase clients.id (uuid)")
	parser.add_argument("--months", type=int, default=12, help="Trailing month window (default 12, matches the app's display window)")
	parser.add_argument("--dry-run", action="store_true", help="Compute and print without writing to Supabase")
	args = parser.parse_args()

	client_rows = supabase_get(f"clients?id=eq.{args.client_id}&select=id,name,hubspot_company_id")
	if not client_rows:
		print(f"Error: no client with id {args.client_id}", file=sys.stderr)
		sys.exit(1)
	client = client_rows[0]
	hubspot_company_id = client.get("hubspot_company_id")
	if not hubspot_company_id:
		print(f"Error: client {client['name']} has no hubspot_company_id set", file=sys.stderr)
		sys.exit(1)

	metrics_catalog = supabase_get("monthly_metrics?source=eq.hubspot&select=id,key")
	metric_id_by_key = {m["key"]: m["id"] for m in metrics_catalog}

	missing_keys = set(compute_month_metrics([], trailing_months(1)[0]).keys()) - set(metric_id_by_key.keys())
	if missing_keys:
		print(f"Error: monthly_metrics catalog is missing keys: {sorted(missing_keys)}", file=sys.stderr)
		sys.exit(1)

	org_data = fetch_org_data(hubspot_company_id)
	sessions = org_data.get("sessions", [])
	print(f"Loaded {len(sessions)} sessions for {client['name']} ({hubspot_company_id})", file=sys.stderr)

	months = trailing_months(args.months)
	rows = []
	for month in months:
		values = compute_month_metrics(sessions, month)
		print(f"  {month}: {values}", file=sys.stderr)
		for key, value in values.items():
			rows.append({
				"client_id": args.client_id,
				"metric_id": metric_id_by_key[key],
				"month": month,
				"value": value,
				"value_text": str(value),
				"updated_by": "hubspot-sync",
			})

	if args.dry_run:
		print(f"\nDry run — would upsert {len(rows)} monthly_data_values rows.", file=sys.stderr)
		return

	supabase_upsert("monthly_data_values", rows, on_conflict="client_id,metric_id,month")
	print(f"\nUpserted {len(rows)} monthly_data_values rows for {client['name']}.", file=sys.stderr)


if __name__ == "__main__":
	main()
