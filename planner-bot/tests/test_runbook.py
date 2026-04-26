from pathlib import Path


def test_deploy_runbook_sections():
    text = Path("docs/superpowers/runbooks/deploy.md").read_text()
    for section in ("VPS prerequisites", "GitHub repo",
                    "NocoDB tables", "Seed", "Bot start", "Verify"):
        assert section in text
