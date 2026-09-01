from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    supabase_url: str = Field(alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_anon_key: str = Field(alias="NEXT_PUBLIC_SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")
    database_url: str = Field(alias="DATABASE_URL")
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    resend_from_email: str = Field(default="Rota <onboarding@resend.dev>", alias="RESEND_FROM_EMAIL")
    # Anything other than "production" makes email fail CLOSED: see
    # services/email_service._send. A non-production backend pointed at a real
    # mailer is one prod-data restore away from emailing real staff — the cron
    # scheduler iterates every venue in whatever DB it boots against.
    environment: str = Field(default="production", alias="ENVIRONMENT")
    # Comma-separated recipients a non-production environment may email. Entries
    # are either a full address or a "@domain.com" suffix. Empty means nobody.
    email_allowlist: str = Field(default="", alias="EMAIL_ALLOWLIST")
    cron_secret: str = Field(default="", alias="CRON_SECRET")
    admin_secret: str = Field(default="", alias="ADMIN_SECRET")
    # In production this must be set to the deployed frontend origin
    # (https://rota-app-mu.vercel.app) so email links and CORS resolve
    # correctly. Defaults to localhost for local development.
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")
    # Every browser origin allowed to call this API, comma-separated. One env
    # var rather than a hardcoded list because a deployment can serve more than
    # one origin (brand domain + www + the Vercel alias) while FRONTEND_URL can
    # only ever name one. Blank falls back to the built-in defaults in main.py.
    allowed_origins: str = Field(default="", alias="ALLOWED_ORIGINS")
    stripe_secret_key: str = Field(default="", alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="", alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_id: str = Field(default="", alias="STRIPE_PRICE_ID")

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        populate_by_name=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
