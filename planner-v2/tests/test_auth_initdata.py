import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from planner.api.auth import InitDataError, verify_init_data

BOT_TOKEN = "123456:TESTTOKEN"
OWNER = 555


def make_init_data(user_id=OWNER, auth_date=None, token=BOT_TOKEN):
    auth_date = auth_date if auth_date is not None else int(time.time())
    user = json.dumps({"id": user_id, "first_name": "Sasha"})
    fields = {"auth_date": str(auth_date), "user": user}
    dcs = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    fields["hash"] = h
    return urlencode(fields)


def test_valid_initdata_returns_owner():
    u = verify_init_data(make_init_data(), bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)
    assert u.id == OWNER
    assert u.first_name == "Sasha"


def test_bad_signature_rejected():
    bad = make_init_data(token="999:WRONG")
    with pytest.raises(InitDataError):
        verify_init_data(bad, bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)


def test_stale_initdata_rejected():
    stale = make_init_data(auth_date=int(time.time()) - 100000)
    with pytest.raises(InitDataError):
        verify_init_data(stale, bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)


def test_non_owner_rejected():
    other = make_init_data(user_id=999)
    with pytest.raises(InitDataError):
        verify_init_data(other, bot_token=BOT_TOKEN, owner_id=OWNER, max_age_sec=86400)
