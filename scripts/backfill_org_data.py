#!/usr/bin/env python3
"""
One-off (re-runnable) backfill of the HopeSync-sourced Monthly Data metrics,
from each client's go-live date up to where the daily sync takes over.

Why this exists: the daily `sync_org_data.py` reads the HubSpot
`her_journey_org_data` file, which HerJourney DataPull rebuilds nightly from
only the trailing 214 days of HopeSync data — anything older never reaches
`monthly_data_values`. This script pulls the older history straight from
HopeSync, one calendar month per request, and writes the same metrics with
the same formulas (imported from sync_org_data.py). It deliberately does NOT
go through HubSpot: that file is overwritten in place and read by other apps,
and the nightly batch would replace it anyway.

Pipeline per client-month:
  HopeSync (dataSet 1, 2, 3, sequential) → HerJourney ProcessData
  (merge_interactions_by_view_id → create_sessions, the same steps as
  DataPull's _run_pipeline) → compute_month_metrics → Supabase upsert.

Months covered: go_live_date's month through the month before the trailing
3 the daily job already owns (`--months 3`), newest first. A client stops
early after 3 consecutive months with zero HopeSync records (treated as the
start of HopeSync's retention) — empty months are left blank, never 0.

Staying under HopeSync's (undocumented) limits — it's an Azure Logic App:
  - `--concurrency` clients in parallel (default 2), one month at a time each
  - ~1s pause between calls per worker
  - retry 408/429/5xx/timeouts with exponential backoff + jitter, honouring
    Retry-After, up to 5 attempts; other 4xx fail that month immediately
  - after 5 consecutive throttled/failed calls across all workers, everyone
    pauses for 3 minutes
Don't run it across HerJourney's nightly batch (02:30 America/Denver) or the
12:00 UTC org-data sync.

Each month's raw HopeSync response is cached gzipped under backfill-cache/
(gitignored). The cache is also the checkpoint: a re-run skips the API for
any month already cached, and `--from-cache` recomputes everything (e.g.
after a formula change) with zero API calls.

`form_fills` follows sync_org_data.py's whole-history rule, judged once per
client from their CURRENT her_journey_org_data file: filled only if that file
shows any isFormSession evidence, otherwise left manual — and even then a
month someone typed a value into by hand is never overwritten.

Usage:
    python3 scripts/backfill_org_data.py --client-id <uuid> [--dry-run] [--from 2026-03 --to 2026-07]
    python3 scripts/backfill_org_data.py --all [--concurrency 2] [--from-cache] [--dry-run]

`--dry-run` computes and prints without writing, and shows any difference
from values already in Supabase — run it over months the daily sync already
filled to check that month-by-month pulls match the full-file numbers.

Requires (in .dev.vars or the environment), on top of sync_org_data.py's
HUBSPOT_API_TOKEN / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY:
  HOPESYNC_API_KEY, HOPESYNC_SIG — the same values HerJourney DataPull uses
  PROCESSDATA_DIR — HerJourney's ProcessData/ folder (defaults to the
                    sibling checkout ../HerJourney/HJApp/AppData-SB/ProcessData)
"""

import argparse
import gzip
import json
import random
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sync_org_data as sod  # noqa: E402 (loads .dev.vars and checks the shared env vars on import)

HOPESYNC_API_KEY = sod._ENV.get("HOPESYNC_API_KEY")
HOPESYNC_SIG = sod._ENV.get("HOPESYNC_SIG")
PROCESSDATA_DIR = Path(
	sod._ENV.get("PROCESSDATA_DIR")
	or sod.REPO_ROOT.parent / "HerJourney" / "HJApp" / "AppData-SB" / "ProcessData"
)
CACHE_DIR = sod.REPO_ROOT / "backfill-cache"

HOPESYNC_URL = (
	"https://hopesynclogicapps.azurewebsites.net/api/agencyDownload/triggers"
	"/When_an_HTTP_request_is_received/invoke"
	"?api-version=2022-05-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig="
)

CALL_PAUSE_SECONDS = 1
CALL_TIMEOUT_SECONDS = 600  # matches DataPull's httpx timeout
MAX_ATTEMPTS = 5
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}
BREAKER_THRESHOLD = 5
BREAKER_PAUSE_SECONDS = 180
EMPTY_MONTHS_BEFORE_STOP = 3
DAILY_SYNC_MONTHS = 3  # .github/workflows/org-data-sync.yml runs --months 3
SYNC_WRITERS = {"hubspot-sync", "hopesync-backfill", None}


# ── Circuit breaker shared by all workers ───────────────────────────────────

