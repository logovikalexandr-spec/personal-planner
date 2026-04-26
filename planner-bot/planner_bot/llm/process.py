from __future__ import annotations

import json
from textwrap import dedent

_VALID_SUBFOLDERS = {"inbox", "research", "tasks", "notes", "files"}


def build_process_prompt(*, target_project: dict,
                         recent_filenames: list[str]) -> str:
    notes = (target_project.get("context_notes")
             or target_project.get("context_notes_compact") or "")
    files = "\n".join(f"  - {n}" for n in recent_filenames[:20]) or "  (empty)"
    return dedent(f"""\
        You are processing an inbox item for the personal planner project.

        Target project: {target_project['name']} (slug: {target_project['slug']})
        Project memory:
        {notes or '(no notes)'}

        Recent files in the project:
        {files}

        Decide:
          - subfolder (one of: inbox, research, tasks, notes, files)
          - a short Russian markdown summary block (### TL;DR with 3 bullet points)
          - action label (one short phrase like "moved + summary")

        Reply STRICT JSON only:
        {{
          "project_slug": "<slug>",
          "subfolder": "<one of valid>",
          "summary_md": "### TL;DR\\n- ...\\n- ...\\n- ...",
          "action": "...",
          "confidence": 0.0..1.0
        }}
    """)


def _parse(text: str, default_slug: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    try:
        d = json.loads(text)
    except Exception:
        return {"project_slug": default_slug, "subfolder": "research",
                "summary_md": "", "action": "moved",
                "confidence": 0.5}
    sf = d.get("subfolder") or "research"
    if sf not in _VALID_SUBFOLDERS:
        sf = "research"
    return {
        "project_slug": d.get("project_slug") or default_slug,
        "subfolder": sf,
        "summary_md": d.get("summary_md") or "",
        "action": d.get("action") or "moved",
        "confidence": float(d.get("confidence") or 0.5),
    }


async def process_inbox(*, llm, item: dict, target_project: dict,
                        recent_filenames: list[str]) -> dict:
    system = build_process_prompt(target_project=target_project,
                                  recent_filenames=recent_filenames)
    user_lines = [
        f"Item #{item['Id']}: {item.get('title','')}",
        f"Source: {item['source_type']}",
        f"Summary so far: {item.get('summary','')}",
    ]
    if item.get("transcript"):
        user_lines.append(f"Transcript:\n{item['transcript'][:3000]}")
    if item.get("raw_content"):
        user_lines.append(f"Content:\n{item['raw_content'][:3000]}")
    res = await llm.call_sonnet(system=system, user="\n\n".join(user_lines))
    parsed = _parse(res.text, default_slug=target_project["slug"])
    parsed["tokens_in"] = res.tokens_in
    parsed["tokens_out"] = res.tokens_out
    parsed["cost_usd"] = res.cost_usd
    return parsed
