from __future__ import annotations

from dataclasses import dataclass

# Per-model price per 1M tokens (USD). Source: Anthropic public pricing snapshot
# 2026-04. Update when prices change.
_PRICING = {
    "claude-sonnet-4-6": {"in": 3.0, "out": 15.0, "cache_read": 0.30,
                          "cache_write": 3.75},
    "claude-haiku-4-5":  {"in": 0.25, "out": 1.25, "cache_read": 0.03,
                          "cache_write": 0.31},
}


@dataclass
class LLMResult:
    text: str
    tokens_in: int
    tokens_out: int
    cache_read_in: int
    cache_write_in: int
    cost_usd: float
    model: str


class AnthropicLLM:
    def __init__(self, *, client, sonnet_model: str, haiku_model: str):
        self._client = client
        self._sonnet = sonnet_model
        self._haiku = haiku_model

    @staticmethod
    def _cost(model: str, *, input_tokens: int, output_tokens: int,
              cache_read: int, cache_write: int) -> float:
        p = _PRICING[model]
        return (
            input_tokens * p["in"]
            + output_tokens * p["out"]
            + cache_read * p["cache_read"]
            + cache_write * p["cache_write"]
        ) / 1_000_000

    def _system_payload(self, system: str, cache: bool):
        if not cache:
            return system
        return [{"type": "text", "text": system,
                 "cache_control": {"type": "ephemeral"}}]

    async def _call(self, *, model: str, system: str, user: str,
                    max_tokens: int, cache_system: bool) -> LLMResult:
        resp = await self._client.messages.create(
            model=model,
            system=self._system_payload(system, cache_system),
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        cache_r = getattr(resp.usage, "cache_read_input_tokens", 0) or 0
        cache_w = getattr(resp.usage, "cache_creation_input_tokens", 0) or 0
        cost = self._cost(model,
                          input_tokens=resp.usage.input_tokens,
                          output_tokens=resp.usage.output_tokens,
                          cache_read=cache_r, cache_write=cache_w)
        return LLMResult(
            text=text, tokens_in=resp.usage.input_tokens,
            tokens_out=resp.usage.output_tokens,
            cache_read_in=cache_r, cache_write_in=cache_w,
            cost_usd=cost, model=model,
        )

    async def call_haiku(self, *, system: str, user: str,
                         max_tokens: int = 800) -> LLMResult:
        return await self._call(model=self._haiku, system=system, user=user,
                                max_tokens=max_tokens, cache_system=False)

    async def call_sonnet(self, *, system: str, user: str,
                          max_tokens: int = 1500,
                          cache_system: bool = True) -> LLMResult:
        return await self._call(model=self._sonnet, system=system, user=user,
                                max_tokens=max_tokens, cache_system=cache_system)

    async def call_vision(self, *, image_b64: str, media_type: str,
                          prompt: str, max_tokens: int = 1000) -> LLMResult:
        model = self._haiku
        resp = await self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": image_b64,
                }},
                {"type": "text", "text": prompt},
            ]}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        cache_r = getattr(resp.usage, "cache_read_input_tokens", 0) or 0
        cache_w = getattr(resp.usage, "cache_creation_input_tokens", 0) or 0
        cost = self._cost(model,
                          input_tokens=resp.usage.input_tokens,
                          output_tokens=resp.usage.output_tokens,
                          cache_read=cache_r, cache_write=cache_w)
        return LLMResult(
            text=text, tokens_in=resp.usage.input_tokens,
            tokens_out=resp.usage.output_tokens,
            cache_read_in=cache_r, cache_write_in=cache_w,
            cost_usd=cost, model=model,
        )
