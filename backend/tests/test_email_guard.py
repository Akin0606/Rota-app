"""The non-production send guard (services/email_service._recipient_allowed).

Staging shares code, cron scheduler and potentially data with production, so
these cases are the difference between a safe staging environment and one that
emails real staff after a prod-data restore.
"""

from types import SimpleNamespace

from services.email_service import _recipient_allowed


def _settings(environment: str, allowlist: str = "", frontend_url: str = "https://rotally.co.uk"):
    return SimpleNamespace(
        environment=environment, email_allowlist=allowlist, frontend_url=frontend_url
    )


def test_production_sends_to_anyone():
    assert _recipient_allowed("anyone@example.com", _settings("production"))


def test_production_is_case_insensitive_on_the_env_name():
    assert _recipient_allowed("anyone@example.com", _settings("  Production  "))


def test_staging_with_no_allowlist_blocks_everyone():
    # Fails closed: an unconfigured non-prod environment emails nobody.
    assert not _recipient_allowed("real.staff@pub.co.uk", _settings("staging"))


def test_staging_allows_an_exact_address():
    s = _settings("staging", "dev@rotally.co.uk")
    assert _recipient_allowed("dev@rotally.co.uk", s)
    assert not _recipient_allowed("real.staff@pub.co.uk", s)


def test_staging_allows_a_domain_suffix():
    s = _settings("staging", "@rotally.co.uk")
    assert _recipient_allowed("anyone@rotally.co.uk", s)
    assert not _recipient_allowed("anyone@pub.co.uk", s)


def test_domain_rule_does_not_match_a_lookalike_domain():
    # "@rotally.co.uk" must not admit "evil-rotally.co.uk".
    s = _settings("staging", "@rotally.co.uk")
    assert not _recipient_allowed("someone@notrotally.co.uk.attacker.com", s)


def test_matching_ignores_case_and_surrounding_space():
    s = _settings("staging", " Dev@Rotally.co.uk , @Example.COM ")
    assert _recipient_allowed("  DEV@rotally.CO.UK  ", s)
    assert _recipient_allowed("x@example.com", s)


def test_empty_entries_in_the_allowlist_are_ignored():
    # A trailing comma must not turn into a match-everything rule.
    assert not _recipient_allowed("real.staff@pub.co.uk", _settings("staging", "dev@rotally.co.uk,,"))


def test_a_staging_frontend_url_blocks_even_when_environment_says_production():
    # The hole this closes: forgetting ENVIRONMENT=staging on the staging
    # service would otherwise let it email real staff freely.
    s = _settings("production", frontend_url="https://staging.rotally.co.uk")
    assert not _recipient_allowed("real.staff@pub.co.uk", s)


def test_a_localhost_frontend_url_blocks_too():
    s = _settings("production", frontend_url="http://localhost:3000")
    assert not _recipient_allowed("real.staff@pub.co.uk", s)


def test_real_production_still_sends():
    s = _settings("production", frontend_url="https://rotally.co.uk")
    assert _recipient_allowed("real.staff@pub.co.uk", s)
