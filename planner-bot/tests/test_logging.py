from pathlib import Path
from planner_bot.bot import _setup_logging


def test_setup_logging_creates_log_file(tmp_path: Path):
    _setup_logging(level="INFO", logs_dir=tmp_path)
    log = tmp_path / "bot.log"
    from loguru import logger
    logger.info("hello")
    assert log.exists()
    assert "hello" in log.read_text()
