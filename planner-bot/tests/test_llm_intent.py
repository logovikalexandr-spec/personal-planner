import json
import pytest

from planner_bot.llm.intent import detect_intent
from planner_bot.llm.anthropic_client import LLMResult


class FakeLLM:
    def __init__(self, text):
        self._text = text
    async def call_haiku(self, *, system, user, max_tokens=400):
        return LLMResult(text=self._text, tokens_in=120, tokens_out=30,
                         cache_read_in=0, cache_write_in=0,
                         cost_usd=0.00005, model="claude-haiku-4-5")


@pytest.mark.asyncio
async def test_intent_week_command():
    llm = FakeLLM(json.dumps({"intent": "week", "args": {}}))
    res = await detect_intent(llm=llm, text="что у меня на неделе")
    assert res["intent"] == "week"


@pytest.mark.asyncio
async def test_intent_find():
    llm = FakeLLM(json.dumps({"intent": "find",
                              "args": {"query": "postgresql"}}))
    res = await detect_intent(llm=llm, text="найди статью про postgresql")
    assert res["intent"] == "find"
    assert res["args"]["query"] == "postgresql"


@pytest.mark.asyncio
async def test_intent_create_task():
    llm = FakeLLM(json.dumps({
        "intent": "create_task",
        "args": {"title": "Созвон с Vesna клиентом",
                 "due_date": "2026-04-27", "due_time": "14:00",
                 "project_slug": "vesna-web"},
    }))
    res = await detect_intent(llm=llm, text="завтра в 14:00 созвон с Vesna клиентом")
    assert res["intent"] == "create_task"
    assert res["args"]["due_date"] == "2026-04-27"


@pytest.mark.asyncio
async def test_intent_unknown_falls_through():
    llm = FakeLLM("not json")
    res = await detect_intent(llm=llm, text="кря")
    assert res["intent"] == "unknown"
