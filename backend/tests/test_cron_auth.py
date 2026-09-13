"""Constant-time auth on the cron endpoints (Finding: timing side-channel).

`require_cron` guards every scheduled job endpoint with a shared secret sent in
the `X-Cron-Secret` header. The comparison must be constant-time
(`hmac.compare_digest`) so a wrong secret can't be recovered a byte at a time by
timing the 401, and an unset secret must fail closed rather than accept an empty
header. These pin the gate's behaviour without standing up the FastAPI stack.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routers.cron as cron


def _patch_secret(monkeypatch, value):
    # Patch the name bound in the router module, not config's own get_settings —
    # the router imported the function at module load, so that's the binding the
    # dependency actually calls.
    monkeypatch.setattr(cron, "get_settings", lambda: SimpleNamespace(cron_secret=value))


def test_correct_secret_passes(monkeypatch):
    _patch_secret(monkeypatch, "s3cret")
    # No exception == authorised.
    assert cron.require_cron("s3cret") is None


def test_wrong_secret_is_rejected(monkeypatch):
    _patch_secret(monkeypatch, "s3cret")
    with pytest.raises(HTTPException) as exc:
        cron.require_cron("wrong")
    assert exc.value.status_code == 401


def test_empty_header_is_rejected(monkeypatch):
    _patch_secret(monkeypatch, "s3cret")
    with pytest.raises(HTTPException) as exc:
        cron.require_cron("")
    assert exc.value.status_code == 401


def test_unset_server_secret_fails_closed(monkeypatch):
    # An unconfigured cron secret must reject everything, including a matching
    # empty header — never authorise by accident.
    _patch_secret(monkeypatch, "")
    with pytest.raises(HTTPException) as exc:
        cron.require_cron("")
    assert exc.value.status_code == 401


def test_uses_constant_time_compare(monkeypatch):
    # The comparison must go through hmac.compare_digest, not `!=`, so a timing
    # side-channel can't leak the secret. Assert the gate actually calls it.
    _patch_secret(monkeypatch, "s3cret")
    calls = []
    real = cron.hmac.compare_digest

    def spy(a, b):
        calls.append((a, b))
        return real(a, b)

    monkeypatch.setattr(cron.hmac, "compare_digest", spy)
    cron.require_cron("s3cret")
    assert calls, "require_cron must use hmac.compare_digest for a constant-time check"
