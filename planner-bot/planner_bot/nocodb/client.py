from __future__ import annotations

import httpx


class NocoDBClient:
    """Thin async wrapper over NocoDB v2 records API.

    Repos in `repos.py` build on this. Keeping the client typeless
    (dict in / dict out) so that NocoDB schema drift surfaces in the
    repo layer where we have explicit pydantic models.
    """

    def __init__(self, base_url: str, token: str, timeout: float = 20.0,
                 table_map: dict[str, str] | None = None):
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"xc-token": token},
            timeout=timeout,
        )
        self._table_map = table_map or {}

    def _tbl(self, name: str) -> str:
        return self._table_map.get(name, name)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list(self, table: str, *, where: str | None = None,
                   limit: int = 25, offset: int = 0,
                   sort: str | None = None) -> list[dict]:
        params: dict = {"limit": limit}
        if offset:
            params["offset"] = offset
        if where:
            params["where"] = where
        if sort:
            params["sort"] = sort
        r = await self._client.get(f"/tables/{self._tbl(table)}/records", params=params)
        r.raise_for_status()
        return r.json().get("list", [])

    async def get(self, table: str, record_id: int) -> dict | None:
        r = await self._client.get(f"/tables/{self._tbl(table)}/records/{record_id}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    async def insert(self, table: str, data: dict) -> dict:
        r = await self._client.post(f"/tables/{self._tbl(table)}/records", json=data)
        r.raise_for_status()
        return r.json()

    async def update(self, table: str, record_id: int, data: dict) -> dict:
        r = await self._client.patch(
            f"/tables/{self._tbl(table)}/records",
            json={"Id": record_id, **data},
        )
        r.raise_for_status()
        return r.json()
