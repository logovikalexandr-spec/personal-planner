"""TDD tests for:
- GET /api/projects -> parent_id + open_count
- GET /api/counts -> CountsOut
- GET /api/tasks?project_id=X&include_children=true
"""
from __future__ import annotations

import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from planner.api.app import create_app
from planner.api.deps import get_db
from planner.db.models import Project, Task
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


@pytest_asyncio.fixture
async def client(db_engine, db_session):
    inbox = Project(name="Inbox", slug="inbox", is_inbox=True)
    db_session.add(inbox)
    await db_session.commit()

    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


# ---------------------------------------------------------------------------
# GET /api/projects
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def seeded_client(db_engine, db_session):
    """Client with a parent project, child project, and tasks seeded."""
    inbox = Project(name="Inbox", slug="inbox-pc", is_inbox=True)
    parent = Project(name="Work", slug="work-pc")
    db_session.add_all([inbox, parent])
    await db_session.flush()

    child = Project(name="WorkSub", slug="worksub-pc", parent_id=parent.id)
    db_session.add(child)
    await db_session.flush()

    # 2 open tasks in parent
    db_session.add_all([
        Task(title="t1", project_id=parent.id, status="todo"),
        Task(title="t2", project_id=parent.id, status="in_progress"),
        Task(title="t3", project_id=parent.id, status="done"),  # not open
    ])
    # 1 open task in child
    db_session.add(Task(title="t4", project_id=child.id, status="todo"))
    await db_session.commit()

    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app), parent, child


def test_projects_has_parent_id_and_open_count(seeded_client):
    client, parent, child = seeded_client
    r = client.get("/api/projects", headers=HDR)
    assert r.status_code == 200, r.text
    projects = {p["id"]: p for p in r.json()}

    assert parent.id in projects
    assert child.id in projects

    p = projects[parent.id]
    assert "parent_id" in p
    assert p["parent_id"] is None
    assert p["open_count"] == 2

    c = projects[child.id]
    assert c["parent_id"] == parent.id
    assert c["open_count"] == 1


def test_projects_requires_auth(seeded_client):
    client, _, _ = seeded_client
    assert client.get("/api/projects").status_code == 401


# ---------------------------------------------------------------------------
# GET /api/counts
# ---------------------------------------------------------------------------

def test_counts_endpoint_keys(client):
    r = client.get("/api/counts", headers=HDR)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("all", "today", "tomorrow", "next7", "inbox"):
        assert key in data, f"missing key: {key}"


def test_counts_requires_auth(client):
    assert client.get("/api/counts").status_code == 401


# ---------------------------------------------------------------------------
# GET /api/tasks?include_children=true
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def tree_client(db_engine, db_session):
    """Client with parent -> child -> grandchild project tree, tasks in each."""
    inbox = Project(name="Inbox", slug="inbox-tc", is_inbox=True)
    parent = Project(name="Root", slug="root-tc")
    db_session.add_all([inbox, parent])
    await db_session.flush()

    child = Project(name="Child", slug="child-tc", parent_id=parent.id)
    db_session.add(child)
    await db_session.flush()

    grandchild = Project(name="GC", slug="gc-tc", parent_id=child.id)
    db_session.add(grandchild)
    await db_session.flush()

    # tasks: one in each level
    db_session.add_all([
        Task(title="parent-task", project_id=parent.id, status="todo"),
        Task(title="child-task", project_id=child.id, status="todo"),
        Task(title="gc-task", project_id=grandchild.id, status="todo"),
        Task(title="other-task", project_id=inbox.id, status="todo"),
    ])
    await db_session.commit()

    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app), parent, child, grandchild, inbox


def test_include_children_returns_whole_subtree(tree_client):
    client, parent, child, grandchild, inbox = tree_client
    r = client.get(f"/api/tasks?project_id={parent.id}&include_children=true", headers=HDR)
    assert r.status_code == 200, r.text
    titles = {t["title"] for t in r.json()}
    assert "parent-task" in titles
    assert "child-task" in titles
    assert "gc-task" in titles
    assert "other-task" not in titles


def test_include_children_false_only_direct(tree_client):
    client, parent, child, grandchild, inbox = tree_client
    r = client.get(f"/api/tasks?project_id={parent.id}&include_children=false", headers=HDR)
    assert r.status_code == 200, r.text
    titles = {t["title"] for t in r.json()}
    assert "parent-task" in titles
    assert "child-task" not in titles
    assert "gc-task" not in titles


def test_include_children_default_only_direct(tree_client):
    client, parent, child, grandchild, inbox = tree_client
    r = client.get(f"/api/tasks?project_id={parent.id}", headers=HDR)
    assert r.status_code == 200, r.text
    titles = {t["title"] for t in r.json()}
    assert "parent-task" in titles
    assert "child-task" not in titles
