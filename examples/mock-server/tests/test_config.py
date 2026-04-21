"""Config parsing regression tests.

Env-based deployments (Coolify, docker-compose, k8s) pass CORS origins as
plain strings — ``*``, a single URL, or a comma-separated list. pydantic-
settings' default behaviour is to JSON-decode ``list[str]`` env values, which
crashes on any of those shapes. :class:`Settings` opts out via ``NoDecode``
and parses the string itself.
"""

from __future__ import annotations

import pytest

from mock_server.config import Settings


def _settings(**env: str) -> Settings:
    # Bypass env/.env file lookup by passing init kwargs directly. These go
    # through the same validators as env-sourced values.
    return Settings(**env)  # type: ignore[arg-type]


def test_cors_star_wildcard() -> None:
    s = _settings(cors_allowed_origins="*")
    assert s.cors_allowed_origins == ["*"]


def test_cors_single_origin() -> None:
    s = _settings(cors_allowed_origins="https://app.example.com")
    assert s.cors_allowed_origins == ["https://app.example.com"]


def test_cors_comma_separated() -> None:
    s = _settings(cors_allowed_origins="https://a.example,https://b.example, https://c.example")
    assert s.cors_allowed_origins == [
        "https://a.example",
        "https://b.example",
        "https://c.example",
    ]


def test_cors_json_array() -> None:
    s = _settings(cors_allowed_origins='["https://a.example","https://b.example"]')
    assert s.cors_allowed_origins == ["https://a.example", "https://b.example"]


def test_cors_empty_string_yields_empty_list() -> None:
    s = _settings(cors_allowed_origins="")
    assert s.cors_allowed_origins == []


def test_cors_passthrough_list() -> None:
    s = _settings(cors_allowed_origins=["https://a.example"])  # type: ignore[arg-type]
    assert s.cors_allowed_origins == ["https://a.example"]


def test_cors_default_has_localhost() -> None:
    s = Settings()
    assert any("localhost" in o for o in s.cors_allowed_origins)


def test_cors_invalid_json_array_raises() -> None:
    with pytest.raises(Exception):  # noqa: B017 - json or pydantic validation
        _settings(cors_allowed_origins="[not-json]")
