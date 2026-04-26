from pathlib import Path


def test_dockerfile_pins_python_version():
    text = Path("Dockerfile").read_text()
    assert "FROM python:3.11" in text
    assert "PYTHONUNBUFFERED=1" in text


def test_dockerfile_has_entrypoint():
    text = Path("Dockerfile").read_text()
    assert "planner_bot.bot" in text
