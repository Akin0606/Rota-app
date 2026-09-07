from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import get_supabase
from routers import (
    activity,
    admin,
    availability,
    billing,
    cron,
    leave,
    onboarding,
    periods,
    roles,
    rota,
    rules,
    scheduler,
    shifts,
    staff,
    suggestions,
    venue,
    waitlist,
)
from scripts.migrate import pending_filenames
from services import cron_scheduler

settings = get_settings()

app = FastAPI(title="Rota App API")

# ALLOWED_ORIGINS (comma-separated) is the authority when set; the literals are
# the fallback for local dev and for a deployment that hasn't set it yet.
# FRONTEND_URL is always folded in, since that's the origin our emails point at.
#
# This used to be the three literals alone, which silently broke production: a
# brand domain served alongside a Vercel alias needs *two* origins, and
# FRONTEND_URL can only hold one, so `rotally.co.uk` was rejected outright.
_default_origins = [
    "http://localhost:3000",
    "https://rota-app-mu.vercel.app",
    "https://rotally.co.uk",
    "https://www.rotally.co.uk",
]
_configured = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
allowed_origins = list(
    dict.fromkeys((_configured or _default_origins) + [settings.frontend_url])
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(availability.router)
app.include_router(billing.router)
app.include_router(venue.router)
app.include_router(shifts.router)
app.include_router(staff.router)
app.include_router(periods.router)
app.include_router(activity.router)
app.include_router(rules.router)
app.include_router(scheduler.router)
app.include_router(rota.router)
app.include_router(roles.router)
app.include_router(leave.router)
app.include_router(admin.router)
app.include_router(cron.router)
app.include_router(waitlist.router)
app.include_router(suggestions.router)
app.include_router(onboarding.router)


@app.on_event("startup")
def _start_scheduler():
    cron_scheduler.start_scheduler()


@app.on_event("shutdown")
def _stop_scheduler():
    cron_scheduler.stop_scheduler()


# Cached for the process lifetime: the answer only changes at deploy time, and
# a deploy restarts the process. Only a *successful* read is cached, so a
# transient blip on the first health check doesn't freeze an error in place.
_migration_report: dict | None = None


def _migrations_report() -> dict:
    """Which migration files on disk have no `schema_migrations` row.

    Migrations moved to a pre-deploy step, and the entrypoint fallback no
    longer blocks the boot (see backend/entrypoint.sh). That trades a
    crash-loop for a quieter failure — an API serving happily against a schema
    that never got migrated — so the state has to be visible somewhere other
    than a deploy log that scrolls away.

    Never raises. A /health that can fail is a health check that pulls the
    instance out of rotation, which is the exact blast radius this change
    exists to shrink.
    """
    global _migration_report
    if _migration_report is not None:
        return _migration_report
    try:
        rows = get_supabase().table("schema_migrations").select("filename").execute()
        applied = {row["filename"] for row in (rows.data or [])}
        report: dict = {"applied": len(applied), "pending": pending_filenames(applied)}
    except Exception as exc:
        return {"error": str(exc)}
    _migration_report = report
    return report


@app.get("/health")
def health():
    try:
        get_supabase().table("venues").select("id").limit(1).execute()
        db_status = "ok"
    except Exception as exc:
        db_status = f"error: {exc}"

    return {"status": "ok", "db": db_status, "migrations": _migrations_report()}
