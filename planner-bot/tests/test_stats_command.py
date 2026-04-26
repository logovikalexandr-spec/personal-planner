import pytest
from unittest.mock import AsyncMock, MagicMock

from planner_bot.handlers.stats_command import stats_command
from tests.fakes.tg_fake import make_update, FakeContext


class StubClient:
    def __init__(self, listing):
        self._l = listing

    async def list(self, table, **kw):
        return self._l.get(table, [])


@pytest.mark.asyncio
async def test_stats_renders_counts():
    user = {"Id": 1, "name": "Sasha", "role": "sasha"}
    users_repo = MagicMock()
    users_repo.get_by_telegram_id = AsyncMock(return_value=user)
    raw_client = StubClient({
        "Inbox": [{"Id": 1, "status": "processed"},
                  {"Id": 2, "status": "new"},
                  {"Id": 3, "status": "processed"}],
        "Tasks": [{"Id": 1, "status": "done", "quadrant": "Q1"},
                  {"Id": 2, "status": "todo", "quadrant": "Q2"}],
        "Actions": [{"Id": 1, "cost_usd": 0.05},
                    {"Id": 2, "cost_usd": 0.02}],
    })
    upd = make_update("/stats", user_id=42)
    ctx = FakeContext()
    ctx.bot_data.update({"users_repo": users_repo,
                         "nocodb_client": raw_client})
    await stats_command(upd, ctx)
    text = upd.message.sent[0]["text"]
    assert "Inbox" in text
    assert "0.07" in text or "$0.0" in text