class _Breaker:
	def __init__(self):
		self._lock = threading.Lock()
		self._consecutive_failures = 0
		self._paused_until = 0.0

	def wait(self):
		while True:
			with self._lock:
				remaining = self._paused_until - time.monotonic()
			if remaining <= 0:
				return
			time.sleep(min(remaining, 5))

	def record(self, ok: bool):
		with self._lock:
			if ok:
				self._consecutive_failures = 0
				return
			self._consecutive_failures += 1
			if self._consecutive_failures >= BREAKER_THRESHOLD:
				print(f"!! {self._consecutive_failures} failed HopeSync calls in a row — pausing all workers {BREAKER_PAUSE_SECONDS}s", file=sys.stderr)
				self._paused_until = time.monotonic() + BREAKER_PAUSE_SECONDS
				self._consecutive_failures = 0


_breaker = _Breaker()


# ── HopeSync ────────────────────────────────────────────────────────────────

class HopeSyncError(Exception):
	pass


def _hopesync_call(org_id: str, start: str, end: str, dataset: int) -> list:
	"""One POST, with retry/backoff. Uses curl like sync_org_data._request, but
	keeps response headers so 429s can honour Retry-After."""
	body = json.dumps({
		"apiKey": HOPESYNC_API_KEY,
		"orgId": org_id,
		"startDate": start,
		"endDate": end,
		"dataSet": dataset,
	}).encode("utf-8")

	for attempt in range(1, MAX_ATTEMPTS + 1):
		_breaker.wait()
		with tempfile.NamedTemporaryFile() as out:
			result = subprocess.run(
				[
					"curl", "-sS", "-X", "POST", "--max-time", str(CALL_TIMEOUT_SECONDS),
					"-H", "Content-Type: application/json",
					"--data-binary", "@-", "-D", "-", "-o", out.name,
					HOPESYNC_URL + HOPESYNC_SIG,
				],
				input=body,
				capture_output=True,
			)
			retry_after = None
			if result.returncode != 0:
				status = None
				error = f"curl exit {result.returncode}: {result.stderr.decode(errors='replace').strip()}"
			else:
				status, retry_after = _parse_headers(result.stdout.decode(errors="replace"))
				payload = Path(out.name).read_bytes()
				if status is not None and 200 <= status < 300:
					_breaker.record(True)
					parsed = json.loads(payload)
					if parsed.get("success") is False:
						raise HopeSyncError(f"dataSet={dataset} {start}..{end}: success=false: {payload[:300].decode(errors='replace')}")
					# The API always returns the payload under "data1", whichever
					# dataSet was requested (same quirk DataPull works around).
					return parsed.get("data1") or []
				error = f"HTTP {status}: {payload[:300].decode(errors='replace')}"
				if status not in RETRYABLE_STATUS:
					_breaker.record(False)
					raise HopeSyncError(f"dataSet={dataset} {start}..{end}: {error}")

		_breaker.record(False)
		if attempt == MAX_ATTEMPTS:
			raise HopeSyncError(f"dataSet={dataset} {start}..{end}: gave up after {MAX_ATTEMPTS} attempts, last: {error}")
		delay = retry_after if retry_after is not None else 2 ** attempt + random.uniform(0, 1)
		print(f"    retry {attempt}/{MAX_ATTEMPTS - 1} in {delay:.0f}s (dataSet={dataset} {start}..{end}: {error})", file=sys.stderr)
		time.sleep(delay)


def _parse_headers(raw: str) -> tuple[int | None, float | None]:
	"""Last status line wins (curl prints one block per response, e.g. after a 100 Continue)."""
	status, retry_after = None, None
	for line in raw.splitlines():
		if line.startswith("HTTP/"):
			parts = line.split()
			status = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
			retry_after = None
		elif line.lower().startswith("retry-after:"):
			value = line.split(":", 1)[1].strip()
			retry_after = float(value) if value.replace(".", "", 1).isdigit() else None
	return status, retry_after


def fetch_month_raw(org_id: str, month: str, from_cache: bool) -> dict | None:
	"""Raw HopeSync datasets for `month`, padded a day either side so sessions
	near midnight / across the center's UTC offset aren't cut —
	compute_month_metrics filters to the exact center-local bounds afterwards.
	Returns None if `from_cache` and the month was never pulled."""
	path = CACHE_DIR / org_id / f"{month[:7]}.json.gz"
	if path.exists():
		with gzip.open(path, "rt", encoding="utf-8") as f:
			return json.load(f)
	if from_cache:
		return None

	first = date.fromisoformat(month)
	next_first = date(first.year + 1, 1, 1) if first.month == 12 else date(first.year, first.month + 1, 1)
	start = (first - timedelta(days=1)).isoformat()
	end = next_first.isoformat()  # last day of month + 1

	raw = {"startDate": start, "endDate": end}
	for dataset in (1, 2, 3):
		raw[f"data{dataset}"] = _hopesync_call(org_id, start, end, dataset)
		time.sleep(CALL_PAUSE_SECONDS)

	# Only cache once all 3 datasets succeeded; write-then-rename so an
	# interrupted run never leaves a half-written checkpoint.
	path.parent.mkdir(parents=True, exist_ok=True)
	tmp = path.with_suffix(".tmp")
	with gzip.open(tmp, "wt", encoding="utf-8") as f:
		json.dump(raw, f)
	tmp.replace(path)
	return raw


