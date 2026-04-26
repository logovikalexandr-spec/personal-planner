from scripts.seed_nocodb import build_seed_payloads


def test_users_seed_payload():
    payloads = build_seed_payloads()
    users = payloads["Users"]
    names = {u["name"] for u in users}
    assert names == {"Sasha", "Seryozha"}
    assert all(u["timezone"] == "Europe/Prague" for u in users)


def test_projects_seed_payload():
    payloads = build_seed_payloads()
    projects = payloads["Projects"]
    slugs = {p["slug"] for p in projects}
    assert {"personal-sasha", "personal-seryozha", "learning",
            "ctok", "zima", "mr-vlad", "champ", "vesna-web",
            "prague-investment"}.issubset(slugs)
    ctok = next(p for p in projects if p["slug"] == "ctok")
    assert ctok["visibility"] == "private"
    assert ctok["owner_role"] == "sasha"
    learning = next(p for p in projects if p["slug"] == "learning")
    assert learning["visibility"] == "shared"
    assert learning["owner_role"] is None
