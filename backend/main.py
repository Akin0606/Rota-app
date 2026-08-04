from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import get_supabase
from routers import activity, admin, availability, cron, periods, rota, rules, shifts, staff, venue
from services import cron_scheduler

settings = get_settings()

app = FastAPI(title="Rota App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(availability.router)
app.include_router(venue.router)
app.include_router(shifts.router)
app.include_router(staff.router)
app.include_router(periods.router)
app.include_router(activity.router)
app.include_router(rules.router)
app.include_router(rota.router)
app.include_router(admin.router)
app.include_router(cron.router)


@app.on_event("startup")
def _start_scheduler():
    cron_scheduler.start_scheduler()


@app.on_event("shutdown")
def _stop_scheduler():
    cron_scheduler.stop_scheduler()


@app.get("/health")
def health():
    try:
        get_supabase().table("venues").select("id").limit(1).execute()
        db_status = "ok"
    except Exception as exc:
        db_status = f"error: {exc}"

    return {"status": "ok", "db": db_status}