# ── ProcessData (HerJourney's real pipeline, not a port) ────────────────────

def load_pipeline():
	if not (PROCESSDATA_DIR / "processors" / "create_sessions.py").exists():
		print(f"Error: HerJourney ProcessData not found at {PROCESSDATA_DIR} (set PROCESSDATA_DIR)", file=sys.stderr)
		sys.exit(1)
	sys.path.insert(0, str(PROCESSDATA_DIR))
	from processors.merge_interactions import merge_interactions_by_view_id
	from processors.create_sessions import create_sessions

	def build_sessions(raw: dict) -> list:
		# Same as DataPull's _run_pipeline; filter_sessions(sessions, {}) is a
		# no-op and sync_org_data.py reads the unfiltered `sessions` anyway.
		interactions = merge_interactions_by_view_id(raw["data1"], raw["data2"], raw["data3"])
		return create_sessions(interactions)

	return build_sessions


# ── Month ranges ────────────────────────────────────────────────────────────

def months_between(first: str, last: str) -> list[str]:
	"""Inclusive, both YYYY-MM(-DD); returns first-of-month YYYY-MM-01 strings."""
	y, m = int(first[:4]), int(first[5:7])
	ly, lm = int(last[:4]), int(last[5:7])
	months = []
	while (y, m) <= (ly, lm):
		months.append(f"{y:04d}-{m:02d}-01")
		y, m = (y + 1, 1) if m == 12 else (y, m + 1)
	return months


def backfill_months(go_live_date: str, from_month: str | None, to_month: str | None) -> list[str]:
	"""Newest first. Default end is the month before the daily sync's window."""
	default_last = sod.trailing_months(DAILY_SYNC_MONTHS + 1)[0]
	first = from_month or go_live_date
	last = to_month or default_last
	return list(reversed(months_between(first, last)))


# ── Per client ──────────────────────────────────────────────────────────────

