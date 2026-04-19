"""Tests for /v1/groups CRUD + membership."""

from __future__ import annotations

from httpx import AsyncClient


async def test_create_group_auto_system_id(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """POST creates the group with an auto-assigned system_id identifier."""
    r = await client.post(
        "/v1/groups", json={"name": "Lovelace Household"}, headers=auth_headers
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Lovelace Household"
    assert body["group_type"] == "household"
    assert any(i["identifier_type"] == "system_id" for i in body["identifiers"])


async def test_group_crud_cycle(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Full POST → GET → PATCH → DELETE cycle."""
    created = (
        await client.post("/v1/groups", json={"name": "X"}, headers=auth_headers)
    ).json()
    uuid = created["uuid"]
    assert (await client.get(f"/v1/groups/{uuid}", headers=auth_headers)).status_code == 200
    r = await client.patch(
        f"/v1/groups/{uuid}", json={"name": "X2"}, headers=auth_headers
    )
    assert r.status_code == 200 and r.json()["name"] == "X2"
    assert (await client.delete(f"/v1/groups/{uuid}", headers=auth_headers)).status_code == 204


async def test_add_and_remove_member(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Membership add + remove round-trip."""
    group = (await client.post("/v1/groups", json={"name": "HH"}, headers=auth_headers)).json()
    person = (
        await client.post("/v1/persons", json={"given_name": "M"}, headers=auth_headers)
    ).json()

    r = await client.post(
        f"/v1/groups/{group['uuid']}/members",
        json={"person_uuid": person["uuid"], "role": "head"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    fetched = (await client.get(f"/v1/groups/{group['uuid']}", headers=auth_headers)).json()
    assert len(fetched["memberships"]) == 1
    assert fetched["memberships"][0]["person_uuid"] == person["uuid"]

    r2 = await client.delete(
        f"/v1/groups/{group['uuid']}/members/{person['uuid']}", headers=auth_headers
    )
    assert r2.status_code == 204
    fetched2 = (await client.get(f"/v1/groups/{group['uuid']}", headers=auth_headers)).json()
    assert fetched2["memberships"] == []


async def test_duplicate_member_409(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Adding the same person twice returns 409 CONFLICT."""
    group = (await client.post("/v1/groups", json={"name": "D"}, headers=auth_headers)).json()
    person = (
        await client.post("/v1/persons", json={"given_name": "D"}, headers=auth_headers)
    ).json()
    assert (
        await client.post(
            f"/v1/groups/{group['uuid']}/members",
            json={"person_uuid": person["uuid"]},
            headers=auth_headers,
        )
    ).status_code == 201
    dup = await client.post(
        f"/v1/groups/{group['uuid']}/members",
        json={"person_uuid": person["uuid"]},
        headers=auth_headers,
    )
    assert dup.status_code == 409


async def test_group_if_match_mismatch(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Groups also honour If-Match."""
    group = (await client.post("/v1/groups", json={"name": "G"}, headers=auth_headers)).json()
    bad = "1999-01-01T00:00:00+00:00"
    r = await client.patch(
        f"/v1/groups/{group['uuid']}",
        json={"name": "G2"},
        headers={**auth_headers, "If-Match": bad},
    )
    assert r.status_code == 412
