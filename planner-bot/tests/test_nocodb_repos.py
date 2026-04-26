import pytest
from planner_bot.nocodb.repos import (
    UsersRepo, ProjectsRepo, InboxRepo, TasksRepo, ActionsRepo,
)


class StubClient:
    def __init__(self, list_result=None, get_result=None, insert_result=None,
                 update_result=None):
        self._list = list_result or []
        self._get = get_result
        self._insert = insert_result or {"Id": 1}
        self._update = update_result or {"Id": 1}
        self.calls = []

    async def list(self, table, **kw):
        self.calls.append(("list", table, kw))
        return self._list

    async def get(self, table, record_id):
        self.calls.append(("get", table, record_id))
        return self._get

    async def insert(self, table, data):
        self.calls.append(("insert", table, data))
        return self._insert

    async def update(self, table, record_id, data):
        self.calls.append(("update", table, record_id, data))
        return self._update


@pytest.mark.asyncio
async def test_users_get_by_telegram_id():
    cli = StubClient(list_result=[{"Id": 1, "telegram_id": 42, "name": "Sasha", "role": "sasha"}])
    repo = UsersRepo(cli)
    u = await repo.get_by_telegram_id(42)
    assert u["name"] == "Sasha"
    assert cli.calls[0][2]["where"] == "(telegram_id,eq,42)"


@pytest.mark.asyncio
async def test_users_upsert_inserts_when_missing():
    cli = StubClient(list_result=[], insert_result={"Id": 7, "telegram_id": 99,
                                                    "name": "Sasha", "role": "sasha"})
    repo = UsersRepo(cli)
    u = await repo.upsert_by_telegram_id(99, "Sasha")
    assert u["Id"] == 7
    assert any(c[0] == "insert" for c in cli.calls)


@pytest.mark.asyncio
async def test_inbox_create_new():
    cli = StubClient(insert_result={"Id": 42})
    repo = InboxRepo(cli)
    rec = await repo.create({
        "author_id": 1, "source_type": "url",
        "raw_content": "https://x", "title": "X",
        "status": "new",
    })
    assert rec["Id"] == 42
    assert cli.calls[0][1] == "Inbox"


@pytest.mark.asyncio
async def test_inbox_list_unprocessed_for_user():
    cli = StubClient(list_result=[{"Id": 1}])
    repo = InboxRepo(cli)
    rows = await repo.list_unprocessed_for_user(author_id=1, shared_authors=[2])
    assert rows == [{"Id": 1}]
    where = cli.calls[0][2]["where"]
    assert "status,eq,new" in where
    assert "author_id,in,1,2" in where


@pytest.mark.asyncio
async def test_projects_visible_to():
    cli = StubClient(list_result=[
        {"Id": 1, "slug": "ctok", "visibility": "private", "owner_role": "sasha"},
        {"Id": 2, "slug": "learning", "visibility": "shared", "owner_role": None},
    ])
    repo = ProjectsRepo(cli)
    rows = await repo.list_visible_to("sasha")
    assert {r["slug"] for r in rows} == {"ctok", "learning"}


@pytest.mark.asyncio
async def test_tasks_create_with_quadrant():
    cli = StubClient(insert_result={"Id": 17})
    repo = TasksRepo(cli)
    t = await repo.create({"author_id": 1, "title": "X", "quadrant": "Q1",
                           "status": "todo"})
    assert t["Id"] == 17


@pytest.mark.asyncio
async def test_actions_log():
    cli = StubClient(insert_result={"Id": 1})
    repo = ActionsRepo(cli)
    await repo.log(action_type="propose_project", author_id=1,
                   inbox_id=42, llm_model="claude-haiku-4-5",
                   tokens_in=300, tokens_out=50, cost_usd=0.001,
                   llm_input="...", llm_output="...")
    assert cli.calls[0][1] == "Actions"
    assert cli.calls[0][2]["action_type"] == "propose_project"
