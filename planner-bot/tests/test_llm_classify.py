import json
import pytest

from planner_bot.llm.classify import classify_inbox, build_classify_prompt


class FakeLLM:
    def __init__(self, text):
        self._text = text

    async def call_haiku(self, *, system, user, max_tokens=800):
        from planner_bot.llm.anthropic_client import LLMResult
        return LLMResult(text=self._text, tokens_in=200, tokens_out=50,
                         cache_read_in=0, cache_write_in=0,
                         cost_usd=0.0001, model="claude-haiku-4-5")


@pytest.mark.asyncio
async def test_classify_returns_parsed_dict():
    payload = json.dumps({
        "title": "PostgreSQL replication",
        "summary": "Статья про синхронную репликацию.",
        "guess_project_slug": "learning",
        "confidence": 0.9,
    })
    llm = FakeLLM(payload)
    projects = [
        {"slug": "learning", "name": "Learning", "description": "obs"},
        {"slug": "ctok", "name": "Ctok", "description": "tattoo"},
    ]
    res = await classify_inbox(
        llm=llm, projects=projects,
        item={"raw_content": "https://habr.com/x", "source_type": "url",
              "initial_title": "habr.com/x"},
    )
    assert res["title"] == "PostgreSQL replication"
    assert res["guess_project_slug"] == "learning"
    assert res["confidence"] == 0.9
    assert res["tokens_in"] == 200


def test_build_classify_prompt_lists_projects():
    projects = [{"slug": "ctok", "name": "Ctok", "description": "tattoo"}]
    prompt = build_classify_prompt(projects)
    assert "ctok" in prompt
    assert "Ctok" in prompt


@pytest.mark.asyncio
async def test_classify_handles_malformed_json():
    llm = FakeLLM("not json")
    res = await classify_inbox(
        llm=llm, projects=[],
        item={"raw_content": "hello", "source_type": "text",
              "initial_title": "hello"},
    )
    assert res["confidence"] == 0.0
    assert res["guess_project_slug"] is None
