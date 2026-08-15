"""Venue-configurable roles + the staff_roles eligibility M2M.

Roles used to be a hardcoded frontend constant. These endpoints make them
real, venue-scoped entities a manager can add/rename/re-icon/delete, and let
each role carry a "who can work this role" membership list.

Non-breaking by design: staff_members.role remains the primary/display role
(matrix grouping, exports, claim gating still read it). staff_roles is
additive eligibility on top — see migration 022.
"""

from fastapi import APIRouter, Depends, HTTPException

from database import get_supabase
from models.schemas import RoleCreateRequest, RoleOut, RoleUpdateRequest
from services.auth_service import get_current_manager, get_manager_venue

router = APIRouter(prefix="/api/roles", tags=["roles"])


def _get_role_or_404(venue_id: str, role_id: str) -> dict:
    supabase = get_supabase()
    res = (
        supabase.table("roles")
        .select("*")
        .eq("id", role_id)
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Role not found")
    return res.data[0]


def _membership_for_roles(role_ids: list[str]) -> dict[str, list[str]]:
    """role_id -> [staff_id, ...] for the given roles, in one query."""
    if not role_ids:
        return {}
    supabase = get_supabase()
    rows = (
        supabase.table("staff_roles")
        .select("role_id, staff_id")
        .in_("role_id", role_ids)
        .execute()
        .data
    )
    out: dict[str, list[str]] = {}
    for row in rows:
        out.setdefault(row["role_id"], []).append(row["staff_id"])
    return out


def _venue_staff_ids(venue_id: str) -> set[str]:
    supabase = get_supabase()
    rows = (
        supabase.table("staff_members").select("id").eq("venue_id", venue_id).execute().data
    )
    return {r["id"] for r in rows}


def _set_membership(venue_id: str, role_id: str, staff_ids: list[str]) -> list[str]:
    """Replace this role's membership with staff_ids, ignoring any id that
    isn't a staff member of this venue (so a stale/foreign id can't leak in).
    Returns the ids actually stored."""
    supabase = get_supabase()
    valid = list(_venue_staff_ids(venue_id).intersection(staff_ids))
    supabase.table("staff_roles").delete().eq("role_id", role_id).execute()
    if valid:
        supabase.table("staff_roles").insert(
            [{"role_id": role_id, "staff_id": sid} for sid in valid]
        ).execute()
    return valid


@router.get("", response_model=list[RoleOut])
def list_roles(manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    roles = (
        supabase.table("roles")
        .select("*")
        .eq("venue_id", venue["id"])
        .order("sort_order")
        .order("name")
        .execute()
        .data
    )
    membership = _membership_for_roles([r["id"] for r in roles])
    for r in roles:
        r["staff_ids"] = membership.get(r["id"], [])
    return roles


@router.post("", response_model=RoleOut)
def create_role(payload: RoleCreateRequest, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()

    name = payload.name.strip()
    clash = (
        supabase.table("roles")
        .select("id")
        .eq("venue_id", venue["id"])
        .ilike("name", name)
        .limit(1)
        .execute()
    )
    if clash.data:
        raise HTTPException(status_code=409, detail=f"A role called “{name}” already exists")

    # New roles sort after the existing ones.
    existing = (
        supabase.table("roles")
        .select("sort_order")
        .eq("venue_id", venue["id"])
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
        .data
    )
    next_order = (existing[0]["sort_order"] + 1) if existing else 0

    role = (
        supabase.table("roles")
        .insert(
            {
                "venue_id": venue["id"],
                "name": name,
                "icon": payload.icon or "users",
                "sort_order": next_order,
            }
        )
        .execute()
        .data[0]
    )

    role["staff_ids"] = _set_membership(venue["id"], role["id"], payload.staff_ids)
    return role


@router.put("/{role_id}", response_model=RoleOut)
def update_role(
    role_id: str,
    payload: RoleUpdateRequest,
    manager: dict = Depends(get_current_manager),
):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    role = _get_role_or_404(venue["id"], role_id)

    updates: dict = {}
    if payload.name is not None:
        name = payload.name.strip()
        clash = (
            supabase.table("roles")
            .select("id")
            .eq("venue_id", venue["id"])
            .ilike("name", name)
            .neq("id", role_id)
            .limit(1)
            .execute()
        )
        if clash.data:
            raise HTTPException(status_code=409, detail=f"A role called “{name}” already exists")
        # Keep staff_members.role (the primary-role string) in step with a rename
        # so grouping/exports don't fall back to an orphaned old name.
        if name != role["name"]:
            supabase.table("staff_members").update({"role": name}).eq(
                "venue_id", venue["id"]
            ).eq("role", role["name"]).execute()
        updates["name"] = name
    if payload.icon is not None:
        updates["icon"] = payload.icon
    if updates:
        supabase.table("roles").update(updates).eq("id", role_id).execute()

    if payload.staff_ids is not None:
        stored = _set_membership(venue["id"], role_id, payload.staff_ids)
    else:
        stored = _membership_for_roles([role_id]).get(role_id, [])

    role = {**role, **updates, "staff_ids": stored}
    return role


@router.delete("/{role_id}", status_code=204)
def delete_role(role_id: str, manager: dict = Depends(get_current_manager)):
    venue = get_manager_venue(manager["id"])
    supabase = get_supabase()
    role = _get_role_or_404(venue["id"], role_id)

    # Guard: don't strand staff whose primary role is this one. The manager has
    # to reassign them first — deleting would leave them with a role that no
    # longer exists (matrix grouping, exports and claim gating all read it).
    primary = (
        supabase.table("staff_members")
        .select("id, name")
        .eq("venue_id", venue["id"])
        .eq("role", role["name"])
        .execute()
        .data
    )
    if primary:
        n = len(primary)
        who = primary[0]["name"] if n == 1 else f"{n} staff members"
        raise HTTPException(
            status_code=409,
            detail=f"{who} still {'has' if n == 1 else 'have'} “{role['name']}” "
            "as their role — reassign them before deleting it.",
        )

    # staff_roles rows for this role cascade-delete via the FK.
    supabase.table("roles").delete().eq("id", role_id).execute()
    return None
