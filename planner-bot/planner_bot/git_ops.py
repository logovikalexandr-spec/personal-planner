from __future__ import annotations

import subprocess
from pathlib import Path

from loguru import logger


class GitOpsError(RuntimeError):
    pass


def _git(repo: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        raise GitOpsError(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout


def safe_commit(*, repo_path: Path, paths: list[Path], message: str,
                push: bool = True) -> None:
    """Pull --rebase, stage paths, commit if dirty, push.

    Idempotent on empty changes (no commit, no push).
    """
    if push:
        try:
            _git(repo_path, "pull", "--rebase", "--autostash")
        except GitOpsError as e:
            logger.warning(f"pull failed (continuing): {e}")
    for p in paths:
        rel = p.relative_to(repo_path) if p.is_absolute() else p
        _git(repo_path, "add", str(rel))
    diff = subprocess.run(
        ["git", "-C", str(repo_path), "diff", "--cached", "--quiet"],
    )
    if diff.returncode == 0:
        logger.debug("safe_commit: nothing to commit")
        return
    _git(repo_path, "commit", "-m", message)
    if push:
        _git(repo_path, "push")