def backfill_client(client: dict, metric_id_by_key: dict, key_by_metric_id: dict, build_sessions, args) -> dict:
	name = client["name"]
	summary = {"name": name, "done": 0, "empty": 0, "failed": 0, "uncached": 0}

	months = backfill_months(client["go_live_date"], args.from_month, args.to_month)
	if not months:
		summary["skipped"] = "go-live is within the daily sync's window, nothing to backfill"
		return summary

	company = sod.hubspot_get(
		f"/crm/v3/objects/companies/{client['hubspot_company_id']}?properties=hopesync_org_id,her_journey_org_data,timezone"
	)
	props = company.get("properties", {})
	org_id = props.get("hopesync_org_id")
	if not org_id:
		summary["skipped"] = "no hopesync_org_id in HubSpot"
		return summary
	tz = sod.client_timezone(client.get("state_code"), props.get("timezone"))

	# Whole-history form_fills rule (see module docstring) — one download per client.
	has_form_submissions = False
	if props.get("her_journey_org_data"):
		current, _ = sod.fetch_org_data(client["hubspot_company_id"])
		has_form_submissions = any(s.get("isFormSession") for s in current.get("sessions", []))
		del current

	# Unlike the daily sync, never overwrite a hand-entered form_fills: older
	# months predate a center's HubSpot form tracking, so the backfill would
	# replace real typed-in counts with 0s.
	manual_form_fill_months = set()
	if has_form_submissions:
		manual_form_fill_months = {
			r["month"] for r in sod.supabase_get(
				f"monthly_data_values?client_id=eq.{client['id']}&metric_id=eq.{metric_id_by_key['form_fills']}&select=month,updated_by"
			) if r.get("updated_by") not in SYNC_WRITERS
		}

	print(f"[{name}] org {org_id}, {len(months)} months ({months[-1][:7]} .. {months[0][:7]} newest first), tz {tz}, form_fills {'auto' if has_form_submissions else 'manual'}", file=sys.stderr)

	consecutive_empty = 0
	for month in months:
		try:
			raw = fetch_month_raw(org_id, month, args.from_cache)
		except Exception as err:  # noqa: BLE001
			print(f"[{name}] {month[:7]} FAILED: {err}", file=sys.stderr)
			summary["failed"] += 1
			continue
		if raw is None:
			summary["uncached"] += 1
			continue

		if not (raw["data1"] or raw["data2"] or raw["data3"]):
			summary["empty"] += 1
			consecutive_empty += 1
			print(f"[{name}] {month[:7]}: no HopeSync records", file=sys.stderr)
			if consecutive_empty >= EMPTY_MONTHS_BEFORE_STOP and not (args.from_month or args.to_month):
				print(f"[{name}] {EMPTY_MONTHS_BEFORE_STOP} empty months in a row — assuming HopeSync history starts here, stopping", file=sys.stderr)
				break
			continue
		consecutive_empty = 0

		values = sod.compute_month_metrics(build_sessions(raw), month, tz)
		if not has_form_submissions or month in manual_form_fill_months:
			del values["form_fills"]

		if args.dry_run:
			existing = sod.supabase_get(
				f"monthly_data_values?client_id=eq.{client['id']}&month=eq.{month}&select=metric_id,value"
			)
			existing_by_key = {key_by_metric_id.get(r["metric_id"]): r["value"] for r in existing}
			diffs = {
				k: (existing_by_key[k], v) for k, v in values.items()
				if k in existing_by_key and existing_by_key[k] is not None and float(existing_by_key[k]) != float(v)
			}
			print(f"[{name}] {month[:7]}: {values}" + (f"\n    differs from Supabase (old, new): {diffs}" if diffs else ""), file=sys.stderr)
			summary["done"] += 1
			continue

		rows = [{
			"client_id": client["id"],
			"metric_id": metric_id_by_key[key],
			"month": month,
			"value": value,
			"value_text": str(value),
			"updated_by": "hopesync-backfill",
		} for key, value in values.items()]
		sod.supabase_upsert("monthly_data_values", rows, on_conflict="client_id,metric_id,month")
		print(f"[{name}] {month[:7]}: upserted {values}", file=sys.stderr)
		summary["done"] += 1

	return summary


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	target = parser.add_mutually_exclusive_group(required=True)
	target.add_argument("--client-id", help="Supabase clients.id (uuid)")
	target.add_argument("--all", action="store_true", help="Every HubSpot-linked client with a go_live_date")
	parser.add_argument("--from", dest="from_month", help="Override first month, YYYY-MM (default: go-live month)")
	parser.add_argument("--to", dest="to_month", help="Override last month, YYYY-MM (default: month before the daily sync's 3)")
	parser.add_argument("--concurrency", type=int, default=2, help="Clients processed in parallel (default 2)")
	parser.add_argument("--from-cache", action="store_true", help="Recompute from backfill-cache/ only — no HopeSync calls")
	parser.add_argument("--dry-run", action="store_true", help="Compute and print (with diffs vs Supabase) without writing")
	args = parser.parse_args()

	if not args.from_cache and not (HOPESYNC_API_KEY and HOPESYNC_SIG):
		print("Error: HOPESYNC_API_KEY and HOPESYNC_SIG must be set (checked .dev.vars and environment)", file=sys.stderr)
		sys.exit(1)
	build_sessions = load_pipeline()

	select = "id,name,hubspot_company_id,state_code,go_live_date"
	if args.all:
		clients = sod.supabase_get(f"clients?hubspot_company_id=not.is.null&select={select}&order=name")
	else:
		clients = sod.supabase_get(f"clients?id=eq.{args.client_id}&select={select}")
		if not clients:
			print(f"Error: no client with id {args.client_id}", file=sys.stderr)
			sys.exit(1)

	no_go_live = [c["name"] for c in clients if not c.get("go_live_date")]
	clients = [c for c in clients if c.get("go_live_date") and c.get("hubspot_company_id")]

	metrics_catalog = sod.supabase_get("monthly_metrics?select=id,key")
	metric_id_by_key = {m["key"]: m["id"] for m in metrics_catalog}
	key_by_metric_id = {m["id"]: m["key"] for m in metrics_catalog}

	def run(client):
		try:
			return backfill_client(client, metric_id_by_key, key_by_metric_id, build_sessions, args)
		except Exception as err:  # noqa: BLE001
			print(f"[{client['name']}] FAILED: {err}", file=sys.stderr)
			return {"name": client["name"], "done": 0, "empty": 0, "failed": 1, "uncached": 0, "error": str(err)}

	with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
		summaries = list(pool.map(run, clients))

	print("\nSummary (months done / empty / failed):", file=sys.stderr)
	for s in summaries:
		note = s.get("skipped") or s.get("error") or ""
		uncached = f", {s['uncached']} not cached" if s["uncached"] else ""
		print(f"  {s['name']}: {s['done']} / {s['empty']} / {s['failed']}{uncached}{'  — ' + note if note else ''}", file=sys.stderr)
	if no_go_live:
		print(f"No go_live_date set (not backfilled): {', '.join(no_go_live)}", file=sys.stderr)
	if any(s["failed"] for s in summaries):
		sys.exit(1)


if __name__ == "__main__":
	main()
