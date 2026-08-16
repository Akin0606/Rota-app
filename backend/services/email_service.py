"""Transactional email sending via Resend, matching the app's visual branding
(system-ui font, #FF4D00 orange accent, 16px card radius, subtle borders)."""

from typing import Optional

import resend

from config import get_settings

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _shell(preheader: str, footer_note: str, body_html: str) -> str:
    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid rgba(0,0,0,0.04);overflow:hidden;" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 32px;border-bottom:1px solid rgba(0,0,0,0.04);">
<span style="font-size:16px;font-weight:700;color:#111827;letter-spacing:-0.02em;">crewplan<span style="color:#FF4D00;">.</span></span>
</td></tr>
<tr><td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">
{body_html}
</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid rgba(0,0,0,0.04);">
<p style="margin:0;font-size:12px;color:#9ca3af;">{footer_note}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def _button(text: str, url: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:#FF4D00;color:#ffffff;'
        f"text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;"
        f'border-radius:10px;margin-top:8px;">{text}</a>'
    )


def _pin_badge(pin: str) -> str:
    return (
        '<div style="margin:24px 0;text-align:center;">'
        '<span style="display:inline-block;background:#fff1eb;color:#FF4D00;font-size:32px;'
        f'font-weight:700;letter-spacing:0.15em;padding:16px 32px;border-radius:12px;">{pin}</span>'
        "</div>"
    )


def _send(
    to_email: Optional[str],
    subject: str,
    html: str,
    attachments: Optional[list[dict]] = None,
) -> dict:
    if not to_email:
        return {"status": "skipped", "reason": "no recipient email"}

    settings = get_settings()
    if not settings.resend_api_key:
        return {"status": "skipped", "reason": "RESEND_API_KEY not configured"}

    resend.api_key = settings.resend_api_key
    params = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if attachments:
        params["attachments"] = attachments
    try:
        result = resend.Emails.send(params)
        return {"status": "sent", "id": result.get("id") if isinstance(result, dict) else None}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def pdf_attachment(filename: str, content: bytes) -> dict:
    """A Resend attachment spec for a PDF. Resend's Python SDK takes the raw
    bytes as a list of ints."""
    return {"filename": filename, "content": list(content), "content_type": "application/pdf"}


# 1. Magic-link login (manager auth) ----------------------------------------

def send_magic_link_email(to_email: str, venue_name: str, magic_link_url: str) -> dict:
    subject = f"Your login link for {venue_name}"
    body = f"""
<p style="margin:0 0 16px;">Here's your login link for <strong>{venue_name}</strong>.</p>
{_button("Log in", magic_link_url)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This link expires shortly and can only be used once. If you didn't request it, you can ignore this email.</p>
"""
    html = _shell(f"Your login link for {venue_name}", f"Sent because you have a manager account for {venue_name} on Crewplan.", body)
    return _send(to_email, subject, html)


# 1b. Onboarding activation (§1) — an activation moment, not a receipt --------

def send_activation_email(to_email: str, activation_url: str) -> dict:
    subject = "You're in — set up your venue"
    body = f"""
<p style="margin:0 0 16px;">You're in. Set up your venue in about 3 minutes — no password to create, this link signs you in.</p>
{_button("Set up my venue", activation_url)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This link works for 7 days and signs you in once. If you didn't request it, you can ignore this email.</p>
"""
    html = _shell("You're in — set up your venue", "Your Crewplan invite is ready — set up your venue in about 3 minutes.", body)
    return _send(to_email, subject, html)


# 2. Staff welcome / PIN delivery --------------------------------------------

