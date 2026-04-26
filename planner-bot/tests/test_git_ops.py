import subprocess
from pathlib import Path
import pytest

from planner_bot.git_ops import safe_commit, GitOpsError


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    upstream = tmp_path / "upstream.git"
    subprocess.check_call(["git", "init", "--bare", str(upstream)])
    work = tmp_path / "work"
    subprocess.check_call(["git", "clone", str(upstream), str(work)])
    subprocess.check_call(["git", "-C", str(work), "config", "user.email", "t@t"])
    subprocess.check_call(["git", "-C", str(work), "config", "user.name", "t"])
    (work / "README.md").write_text("init\n")
    subprocess.check_call(["git", "-C", str(work), "add", "."])
    subprocess.check_call(["git", "-C", str(work), "commit", "-m", "init"])
    subprocess.check_call(["git", "-C", str(work), "push", "origin", "HEAD:refs/heads/main"])
    subprocess.check_call(["git", "-C", str(work), "branch", "-M", "main"])
    subprocess.check_call(["git", "-C", str(work), "branch", "--set-upstream-to=origin/main"])
    return work


def test_safe_commit_creates_commit(repo: Path):
    f = repo / "_inbox" / "x.md"
    f.parent.mkdir(parents=True)
    f.write_text("hello")
    safe_commit(repo_path=repo, paths=[f], message="add x")
    log = subprocess.check_output(["git", "-C", str(repo), "log", "--oneline"]).decode()
    assert "add x" in log


def test_safe_commit_noop_when_clean(repo: Path):
    safe_commit(repo_path=repo, paths=[], message="noop")
    log = subprocess.check_output(["git", "-C", str(repo), "log", "--oneline"]).decode()
    assert log.count("\n") == 1
