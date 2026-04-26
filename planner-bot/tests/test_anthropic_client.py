import pytest
from planner_bot.llm.anthropic_client import AnthropicLLM


class FakeAnthropicResponse:
    def __init__(self, text, in_tok, out_tok, model):
        self.content = [type("B", (), {"type": "text", "text": text})()]
        self.usage = type("U", (), {"input_tokens": in_tok,
                                    "output_tokens": out_tok,
                                    "cache_creation_input_tokens": 0,
                                    "cache_read_input_tokens": 0})()
        self.model = model
        self.stop_reason = "end_turn"


class FakeMessages:
    def __init__(self):
        self.calls = []

    async def create(self, **kw):
        self.calls.append(kw)
        return FakeAnthropicResponse("hello", 100, 20, kw["model"])


class FakeClient:
    def __init__(self):
        self.messages = FakeMessages()


@pytest.mark.asyncio
async def test_haiku_call_uses_haiku_model():
    fake = FakeClient()
    llm = AnthropicLLM(client=fake, sonnet_model="claude-sonnet-4-6",
                       haiku_model="claude-haiku-4-5")
    res = await llm.call_haiku(system="sys", user="u")
    assert res.text == "hello"
    assert fake.messages.calls[0]["model"] == "claude-haiku-4-5"
    assert res.tokens_in == 100
    assert res.tokens_out == 20


@pytest.mark.asyncio
async def test_sonnet_call_with_cached_system():
    fake = FakeClient()
    llm = AnthropicLLM(client=fake, sonnet_model="claude-sonnet-4-6",
                       haiku_model="claude-haiku-4-5")
    await llm.call_sonnet(system="ctx", user="u", cache_system=True)
    sys_payload = fake.messages.calls[0]["system"]
    assert isinstance(sys_payload, list)
    assert sys_payload[0]["cache_control"] == {"type": "ephemeral"}


def test_cost_calculation():
    llm = AnthropicLLM.__new__(AnthropicLLM)
    cost = llm._cost("claude-sonnet-4-6", input_tokens=1_000_000,
                     output_tokens=1_000_000, cache_read=0, cache_write=0)
    assert cost > 0
