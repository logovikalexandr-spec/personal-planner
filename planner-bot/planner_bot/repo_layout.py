"""Path helpers for the personal-planner content repo."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path

CYR_TO_LAT = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
})


def slugify(text: str, maxlen: int = 60) -> str:
    text = text.strip().lower()
    text = text.translate(CYR_TO_LAT)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9\s\-]+", "", text)
    text = re.sub(r"[\s_]+", "-", text).strip("-")
    return text[:maxlen]


def _ts_compact(iso: str) -> tuple[str, str]:
    dt = datetime.fromisoformat(iso)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H%M")


def inbox_path(repo: Path, created_iso: str, title: str) -> Path:
    ymd, hm = _ts_compact(created_iso)
    return repo / "_inbox" / f"{ymd}-{hm}-{slugify(title)}.md"


def archive_inbox_path(repo: Path, ym: str) -> Path:
    return repo / "_archive" / "inbox" / ym


def archive_tasks_path(repo: Path, ym: str) -> Path:
    return repo / "_archive" / "tasks" / ym


def project_subfolder(repo: Path, folder_path: str, sub: str) -> Path:
    return repo / folder_path / sub


def task_path(repo: Path, created_iso: str, title: str) -> Path:
    dt = datetime.fromisoformat(created_iso)
    ym = dt.strftime("%Y-%m")
    ymd, hm = _ts_compact(created_iso)
    return repo / "tasks" / ym / f"{ymd}-{hm}-{slugify(title)}.md"


_PROJECT_PATHS = [
    "projects/personal/sasha", "projects/personal/seryozha",
    "projects/learning",
    "projects/work/ctok", "projects/work/zima", "projects/work/mr-vlad",
    "projects/work/champ", "projects/work/vesna-web",
    "projects/work/prague-investment",
]
_SUBFOLDERS = ["inbox", "research", "tasks", "notes", "files"]


def all_skeleton_dirs() -> list[str]:
    out = ["_inbox", "_archive/inbox", "_archive/tasks",
           "_meta/context_notes_history", "_meta/monthly_reports", "tasks"]
    for p in _PROJECT_PATHS:
        for s in _SUBFOLDERS:
            out.append(f"{p}/{s}")
    return out
