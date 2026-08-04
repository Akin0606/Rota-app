from functools import lru_cache

from supabase import Client, create_client

from config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Admin client using the service role key. Bypasses RLS — the
    backend is trusted to enforce access rules itself (e.g. scoping
    manager requests to their own venue, staff requests by token)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@lru_cache
def get_supabase_anon() -> Client:
    """Anon-key client for user-facing auth flows (e.g. magic link)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key)
