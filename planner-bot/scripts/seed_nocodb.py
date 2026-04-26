"""Idempotent NocoDB seed for Users + Projects.

Run once after creating the NocoDB project and before first bot start.
The bot itself never modifies Users/Projects schema; this script does.
"""

from __future__ import annotations

import os
import sys
import httpx


SEED_USERS = [
    {"telegram_id": None, "name": "Sasha", "role": "sasha", "timezone": "Europe/Prague"},
    {"telegram_id": None, "name": "Seryozha", "role": "seryozha", "timezone": "Europe/Prague"},
]

SEED_PROJECTS = [
    # personal — private to each sibling
    {"slug": "personal-sasha", "category": "personal", "name": "Personal — Sasha",
     "visibility": "private", "owner_role": "sasha",
     "folder_path": "projects/personal/sasha"},
    {"slug": "personal-seryozha", "category": "personal", "name": "Personal — Seryozha",
     "visibility": "private", "owner_role": "seryozha",
     "folder_path": "projects/personal/seryozha"},
    # learning — shared
    {"slug": "learning", "category": "learning", "name": "Learning",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/learning"},
    # work — Ctok private to Sasha, rest shared
    {"slug": "ctok", "category": "work", "name": "Ctok — тату-студия",
     "visibility": "private", "owner_role": "sasha",
     "folder_path": "projects/work/ctok"},
    {"slug": "zima", "category": "work", "name": "ZIMA",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/zima"},
    {"slug": "mr-vlad", "category": "work", "name": "MR-VLAD",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/mr-vlad"},
    {"slug": "champ", "category": "work", "name": "Champ",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/champ"},
    {"slug": "vesna-web", "category": "work", "name": "Vesna Web",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/vesna-web"},
    {"slug": "prague-investment", "category": "work", "name": "Prague Investment",
     "visibility": "shared", "owner_role": None,
     "folder_path": "projects/work/prague-investment"},
]


def build_seed_payloads() -> dict[str, list[dict]]:
    return {"Users": SEED_USERS, "Projects": SEED_PROJECTS}


def upsert(client: httpx.Client, table: str, rows: list[dict], unique_field: str) -> None:
    """Upsert rows by `unique_field`. Idempotent."""
    existing = client.get(f"/tables/{table}/records",
                          params={"limit": 1000}).json().get("list", [])
    existing_keys = {r[unique_field] for r in existing}
    for row in rows:
        if row[unique_field] in existing_keys:
            continue
        client.post(f"/tables/{table}/records", json=row).raise_for_status()


def main() -> int:
    base = os.environ["NOCODB_URL"].rstrip("/")
    token = os.environ["NOCODB_TOKEN"]
    payloads = build_seed_payloads()
    with httpx.Client(base_url=base, headers={"xc-token": token}, timeout=20.0) as c:
        upsert(c, "Users", payloads["Users"], unique_field="name")
        upsert(c, "Projects", payloads["Projects"], unique_field="slug")
    print("seed: done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
