from planner_bot.acl import can_access_project, filter_visible_projects


def _proj(slug, vis="shared", owner=None):
    return {"slug": slug, "visibility": vis, "owner_role": owner}


def test_shared_visible_to_all():
    assert can_access_project({"role": "seryozha"}, _proj("learning"))
    assert can_access_project({"role": "sasha"}, _proj("learning"))


def test_private_only_owner():
    assert can_access_project({"role": "sasha"},
                              _proj("ctok", "private", "sasha"))
    assert not can_access_project({"role": "seryozha"},
                                  _proj("ctok", "private", "sasha"))


def test_filter_visible():
    user = {"role": "seryozha"}
    rows = [
        _proj("ctok", "private", "sasha"),
        _proj("personal-seryozha", "private", "seryozha"),
        _proj("learning"),
    ]
    visible = filter_visible_projects(user, rows)
    slugs = [p["slug"] for p in visible]
    assert slugs == ["personal-seryozha", "learning"]
