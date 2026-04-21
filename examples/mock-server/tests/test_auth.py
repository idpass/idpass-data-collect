"""Tests for the OAuth2 client-credentials flow and guard."""

from __future__ import annotations

from httpx import AsyncClient


async def test_token_happy_path(client: AsyncClient) -> None:
    """Valid credentials return a Bearer JWT with a reasonable TTL."""
    resp = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "test-client",
            "client_secret": "test-secret",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] > 0
    assert isinstance(body["access_token"], str) and len(body["access_token"]) > 10


async def test_token_rejects_bad_secret(client: AsyncClient) -> None:
    """Wrong client_secret → 401 with structured error body."""
    resp = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "test-client",
            "client_secret": "wrong",
        },
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


async def test_token_rejects_unknown_client(client: AsyncClient) -> None:
    """Unknown client_id → 401."""
    resp = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "ghost",
            "client_secret": "test-secret",
        },
    )
    assert resp.status_code == 401


async def test_token_rejects_wrong_grant_type(client: AsyncClient) -> None:
    """Non-``client_credentials`` grant → 422 VALIDATION_ERROR."""
    resp = await client.post(
        "/oauth/token",
        data={"grant_type": "password", "client_id": "test-client", "client_secret": "test-secret"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_v1_requires_bearer(client: AsyncClient) -> None:
    """Unauthenticated /v1 request → 401."""
    resp = await client.get("/v1/persons")
    assert resp.status_code == 401


async def test_v1_accepts_valid_bearer(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Valid Bearer token allows /v1 access."""
    resp = await client.get("/v1/persons", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"items", "total", "limit", "offset", "next_offset"}


async def test_basic_auth_variant(client: AsyncClient) -> None:
    """Credentials via HTTP Basic (RFC 6749 §2.3.1) also work."""
    import base64

    creds = base64.b64encode(b"test-client:test-secret").decode()
    resp = await client.post(
        "/oauth/token",
        data={"grant_type": "client_credentials"},
        headers={"Authorization": f"Basic {creds}"},
    )
    assert resp.status_code == 200
