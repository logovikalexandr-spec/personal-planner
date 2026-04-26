from __future__ import annotations

import json
from textwrap import dedent


def _system(slugs: list[str]) -> str:
    return dedent(f"""\
        The user is clarifying which project an inbox item belongs to.
        Available project slugs: {', '.join(slugs)}.
        From the user's text, extract:
          - project_slug (must be one of the slugs above)
          - rule_to_remember: a short Russian sentence describing the rule
            ("X — складывать сюда") for future similar items.
        STRICT JSON, no prose.
    """)


async def extract_clarification(*, llm, text: str, item: dict,
                                slugs: list[str]) -> dict:
    res = await llm.call_haiku(system=_system(slugs),
                               user=f"User said: {text}\nItem title: {item.get('title','')}")
    raw = res.text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").lstrip("json").strip()
    try:
        d = json.loads(raw)
    except Exception:
        return {"project_slug": slugs[0] if slugs else "learning",
                "rule_to_remember": ""}
    return {
        "project_slug": d.get("project_slug")
                        or (slugs[0] if slugs else "learning"),
        "rule_to_remember": d.get("rule_to_remember") or "",
    }
