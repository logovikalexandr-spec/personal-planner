import json
import pytest

from planner_bot.llm.process import process_inbox, build_process_prompt
from planner_bot.llm.anthropic_client import LLMResult


class FakeLLM:
    def __init__(self, text):
        self._text = text

    async def call_sonnet(self, *, system, user, max_tokens=1500,
                          cache_system=True):
        return LLMResult(text=self._text, tokens_in=900, tokens_out=200,
                         cache_read_in=800, cache_write_in=0,
                         cost_usd=0.005, model="claude-sonnet-4-6")


@pytest.mark.asyncio
async def test_process_returns_decision_and_summary():
    payload = json.dumps({
        "project_slug": "learning",
        "subfolder": "research",
        "summary_md": "## TL;DR\n- A\n- B\n- C",
        "action": "moved + summary",
        "confidence": 0.92,
    })
    llm = FakeLLM(payload)
    res = await process_inbox(
        llm=llm,
        item={"Id": 42, "title": "X", "summary": "s",
              "raw_content": "...", "source_type": "url",
              "transcript": ""},
        target_project={"slug": "learning", "name": "Learning",
                        "context_notes": "DB articles go here"},
        recent_filenames=["postgres-tx.md"],
    )
    assert res["project_slug"] == "learning"
    assert res["subfolder"] == "research"
    assert "TL;DR" in res["summary_md"]
    assert res["confidence"] == 0.92
    assert res["tokens_in"] == 900


def test_build_process_prompt_includes_context_notes():
    p = build_process_prompt(
        target_project={"slug": "ctok", "name": "Ctok",
                        "context_notes": "Marketing for tattoo studio"},
        recent_filenames=["x.md", "y.md"],
    )
    assert "Marketing for tattoo studio" in p
    assert "x.md" in p


@pytest.mark.asyncio
async def test_process_handles_bad_json_falls_back():
    llm = FakeLLM("garbage")
    res = await process_inbox(
        llm=llm,
        item={"Id": 1, "title": "X", "summary": "", "raw_content": "",
              "source_type": "text", "transcript": ""},
        target_project={"slug": "learning", "name": "Learning",
                        "context_notes": ""},
        recent_filenames=[],
    )
    assert res["project_slug"] == "learning"
    assert res["confidence"] == 0.5
