import os
import pytest


@pytest.mark.skipif(not os.environ.get("E2E_SMOKE"),
                    reason="set E2E_SMOKE=1 to run against live NocoDB")
def test_e2e_inbox_capture_then_process():
    """Manual smoke. Follow E2E_CHECKLIST.md."""
    raise NotImplementedError("Manual smoke. Follow tests/E2E_CHECKLIST.md.")
