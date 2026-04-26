from __future__ import annotations

import json
from textwrap import dedent


def build_classify_prompt(projects: list[dict]) -> str:
    lines = ["You classify incoming inbox items for a personal planner.",
             "Projects available (slug — name — short description):"]
    for p in projects:
        lines.append(f"- {p['slug']} — {p['name']} — {p.get('description') or ''}")
    lines.append(dedent("""\
        Return STRICT JSON with keys:
          title (string, ≤80 chars, derived from content)
          summary (string, 1-2 sentences in Russian)
          guess_project_slug (one of the slugs above, or null)
          confidence (float 0..1)
        No prose outside JSON. No backticks.
    """))
    return "\n".join(lines)


def _safe_parse(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    try:
        d = json.loads(text)
    except Exception:
        return {"title": "", "summary": "",
                "guess_project_slug": None, "confidence": 0.0}
    return {
        "title": (d.get("title") or "")[:80],
        "summary": d.get("summary") or "",
        "guess_project_slug": d.get("guess_project_slug"),
        "confidence": float(d.get("confidence") or 0.0),
    }


async def classify_inbox(*, llm, projects: list[dict], item: dict) -> dict:
    system = build_classify_prompt(projects)
    user = (
        f"Source type: {item['source_type']}\n"
        f"Initial title hint: {item.get('initial_title','')}\n"
        f"Content:\n{item['raw_content'][:4000]}"
    )
    res = await llm.call_haiku(system=system, user=user)
    parsed = _safe_parse(res.text)
    if not parsed["title"]:
        parsed["title"] = (item.get("initial_title") or "Item")[:80]
    parsed["tokens_in"] = res.tokens_in
    parsed["tokens_out"] = res.tokens_out
    parsed["cost_usd"] = res.cost_usd
    return parsed
