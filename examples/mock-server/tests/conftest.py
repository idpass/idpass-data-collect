"""Shared pytest fixtures.

Each test gets its own file-backed SQLite DB in a temp dir. Using a file (not
``:memory:``) keeps SQLAlchemy's async engine happy across multiple sessions.
Environment variables are used to configure per-test settings so the
``@lru_cache`` on :func:`mock_server.config.get_settings` doesn't need to be
monkey-patched.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
from litestar.testing import AsyncTestClient

from mock_server import config as config_module
from mock_server import db as db_module
from mock_server.app import create_app


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def _env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Reset config + env vars for every test.

    Doing this as ``autouse`` guarantees tests never leak settings into each
    other even if a fixture forgets to request ``settings``.
    """
    db_file = tmp_path / "test_registry.db"
    monkeypatch.setenv("MOCK_DB_PATH", str(db_file))
    monkeypatch.setenv("MOCK_OAUTH_CLIENT_ID", "test-client")
    monkeypatch.setenv("MOCK_OAUTH_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("MOCK_JWT_SECRET", "unit-test-secret-key-do-not-use-in-prod")
    monkeypatch.setenv("MOCK_SESSION_SECRET", "unit-test-session-secret")
    monkeypatch.setenv("MOCK_UI_USERNAME", "admin")
    monkeypatch.setenv("MOCK_UI_PASSWORD", "admin")
    monkeypatch.setenv("MOCK_IDENTIFIER_SCHEME", "urn:mock:vocab:id-type")
    monkeypatch.setenv("MOCK_LOG_LEVEL", "WARNING")

    config_module.get_settings.cache_clear()
    db_module.reset_engine()
    yield
    config_module.get_settings.cache_clear()
    db_module.reset_engine()


@pytest.fixture
def settings():
    """Current Settings instance."""
    return config_module.get_settings()


@pytest_asyncio.fixture
async def app(settings):
    """Build a Litestar app bound to the per-test DB.

    We use :class:`litestar.testing.AsyncTestClient` in the ``client`` fixture
    because httpx's ``ASGITransport`` does not execute the app's ``on_startup``
    hooks — advanced-alchemy registers its session maker there. The test
    client runs lifespan properly.
    """
    # Fresh schema per test.
    try:
        await db_module.drop_all()
    except Exception:
        pass
    await db_module.create_all()

    from mock_server.seed import seed_default_api_client

    await seed_default_api_client()
    _app = create_app(settings)
    yield _app


@pytest_asyncio.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    """Return an AsyncTestClient that runs Litestar's lifespan hooks."""
    async with AsyncTestClient(app=app) as c:
        yield c


@pytest_asyncio.fixture
async def token(client: AsyncClient) -> str:
    """Issue a JWT for the configured test client."""
    resp = await client.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "test-client",
            "client_secret": "test-secret",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def auth_headers(token: str) -> dict[str, str]:
    """Authorization header for convenience."""
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seeded(app) -> None:
    """Populate the DB with the standard fixture set."""
    from mock_server.seed import seed

    await seed(reset=False)
    # Remove reference to silence unused-param warnings.
    _ = os.environ.get("MOCK_DB_PATH")
