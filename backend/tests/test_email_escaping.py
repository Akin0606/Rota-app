"""HTML-escaping of dynamic values in email templates (Finding 3).

Every template interpolates caller-supplied strings — staff/venue names, shift
labels, the free-text detail/headline sentences — into an HTML f-string. A staff
name is attacker-influenced (set through the public self-registration join flow)
and venue/shift names are venue-configured, so unescaped they inject markup into
the recipient's inbox. These pin the escaping at the pure building blocks and at
`_pin_email_html`, which assembles a full email body without sending.
"""

from services.email_service import _button, _esc, _pin_badge, _pin_email_html, _shell

XSS = '<script>alert(document.cookie)</script>'
IMG = '<img src=x onerror=alert(1)>'


def test_esc_neutralises_html_metacharacters():
    out = _esc(IMG)
    assert "<img" not in out
    assert "&lt;img" in out
    assert ">" not in out  # the closing bracket is entity-encoded too


def test_esc_escapes_quotes_for_attribute_safety():
    out = _esc('a" onmouseover="evil()')
    assert '"' not in out
    assert "&quot;" in out


def test_esc_handles_none_and_non_strings():
    assert _esc(None) == ""
    assert _esc(7) == "7"


def test_esc_leaves_plain_text_untouched():
    assert _esc("David") == "David"


def test_button_escapes_both_label_and_href():
    # A malicious label can't inject markup, and a malicious URL can't break out
    # of the href attribute.
    out = _button(IMG, 'https://x/"><script>bad</script>')
    assert "<script>" not in out
    assert "<img" not in out
    # The legitimate anchor structure survives.
    assert out.startswith('<a href="')


def test_pin_badge_escapes_its_value():
    assert "<b>" not in _pin_badge("<b>1234</b>")


def test_shell_escapes_preheader_and_footer_but_not_body():
    html = _shell(XSS, IMG, "<strong>real markup stays</strong>")
    # Caller-built body markup passes through untouched...
    assert "<strong>real markup stays</strong>" in html
    # ...but the plain-text preheader/footer are escaped.
    assert "<script>" not in html
    assert "<img" not in html
    assert "&lt;script&gt;" in html


def test_pin_email_body_escapes_injected_name_and_venue():
    subject, html = _pin_email_html(
        name=XSS,
        venue_name='Bob & <b>Sons</b>',
        pin="1234",
        venue_link_url="https://rotally.co.uk/v/tok",
        reset=True,
    )
    # No raw injected markup anywhere in the rendered HTML.
    assert "<script>" not in html
    assert "<b>Sons</b>" not in html
    assert "&lt;script&gt;" in html
    assert "Bob &amp; " in html
    # The template's own markup (the emphasised venue name) is preserved.
    assert "<strong>" in html


def test_subject_keeps_the_raw_value():
    # A subject is plain text, not HTML — it must NOT be entity-encoded, or the
    # recipient sees literal `&amp;` in their inbox.
    subject, _ = _pin_email_html(
        name="David",
        venue_name="Bob & Sons",
        pin="1234",
        venue_link_url="https://rotally.co.uk/v/tok",
        reset=False,
    )
    assert subject == "Your PIN for Bob & Sons"