def send_staff_welcome_email(to_email: str, name: str, venue_name: str, pin: str, venue_link_url: str) -> dict:
    subject = f"You're on the rota for {venue_name}"
    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;">You've been added to <strong>{venue_name}</strong>'s rota. Your personal PIN is below — use it to submit your availability each week.</p>
{_pin_badge(pin)}
{_button("Go to " + venue_name, venue_link_url)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Keep this PIN private — it's how the rota identifies you.</p>
"""
    html = _shell(f"Your PIN for {venue_name} is {pin}", f"Sent because you were added to the {venue_name} team on Crewplan.", body)
    return _send(to_email, subject, html)


# 3. PIN reset / PIN reminder (shared template, different copy) -------------

def _pin_email_html(name: str, venue_name: str, pin: str, venue_link_url: str, *, reset: bool) -> tuple[str, str]:
    if reset:
        subject = f"Your PIN for {venue_name} has been reset"
        lede = "your PIN for <strong>%s</strong> has been reset. Your new PIN is below." % venue_name
    else:
        subject = f"Your PIN for {venue_name}"
        lede = "here's your PIN for <strong>%s</strong>, as requested." % venue_name

    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;">{lede}</p>
{_pin_badge(pin)}
{_button("Go to " + venue_name, venue_link_url)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Keep this PIN private — it's how the rota identifies you.</p>
"""
    html = _shell(subject, f"Sent because you're part of the {venue_name} team on Crewplan.", body)
    return subject, html


def send_pin_reset_email(to_email: str, name: str, venue_name: str, pin: str, venue_link_url: str) -> dict:
    subject, html = _pin_email_html(name, venue_name, pin, venue_link_url, reset=True)
    return _send(to_email, subject, html)


def send_pin_reminder_email(to_email: str, name: str, venue_name: str, pin: str, venue_link_url: str) -> dict:
    subject, html = _pin_email_html(name, venue_name, pin, venue_link_url, reset=False)
    return _send(to_email, subject, html)


# 4. Availability reminder ---------------------------------------------------

def send_availability_reminder_email(
    to_email: str,
    name: str,
    venue_name: str,
    week_label: str,
    venue_link_url: str,
    deadline_label: str,
    pin: str,
) -> dict:
    subject = f"Please submit your availability for {week_label}"
    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;">Please submit your availability for <strong>{week_label}</strong> at {venue_name}. Use your PIN below at your venue link.</p>
{_pin_badge(pin)}
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Deadline: <strong>{deadline_label}</strong></p>
{_button("Submit availability", venue_link_url)}
"""
    html = _shell(f"Availability needed for {week_label}", f"Sent because you're part of the {venue_name} team on Crewplan.", body)
    return _send(to_email, subject, html)


# 4a2. Auto-submit heads-up (§6b) — sent when the cron copies a staffer's usual
#      pattern forward, so it's never silent. -------------------------------------

def send_auto_submit_email(
    to_email: Optional[str],
    name: str,
    venue_name: str,
    week_label: str,
    venue_link_url: str,
    pin: Optional[str] = None,
) -> dict:
    subject = f"We submitted your usual availability for {week_label}"
    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;">You&apos;re set to auto-submit, so we sent your usual availability for <strong>{week_label}</strong> at {venue_name} — no need to do anything if it still fits.</p>
<p style="margin:0 0 16px;">If this week is different, tap below to change it before the deadline.</p>
{_pin_badge(pin) if pin else ""}
{_button("Change my availability", venue_link_url)}
"""
    html = _shell(f"Your usual availability was sent for {week_label}", f"Sent because auto-submit is on for your {venue_name} account on Crewplan.", body)
    return _send(to_email, subject, html)


# 4b. Availability window opens (to staff) -----------------------------------

def send_availability_open_email(
    to_email: str,
    name: str,
    venue_name: str,
    week_label: str,
    venue_link_url: str,
    deadline_label: str,
    pin: str,
) -> dict:
    subject = f"Availability is now open for {week_label}"
    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;">Availability is now open for <strong>{week_label}</strong> at {venue_name}. Log yours using your PIN below.</p>
{_pin_badge(pin)}
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Please submit by <strong>{deadline_label}</strong>.</p>
{_button("Log your availability", venue_link_url)}
"""
    html = _shell(f"Availability open for {week_label}", f"Sent because you're part of the {venue_name} team on Crewplan.", body)
    return _send(to_email, subject, html)


# 4c. Availability window closes (to staff) ----------------------------------

def send_availability_closed_email(
    to_email: str,
    name: str,
    venue_name: str,
    week_label: str,
    rota_link_url: str,
) -> dict:
    subject = f"The rota for {week_label} is now locked"
    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;">Availability for <strong>{week_label}</strong> at {venue_name} has closed and the rota is now locked. You'll be notified once it's published.</p>
{_button("View the rota", rota_link_url)}
"""
    html = _shell(f"Availability closed for {week_label}", f"Sent because you're part of the {venue_name} team on Crewplan.", body)
    return _send(to_email, subject, html)


# 5. Manager review -----------------------------------------------------------

def send_manager_review_email(
    to_email: str,
    manager_name: str,
    venue_name: str,
    week_label: str,
    submitted_count: int,
    total_count: int,
    review_link_url: str,
    conflicts: int = 0,
) -> dict:
    subject = f"Rota ready to review — {week_label}"
    conflicts_line = (
        f"""<p style="margin:0 0 16px;font-size:13px;color:#b91c1c;">{conflicts} shift{"s" if conflicts != 1 else ""} still need staff — review before publishing.</p>"""
        if conflicts > 0
        else ""
    )
    body = f"""
<p style="margin:0 0 8px;">Hi {manager_name},</p>
<p style="margin:0 0 16px;">Your rota for <strong>{week_label}</strong> at {venue_name} is ready to review.</p>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">{submitted_count}/{total_count} staff submitted availability.</p>
{conflicts_line}
{_button("Review rota", review_link_url)}
"""
    html = _shell(f"Rota ready to review for {week_label}", f"Sent because you manage {venue_name} on Crewplan.", body)
    return _send(to_email, subject, html)


# 6. Published rota (to staff) ------------------------------------------------

def send_published_rota_email(
    to_email: str,
    name: str,
    venue_name: str,
    week_label: str,
    shifts: list[dict],
    rota_link_url: str,
    attachments: Optional[list[dict]] = None,
) -> dict:
    subject = f"Your rota for {week_label}"

    rows = "".join(
        f"""<tr>
<td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.04);font-size:14px;color:#111827;">
<strong>{s['day_label']}</strong><br>
<span style="color:#6b7280;">{s['shift_name']} · {s['start_time']}–{s['end_time']}</span>
</td>
</tr>"""
        for s in shifts
    )

    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;">Here's your rota for <strong>{week_label}</strong> at {venue_name}. You're working:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
{rows}
</table>
{_button("View full rota", rota_link_url)}
"""
    html = _shell(f"Your rota for {week_label}", f"Sent because you're part of the {venue_name} team on Crewplan.", body)
    return _send(to_email, subject, html, attachments=attachments)


def send_manager_rota_email(
    to_email: str,
    venue_name: str,
    week_label: str,
    total_shifts: int,
    dashboard_link_url: str,
    attachments: Optional[list[dict]] = None,
) -> dict:
    """Emails the manager the full published rota, with the branded PDF attached
    (triggered from the publish options panel)."""
    subject = f"Rota for {week_label} — {venue_name}"
    body = f"""
<p style="margin:0 0 16px;">Here's the published rota for <strong>{week_label}</strong> at {venue_name}.</p>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">{total_shifts} shift{"s" if total_shifts != 1 else ""} assigned. The full rota is attached as a PDF.</p>
{_button("Open in Crewplan", dashboard_link_url)}
"""
    html = _shell(f"Rota for {week_label}", f"Sent because you manage {venue_name} on Crewplan.", body)
    return _send(to_email, subject, html, attachments=attachments)


# 6b. Shift given (to the recipient) ------------------------------------------

def send_shift_give_email(
    to_email: str,
    name: str,
    giver_name: str,
    venue_name: str,
    shift_label: str,
    venue_link_url: str,
) -> dict:
    subject = f"{giver_name} wants to give you a shift"
    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;"><strong>{giver_name}</strong> has offered you their <strong>{shift_label}</strong> shift at {venue_name}. Open your hub to accept or decline.</p>
{_button("Open your hub", venue_link_url)}
"""
    html = _shell(f"{giver_name} wants to give you a shift", f"Sent because you're part of the {venue_name} team on Crewplan.", body)
    return _send(to_email, subject, html)


# 6c. Shift swap proposed (to the recipient) ----------------------------------

def send_shift_swap_email(
    to_email: str,
    name: str,
    initiator_name: str,
    venue_name: str,
    their_shift_label: str,
    my_shift_label: str,
    venue_link_url: str,
) -> dict:
    subject = f"{initiator_name} wants to swap shifts with you"
    body = f"""
<p style="margin:0 0 8px;">Hi {name},</p>
<p style="margin:0 0 16px;"><strong>{initiator_name}</strong> wants to swap their <strong>{their_shift_label}</strong> shift for your <strong>{my_shift_label}</strong> shift at {venue_name}. Open your hub to accept or decline.</p>
{_button("Open your hub", venue_link_url)}
"""
    html = _shell(f"{initiator_name} wants to swap shifts with you", f"Sent because you're part of the {venue_name} team on Crewplan.", body)
    return _send(to_email, subject, html)


# 7. Bulk reminder (to manager) ----------------------------------------------

def send_bulk_reminder_email(
    to_email: str,
    manager_name: str,
    pending_count: int,
    dashboard_link_url: str,
) -> dict:
    subject = f"{pending_count} staff haven't submitted availability"
    body = f"""
<p style="margin:0 0 8px;">Hi {manager_name},</p>
<p style="margin:0 0 16px;">Reminder: <strong>{pending_count}</strong> staff haven't submitted their availability yet.</p>
{_button("Go to dashboard", dashboard_link_url)}
"""
    html = _shell(f"{pending_count} staff haven't submitted availability", "Sent because you manage a venue on Crewplan.", body)
    return _send(to_email, subject, html)
