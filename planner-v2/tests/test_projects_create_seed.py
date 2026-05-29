"""Tests for project creation (auto-slug, parent_id) and idempotent seed."""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from planner.api.app import create_app
from planner.api.deps import get_db
from planner.db.models import Project
from planner.seed import CATEGORIES, _get_or_create
from planner.services.projects import create_project, slugify, unique_slug
from tests.test_auth_initdata import make_init_data

HDR = {"X-Telegram-Init-Data": make_init_data()}


# --------------------------------------------------------------------------- slugify
def test_slugify_transliterates_cyrillic():
    assert slugify("Здоровье") == "zdorove"
    assert slugify("Личный бренд") == "lichnyi-brend"
    assert slugify("ZIMA") == "zima"


def test_slugify_fallback_for_empty():
    assert slugify("!!!") == "project"


# --------------------------------------------------------------------------- service
@pytest.mark.asyncio
async def test_create_project_auto_slug_and_parent(db_session):
    parent = await create_project(db_session, name="Здоровье")
    assert parent.slug == "zdorove"
    assert parent.parent_id is None

    child = await create_project(db_session, name="Спорт", parent_id=parent.id)
    assert child.parent_id == parent.id


@pytest.mark.asyncio
async def test_unique_slug_collision(db_session):
    await create_project(db_session, name="Финансы")
    second = await create_project(db_session, name="Финансы")
    assert second.slug == "finansy-2"
    third = await create_project(db_session, name="Финансы")
    assert third.slug == "finansy-3"


# --------------------------------------------------------------------------- POST endpoint
@pytest_asyncio.fixture
async def client(db_engine, db_session):
    db_session.add(Project(name="Inbox", slug="inbox", is_inbox=True))
    await db_session.commit()

    app = create_app()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    async def _override():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = _override
    return TestClient(app)


def test_post_project_auto_slug_no_slug_required(client):
    r = client.post("/api/projects", json={"name": "Недвижимость"}, headers=HDR)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "nedvizhimost"
    assert body["parent_id"] is None


def test_post_project_with_parent(client):
    parent = client.post("/api/projects", json={"name": "Здоровье"}, headers=HDR).json()
    r = client.post(
        "/api/projects",
        json={"name": "Спорт", "parent_id": parent["id"]},
        headers=HDR,
    )
    assert r.status_code == 201, r.text
    assert r.json()["parent_id"] == parent["id"]


def test_post_project_requires_auth(client):
    assert client.post("/api/projects", json={"name": "X"}).status_code == 401


# --------------------------------------------------------------------------- seed idempotency
async def _run_seed(session):
    for name, slug, children in CATEGORIES:
        root = await _get_or_create(session, name=name, slug=slug, parent_id=None)
        for child_name, child_slug in children:
            await _get_or_create(session, name=child_name, slug=child_slug, parent_id=root.id)
    await session.commit()


@pytest.mark.asyncio
async def test_seed_idempotent(db_session):
    await _run_seed(db_session)
    after_first = (await db_session.execute(select(Project))).scalars().all()
    await _run_seed(db_session)
    after_second = (await db_session.execute(select(Project))).scalars().all()
    assert len(after_first) == len(after_second)


@pytest.mark.asyncio
async def test_seed_health_has_three_children(db_session):
    await _run_seed(db_session)
    health = (
        await db_session.execute(select(Project).where(Project.slug == "health"))
    ).scalar_one()
    children = (
        await db_session.execute(select(Project).where(Project.parent_id == health.id))
    ).scalars().all()
    assert len(children) == 3
