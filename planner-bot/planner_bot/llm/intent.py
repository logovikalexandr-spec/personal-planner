from __future__ import annotations

import json
from datetime import date
from textwrap import dedent

_VALID = {"inbox", "today", "week", "projects", "project", "find",
          "stats", "process_last", "create_task", "project_overview",
          "unknown"}


def _system(today_iso: str) -> str:
    return dedent(f"""\
        Detect user intent for a personal Telegram planner.
        Today: {today_iso} (Europe/Prague). Russian + English text supported.
        Return STRICT JSON: {{"intent": "<name>", "args": {{...}} }}.

        Allowed intents:
          - inbox          (no args)
          - today          (no args)
          - week           (optional args.project_slug)
          - projects       (no args)
          - project        (args.slug)
          - find           (args.query)
          - stats          (no args)
          - process_last   (no args)
          - create_task    (args.title, args.due_date YYYY-MM-DD nullable,
                            args.due_time HH:MM nullable, args.project_slug nullable)
          - project_overview (args.slug)
          - unknown        (when nothing matches)

        Use 'unknown' liberally if uncertain. JSON only, no prose.
    """)


async def detect_intent(*, llm, text: str,
                        today_iso: str | None = None) -> dict:
    today_iso = today_iso or date.today().isoformat()
    res = await llm.call_haiku(system=_system(today_iso), user=text,
                               max_tokens=400)
    raw = res.text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").lstrip("json").strip()
    try:
        d = json.loads(raw)
    except Exception:
        return {"intent": "unknown", "args": {}, "tokens_in": res.tokens_in,
                "tokens_out": res.tokens_out, "cost_usd": res.cost_usd}
    intent = d.get("intent")
    if intent not in _VALID:
        intent = "unknown"
    return {"intent": intent, "args": d.get("args") or {},
            "tokens_in": res.tokens_in, "tokens_out": res.tokens_out,
            "cost_usd": res.cost_usd}
