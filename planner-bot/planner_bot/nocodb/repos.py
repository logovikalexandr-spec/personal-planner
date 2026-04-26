from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from planner_bot.nocodb.client import NocoDBClient


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class UsersRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def get_by_telegram_id(self, tg_id: int) -> dict | None:
        rows = await self._c.list("Users",
                                  where=f"(telegram_id,eq,{tg_id})", limit=1)
        return rows[0] if rows else None

    async def list_all(self) -> list[dict]:
        return await self._c.list("Users", limit=100)

    async def upsert_by_telegram_id(self, tg_id: int, name: str) -> dict:
        existing = await self.get_by_telegram_id(tg_id)
        if existing:
            return existing
        return await self._c.insert("Users", {
            "telegram_id": tg_id, "name": name,
            "role": "sasha", "timezone": "Europe/Prague",
            "created_at": _now_iso(),
        })


class ProjectsRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def get_by_slug(self, slug: str) -> dict | None:
        rows = await self._c.list("Projects",
                                  where=f"(slug,eq,{slug})", limit=1)
        return rows[0] if rows else None

    async def list_all(self) -> list[dict]:
        return await self._c.list("Projects", limit=200,
                                  where="(archived,eq,false)")

    async def list_visible_to(self, role: str) -> list[dict]:
        rows = await self.list_all()
        return [r for r in rows
                if r["visibility"] == "shared"
                or r.get("owner_role") == role]

    async def update_context_notes(self, project_id: int, notes: str) -> dict:
        return await self._c.update("Projects", project_id,
                                    {"context_notes": notes})


class InboxRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def create(self, data: dict) -> dict:
        payload = {"created_at": _now_iso(), "status": "new", **data}
        return await self._c.insert("Inbox", payload)

    async def get(self, item_id: int) -> dict | None:
        return await self._c.get("Inbox", item_id)

    async def update(self, item_id: int, data: dict) -> dict:
        return await self._c.update("Inbox", item_id, data)

    async def list_unprocessed_for_user(self, author_id: int,
                                        shared_authors: list[int]) -> list[dict]:
        ids = ",".join(str(i) for i in [author_id, *shared_authors])
        where = f"(status,eq,new)~and(author_id,in,{ids})"
        return await self._c.list("Inbox", where=where, sort="-created_at",
                                  limit=50)

    async def search_text(self, query: str, limit: int = 10) -> list[dict]:
        where = (f"(title,like,%{query}%)~or(summary,like,%{query}%)"
                 f"~or(transcript,like,%{query}%)~or(raw_content,like,%{query}%)")
        return await self._c.list("Inbox", where=where, limit=limit,
                                  sort="-created_at")


class TasksRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def create(self, data: dict) -> dict:
        payload = {"created_at": _now_iso(), "status": "todo", **data}
        return await self._c.insert("Tasks", payload)

    async def get(self, task_id: int) -> dict | None:
        return await self._c.get("Tasks", task_id)

    async def update(self, task_id: int, data: dict) -> dict:
        return await self._c.update("Tasks", task_id, data)

    async def list_for_user_active(self, author_id: int) -> list[dict]:
        where = f"(author_id,eq,{author_id})~and(status,in,todo,in_progress)"
        return await self._c.list("Tasks", where=where,
                                  sort="quadrant,due_date", limit=200)

    async def list_today(self, author_id: int, today: str) -> list[dict]:
        where = (f"(author_id,eq,{author_id})~and(status,in,todo,in_progress)"
                 f"~and(due_date,eq,{today})")
        return await self._c.list("Tasks", where=where,
                                  sort="quadrant,due_time", limit=100)

    async def list_week(self, author_id: int, start: str, end: str) -> list[dict]:
        where = (f"(author_id,eq,{author_id})~and(status,in,todo,in_progress)"
                 f"~and(due_date,btw,{start},{end})")
        return await self._c.list("Tasks", where=where,
                                  sort="due_date,quadrant,due_time", limit=200)

    async def list_q1_today(self, author_id: int, today: str) -> list[dict]:
        where = (f"(author_id,eq,{author_id})~and(status,eq,todo)"
                 f"~and(quadrant,eq,Q1)~and(due_date,eq,{today})")
        return await self._c.list("Tasks", where=where, limit=50)


class ActionsRepo:
    def __init__(self, client: NocoDBClient):
        self._c = client

    async def log(self, *, action_type: str, author_id: int,
                  llm_input: str = "", llm_output: str = "",
                  llm_model: str = "", tokens_in: int = 0,
                  tokens_out: int = 0, cost_usd: float = 0.0,
                  inbox_id: int | None = None, task_id: int | None = None,
                  user_decision: str = "") -> dict:
        return await self._c.insert("Actions", {
            "created_at": _now_iso(),
            "action_type": action_type, "author_id": author_id,
            "llm_input": llm_input, "llm_output": llm_output,
            "llm_model": llm_model, "tokens_in": tokens_in,
            "tokens_out": tokens_out, "cost_usd": cost_usd,
            "inbox_id": inbox_id, "task_id": task_id,
            "user_decision": user_decision,
        })
