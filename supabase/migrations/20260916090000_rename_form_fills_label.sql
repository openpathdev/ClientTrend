-- "Form Fills (if separate system)" -> "Form Fills": now that sync_org_data.py
-- opportunistically auto-fills this metric for centers with real HubSpot form
-- data (2026-09-16), the "(if separate system)" caveat no longer describes
-- every case — it still stays manually editable for centers without HubSpot
-- form tracking, but the label itself should just read "Form Fills".
update monthly_metrics set label = 'Form Fills' where key = 'form_fills';
