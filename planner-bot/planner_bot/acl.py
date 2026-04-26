def can_access_project(user: dict, project: dict) -> bool:
    if project.get("archived"):
        return False
    if project["visibility"] == "shared":
        return True
    return project.get("owner_role") == user["role"]


def filter_visible_projects(user: dict, projects: list[dict]) -> list[dict]:
    return [p for p in projects if can_access_project(user, p)]
