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
lifting offline (daily via GitHub Actions, or by hand) and writes
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

Also opportunistically fills the existing "Form Fills" manual metric
(catalog key `form_fills`) — 2026-09-16 user decision — but ONLY for centers
that show ANY evidence of HubSpot form engagement anywhere in their whole
file (checked once against the whole file, not per month, so a genuinely
quiet month doesn't get mistaken for "this center doesn't use HubSpot's own
form tracking" and left blank). Centers with zero evidence anywhere in their
history are left alone entirely for this one metric — it stays a normal
always-editable manual field for them, exactly as it already was before this
change. Once a center qualifies, HubSpot data wins every run, same as the
other 8 metrics — this can overwrite an existing manually-typed value for
that month. `form_fills` stays `value_type='text'` in the catalog (no
migration needed): manual-sourced cells always render via `value_text`
regardless of value_type, and this script already writes both
`value`/`value_text` for every key it touches, so folding this metric into
the same upsert path required no schema change at all.

**Corrected 2026-09-16** (found via a real cross-check against a second app
using the same file, for ABC Life Choices/July): `form_fills` counts
`isFormSession=True` sessions (any session that engaged with/opened the
form widget), NOT `submitted=True` (sessions that actually completed
submission) — `submitted` was the original, too-strict choice; confirmed
live that `submitted` is a strict subset of `isFormSession` for the same
month (10 of 18), i.e. the difference is real incomplete/abandoned form
starts, not a bucketing or timezone bug. `hubspot_submission_clients` above
is unaffected by this — it's a separate, already-established metric and
still deliberately uses `submitted` (distinct clients who actually
completed a submission), not `isFormSession`.

Months are bucketed in each center's local time zone (from its state), not
UTC — see STATE_TIMEZONES.

Runs daily for every client via .github/workflows/org-data-sync.yml
(`--all --months 3`); can also be run by hand.

Usage:
    python3 scripts/sync_org_data.py --client-id <supabase-client-uuid> [--months 12] [--dry-run]
    python3 scripts/sync_org_data.py --all [--months 12] [--dry-run]

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
from zoneinfo import ZoneInfo

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

class NoOrgDataFile(Exception):
	"""Company has no her_journey_org_data file yet — a skip, not a failure (e.g. a center not yet on Her Journey)."""


def fetch_org_data(hubspot_company_id: str) -> tuple[dict, str | None]:
	"""Returns (parsed file, the company's HubSpot `timezone` property) — the
	latter is only a fallback for clients with no state_code, see
	`client_timezone`."""
	company = hubspot_get(
		f"/crm/v3/objects/companies/{hubspot_company_id}?properties=her_journey_org_data,timezone"
	)
	hubspot_timezone = company.get("properties", {}).get("timezone") or None
	file_id = company.get("properties", {}).get("her_journey_org_data")
	if not file_id:
		raise NoOrgDataFile(f"Company {hubspot_company_id} has no her_journey_org_data file set")

	signed = hubspot_get(f"/files/v3/files/{file_id}/signed-url")
	download_url = signed["url"]

	print(f"Downloading her_journey_org_data ({signed.get('size', '?')} bytes)...", file=sys.stderr)
	body = _request(download_url, headers={})
	return json.loads(body), hubspot_timezone


# ── Center-local month boundaries ───────────────────────────────────────────
# Sessions are bucketed into months by the *center's* local time, not UTC
# (2026-09-30 decision) — otherwise sessions a few hours either side of
# midnight on the 1st land in the wrong month, off by one or two from what
# the center (and the other app reading this same file) sees. Keyed off
# clients.state_code rather than HubSpot's company `timezone` property,
# which is unset on about a third of companies and wrong on some (a CA
# center set to Chicago, an OH center set to Winnipeg). States that span
# two zones use the zone most of the state's population is in.
STATE_TIMEZONES = {
	"AL": "America/Chicago", "AK": "America/Anchorage", "AZ": "America/Phoenix", "AR": "America/Chicago",
	"CA": "America/Los_Angeles", "CO": "America/Denver", "CT": "America/New_York", "DE": "America/New_York",
	"DC": "America/New_York", "FL": "America/New_York", "GA": "America/New_York", "HI": "Pacific/Honolulu",
	"ID": "America/Boise", "IL": "America/Chicago", "IN": "America/Indiana/Indianapolis", "IA": "America/Chicago",
	"KS": "America/Chicago", "KY": "America/New_York", "LA": "America/Chicago", "ME": "America/New_York",
	"MD": "America/New_York", "MA": "America/New_York", "MI": "America/Detroit", "MN": "America/Chicago",
	"MS": "America/Chicago", "MO": "America/Chicago", "MT": "America/Denver", "NE": "America/Chicago",
	"NV": "America/Los_Angeles", "NH": "America/New_York", "NJ": "America/New_York", "NM": "America/Denver",
	"NY": "America/New_York", "NC": "America/New_York", "ND": "America/Chicago", "OH": "America/New_York",
	"OK": "America/Chicago", "OR": "America/Los_Angeles", "PA": "America/New_York", "RI": "America/New_York",
	"SC": "America/New_York", "SD": "America/Chicago", "TN": "America/Chicago", "TX": "America/Chicago",
	"UT": "America/Denver", "VT": "America/New_York", "VA": "America/New_York", "WA": "America/Los_Angeles",
	"WV": "America/New_York", "WI": "America/Chicago", "WY": "America/Denver", "PR": "America/Puerto_Rico",
}


def client_timezone(state_code: str | None, hubspot_timezone: str | None) -> str:
	"""state_code → zone; HubSpot's `timezone` only when there's no state; UTC last."""
	if state_code and state_code.strip().upper() in STATE_TIMEZONES:
		return STATE_TIMEZONES[state_code.strip().upper()]
	if hubspot_timezone:
		try:
			ZoneInfo(hubspot_timezone)
			return hubspot_timezone
		except Exception:
			pass
	return "UTC"


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


def _month_bounds(month: str, tz: str = "UTC"):
	"""`month` is first-of-month YYYY-MM-01 (matches src/server/months.ts). Returns
	[start, end) as tz-aware datetimes covering the whole calendar month in
	`tz` (the center's local zone). Session timestamps parse as UTC-aware, so
	comparing across zones is exact."""
	zone = ZoneInfo(tz)
	year, mon, _ = (int(p) for p in month.split("-"))
	start = datetime(year, mon, 1, tzinfo=zone)
	end = datetime(year + 1, 1, 1, tzinfo=zone) if mon == 12 else datetime(year, mon + 1, 1, tzinfo=zone)
	return start, end


def compute_month_metrics(sessions: list, month: str, tz: str = "UTC") -> dict:
	start, end = _month_bounds(month, tz)

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

	# Form *engagement*, not completed submission (2026-09-16 correction) —
	# a session that opened/started the form widget, whether or not it was
	# ever actually submitted. Deliberately NOT `submission_sessions` above:
	# confirmed live (ABC Life Choices, July) that `submitted` underreports
	# vs. a second app reading the same file, because that app counts every
	# form-engaged session, including abandoned/incomplete ones.
	form_engaged_sessions = [s for s in month_sessions if s.get("isFormSession")]

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
		# Only kept in the final upload if this center shows any HubSpot form
		# engagement at all; see `has_form_submissions` in main(). Always
		# computed here since it's free.
		"form_fills": len(form_engaged_sessions),
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


def sync_client(client: dict, metric_id_by_key: dict, month_count: int, dry_run: bool) -> None:
	hubspot_company_id = client.get("hubspot_company_id")
	if not hubspot_company_id:
		raise RuntimeError(f"client {client['name']} has no hubspot_company_id set")

	org_data, hubspot_timezone = fetch_org_data(hubspot_company_id)
	sessions = org_data.get("sessions", [])
	tz = client_timezone(client.get("state_code"), hubspot_timezone)
	print(f"Loaded {len(sessions)} sessions for {client['name']} ({hubspot_company_id}), months bucketed in {tz}", file=sys.stderr)

	# Whole-file check, not per-month (2026-09-16 decision) — a center that
	# genuinely uses HubSpot's own form tracking can still have a real
	# zero-engagement month; only the complete absence of ANY isFormSession
	# session anywhere in their history means "this center uses a different
	# 3rd-party form system," in which case form_fills stays fully manual.
	has_form_submissions = any(s.get("isFormSession") for s in sessions)
	print(
		f"  HubSpot form-submission tracking: {'yes, will auto-fill form_fills' if has_form_submissions else 'no evidence found, form_fills stays manual'}",
		file=sys.stderr,
	)

	rows = []
	for month in trailing_months(month_count):
		values = compute_month_metrics(sessions, month, tz)
		if not has_form_submissions:
			del values["form_fills"]
		print(f"  {month}: {values}", file=sys.stderr)
		for key, value in values.items():
			rows.append({
				"client_id": client["id"],
				"metric_id": metric_id_by_key[key],
				"month": month,
				"value": value,
				"value_text": str(value),
				"updated_by": "hubspot-sync",
			})

	if dry_run:
		print(f"  Dry run — would upsert {len(rows)} monthly_data_values rows.", file=sys.stderr)
		return

	supabase_upsert("monthly_data_values", rows, on_conflict="client_id,metric_id,month")
	print(f"  Upserted {len(rows)} monthly_data_values rows for {client['name']}.", file=sys.stderr)


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	target = parser.add_mutually_exclusive_group(required=True)
	target.add_argument("--client-id", help="Supabase clients.id (uuid)")
	target.add_argument("--all", action="store_true", help="Every HubSpot-linked client (what the daily GitHub Action runs)")
	parser.add_argument("--months", type=int, default=12, help="Trailing month window (default 12, matches the app's display window)")
	parser.add_argument("--dry-run", action="store_true", help="Compute and print without writing to Supabase")
	args = parser.parse_args()

	select = "id,name,hubspot_company_id,state_code"
	if args.all:
		clients = supabase_get(f"clients?hubspot_company_id=not.is.null&select={select}&order=name")
	else:
		clients = supabase_get(f"clients?id=eq.{args.client_id}&select={select}")
		if not clients:
			print(f"Error: no client with id {args.client_id}", file=sys.stderr)
			sys.exit(1)

	# Not filtered to source=eq.hubspot — also need form_fills' id, a manual
	# metric this script opportunistically fills in when it can (see module
	# docstring). Small catalog table either way, cheap to fetch in full.
	metrics_catalog = supabase_get("monthly_metrics?select=id,key")
	metric_id_by_key = {m["key"]: m["id"] for m in metrics_catalog}

	missing_keys = set(compute_month_metrics([], trailing_months(1)[0]).keys()) - set(metric_id_by_key.keys())
	if missing_keys:
		print(f"Error: monthly_metrics catalog is missing keys: {sorted(missing_keys)}", file=sys.stderr)
		sys.exit(1)

	# One client's failure (e.g. no her_journey_org_data file yet) must not
	# stop the rest of an --all run; still exit non-zero so the scheduled
	# GitHub Action shows as failed and someone notices.
	failures = []
	skipped = []
	for client in clients:
		try:
			sync_client(client, metric_id_by_key, args.months, args.dry_run)
		except NoOrgDataFile as err:
			print(f"  SKIPPED {client['name']}: {err}", file=sys.stderr)
			skipped.append(client["name"])
		except Exception as err:  # noqa: BLE001
			print(f"  FAILED {client['name']}: {err}", file=sys.stderr)
			failures.append(client["name"])

	synced = len(clients) - len(failures) - len(skipped)
	print(f"\nDone: {synced} of {len(clients)} clients synced.", file=sys.stderr)
	if skipped:
		print(f"Skipped (no her_journey_org_data file): {', '.join(skipped)}", file=sys.stderr)
	if failures:
		print(f"Failed: {', '.join(failures)}", file=sys.stderr)
		sys.exit(1)


if __name__ == "__main__":
	main()
