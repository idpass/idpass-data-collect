"""Tests for OAuth2 API client management (REST + UI + bootstrap)."""

from __future__ import annotations

import time

from httpx import AsyncClient

from mock_server import db as db_module

# ---------------------------------------------------------------------------
# REST: creation, rotation, revocation, deletion
# ---------------------------------------------------------------------------


async def _create_client(
    client: AsyncClient,
    auth_headers: dict[str, str],
    *,
    name: str | None = "Adapter A",
    client_id: str | None = None,
    scopes: list[str] | None = None,
) -> dict:
    payload: dict = {}
    if name is not None:
        payload["name"] = name
    if client_id is not None:
        payload["client_id"] = client_id
    if scopes is not None:
        payload["scopes"] = scopes
    resp = await client.post("/v1/api-clients", json=payload, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_returns_plaintext_secret_once(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """POST returns plaintext secret, GET never does."""
    body = await _create_client(client, auth_headers, name="Adapter A")
    assert body["client_secret"]  # plaintext, one-time
    assert isinstance(body["client_secret"], str)
    assert len(body["client_secret"]) >= 20
    assert body["client_id"].startswith("mc_")  # auto-generated
    assert body["is_active"] is True

    # GET does NOT include the secret.
    uuid = body["uuid"]
    resp = await client.get(f"/v1/api-clients/{uuid}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    got = resp.json()
    assert "client_secret" not in got
    assert "client_secret_hash" not in got
    assert got["uuid"] == uuid
    assert got["client_id"] == body["client_id"]


async def test_new_client_can_obtain_token(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """The secret returned from POST actually works against /oauth/token."""
    body = await _create_client(client, auth_headers, name="Adapter B")
    resp = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": body["client_id"],
            "client_secret": body["client_secret"],
        },
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    assert isinstance(token, str)


async def test_rotate_invalidates_old_secret(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """After rotate, the old secret fails and the new one works."""
    created = await _create_client(client, auth_headers)
    old_secret = created["client_secret"]
    cid = created["client_id"]
    uuid = created["uuid"]

    # Rotate.
    resp = await client.post(f"/v1/api-clients/{uuid}/rotate", headers=auth_headers)
    assert resp.status_code == 201, resp.text
    rotated = resp.json()
    assert rotated["client_secret"] != old_secret

    # Old secret → 401
    r_old = await client.post(
        "/oauth/token",
        data={"grant_type": "client_credentials", "client_id": cid, "client_secret": old_secret},
    )
    assert r_old.status_code == 401

    # New secret → 200
    r_new = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": cid,
            "client_secret": rotated["client_secret"],
        },
    )
    assert r_new.status_code == 200, r_new.text


async def test_revoke_blocks_new_token_issuance(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Revoked clients cannot obtain new tokens."""
    created = await _create_client(client, auth_headers)
    uuid = created["uuid"]

    resp = await client.post(f"/v1/api-clients/{uuid}/revoke", headers=auth_headers)
    assert resp.status_code == 201, resp.text  # POST default
    body = resp.json()
    assert body["is_active"] is False
    assert body["revoked_at"] is not None

    r = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": created["client_id"],
            "client_secret": created["client_secret"],
        },
    )
    assert r.status_code == 401


async def test_hard_delete_removes_client(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """DELETE /v1/api-clients/{uuid} is a hard-delete."""
    created = await _create_client(client, auth_headers)
    uuid = created["uuid"]

    resp = await client.delete(f"/v1/api-clients/{uuid}", headers=auth_headers)
    assert resp.status_code == 204

    got = await client.get(f"/v1/api-clients/{uuid}", headers=auth_headers)
    assert got.status_code == 404


async def test_list_pagination_and_filter(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """List returns the default-seeded client plus newly created ones; active_only filters."""
    await _create_client(client, auth_headers, name="Keep me")
    second = await _create_client(client, auth_headers, name="To revoke")
    await client.post(f"/v1/api-clients/{second['uuid']}/revoke", headers=auth_headers)

    all_resp = await client.get("/v1/api-clients?active_only=false", headers=auth_headers)
    assert all_resp.status_code == 200
    total_all = all_resp.json()["total"]

    active_resp = await client.get("/v1/api-clients?active_only=true", headers=auth_headers)
    assert active_resp.status_code == 200
    total_active = active_resp.json()["total"]

    assert total_all == total_active + 1


# ---------------------------------------------------------------------------
# Bootstrap / idempotency
# ---------------------------------------------------------------------------


async def test_seed_bootstraps_env_client(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """The env-default client (test-client/test-secret) is seeded automatically."""
    # The conftest `app` fixture calls seed_default_api_client() after create_all,
    # so we should be able to authenticate with test-client/test-secret immediately.
    resp = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "test-client",
            "client_secret": "test-secret",
        },
    )
    assert resp.status_code == 200, resp.text

    # And it shows up in the list with the documented name.
    listing = await client.get("/v1/api-clients", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()["items"]
    defaults = [c for c in items if c["client_id"] == "test-client"]
    assert len(defaults) == 1
    assert "Default client" in (defaults[0]["name"] or "")


async def test_seed_is_idempotent() -> None:
    """Running seed_default_api_client twice does not create duplicates."""
    from mock_server.seed import seed_default_api_client
    from mock_server.services import ApiClientService

    # Start from a fresh per-test DB.
    try:
        await db_module.drop_all()
    except Exception:
        pass
    await db_module.create_all()

    await seed_default_api_client()
    await seed_default_api_client()

    sm = db_module.get_sessionmaker()
    async with sm() as session:
        svc = ApiClientService(session)
        rows, total = await svc.list(active_only=False, limit=50)
    assert total == 1
    assert rows[0].client_id == "test-client"


# ---------------------------------------------------------------------------
# Constant-time behaviour (loose check)
# ---------------------------------------------------------------------------


async def test_missing_and_wrong_secret_both_return_401(client: AsyncClient) -> None:
    """Timing-oracle protection: both failure paths return 401, not 404."""
    r_missing = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "nope-not-here",
            "client_secret": "irrelevant",
        },
    )
    r_wrong = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "test-client",
            "client_secret": "definitely-not-the-right-secret",
        },
    )
    assert r_missing.status_code == 401
    assert r_wrong.status_code == 401
    # Both go through the same code path — we don't measure wall-clock, we
    # just assert neither leaks existence via a different status code.


async def test_failure_paths_take_comparable_time(client: AsyncClient) -> None:
    """Loose timing check: missing-client and wrong-secret paths are both slow.

    Bcrypt is intentionally slow; the "missing client" path runs a dummy
    verify so it does not short-circuit. We just assert both take non-zero
    time (>1ms), which would not be the case without the dummy compare.
    We do not assert a ratio — CI timing is too noisy for that.
    """
    t0 = time.perf_counter()
    await client.post(
        "/oauth/token",
        data={"grant_type": "client_credentials", "client_id": "ghost", "client_secret": "x"},
    )
    t_missing = time.perf_counter() - t0

    t0 = time.perf_counter()
    await client.post(
        "/oauth/token",
        data={"grant_type": "client_credentials", "client_id": "test-client", "client_secret": "x"},
    )
    t_wrong = time.perf_counter() - t0

    # Both should spend ≥1ms on bcrypt. Loose bound to avoid flaky CI.
    assert t_missing > 0.001
    assert t_wrong > 0.001


# ---------------------------------------------------------------------------
# UI happy path
# ---------------------------------------------------------------------------


async def _login(client: AsyncClient) -> None:
    resp = await client.post(
        "/ui/login",
        data={"username": "admin", "password": "admin"},
    )
    assert resp.status_code in (200, 303)


async def test_ui_crud_happy_path(client: AsyncClient) -> None:
    """Session-authenticated UI create → detail → rotate → revoke flow."""
    await _login(client)

    # List page.
    r = await client.get("/ui/clients")
    assert r.status_code == 200
    assert b"API clients" in r.content

    # New-form page.
    r = await client.get("/ui/clients/new")
    assert r.status_code == 200
    assert b"Create client" in r.content

    # Submit new.
    r = await client.post(
        "/ui/clients/new",
        data={"name": "UI-created", "client_id": "", "scopes": "read, write", "description": "via UI"},
        follow_redirects=False,
    )
    assert r.status_code == 303
    target = r.headers["location"]
    assert target.startswith("/ui/clients/")
    assert "new=1" in target

    # Follow redirect: secret banner shown.
    r = await client.get(target)
    assert r.status_code == 200
    assert b"Copy the secret now" in r.content or b"Client created" in r.content
    # Extract the UUID from the path.
    # /ui/clients/<uuid>?new=1
    uuid = target.split("/ui/clients/")[1].split("?")[0]

    # Re-visit without ?new: banner gone (session cleared).
    r = await client.get(f"/ui/clients/{uuid}")
    assert r.status_code == 200
    assert b"Copy the secret now" not in r.content

    # Rotate via UI.
    r = await client.post(f"/ui/clients/{uuid}/rotate", follow_redirects=False)
    assert r.status_code == 303
    assert "rotated=1" in r.headers["location"]

    # Revoke via UI.
    r = await client.post(f"/ui/clients/{uuid}/revoke", follow_redirects=False)
    assert r.status_code == 303

    # Detail page now shows revoked state.
    r = await client.get(f"/ui/clients/{uuid}")
    assert r.status_code == 200
    assert b"Revoked" in r.content
