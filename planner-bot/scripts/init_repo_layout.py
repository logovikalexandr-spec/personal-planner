"""Create the personal-planner skeleton folders and initial commit."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from planner_bot.repo_layout import all_skeleton_dirs


def main() -> int:
    repo = Path(os.environ.get("REPO_PATH", "."))
    repo.mkdir(parents=True, exist_ok=True)
    for rel in all_skeleton_dirs():
        d = repo / rel
        d.mkdir(parents=True, exist_ok=True)
        keep = d / ".gitkeep"
        if not keep.exists():
            keep.write_text("")
    readme = repo / "README.md"
    if not readme.exists():
        readme.write_text("# personal-planner\n\nManaged by planner-bot.\n")
    subprocess.check_call(["git", "-C", str(repo), "add", "."])
    rc = subprocess.run(
        ["git", "-C", str(repo), "diff", "--cached", "--quiet"]
    ).returncode
    if rc != 0:
        subprocess.check_call(
            ["git", "-C", str(repo), "commit", "-m", "init: skeleton structure"]
        )
    print("repo layout: done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
