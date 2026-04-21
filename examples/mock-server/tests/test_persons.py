"""Tests for /v1/persons CRUD + system_id invariants."""

from __future__ import annotations

from httpx import AsyncClient


async def test_create_person_auto_system_id(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """POST creates the person and auto-assigns a system_id identifier."""
    resp = await client.post(
        "/v1/persons",
        json={"given_name": "Ada", "family_name": "Lovelace"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["given_name"] == "Ada"
    system_ids = [i for i in body["identifiers"] if i["identifier_type"] == "system_id"]
    assert len(system_ids) == 1
    assert system_ids[0]["identifier_value"]  # non-empty
    assert system_ids[0]["identifier_scheme_id"] == "urn:mock:vocab:id-type"


async def test_crud_cycle(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Full POST → GET → PATCH → DELETE cycle."""
    created = (
        await client.post(
            "/v1/persons",
            json={"given_name": "Alan", "family_name": "Turing"},
            headers=auth_headers,
        )
    ).json()
    uuid = created["uuid"]

    fetched = (await client.get(f"/v1/persons/{uuid}", headers=auth_headers)).json()
    assert fetched["uuid"] == uuid

    patched = (
        await client.patch(
            f"/v1/persons/{uuid}",
            json={"family_name": "Turing-OBE"},
            headers=auth_headers,
        )
    ).json()
    assert patched["family_name"] == "Turing-OBE"

    delete_resp = await client.delete(f"/v1/persons/{uuid}", headers=auth_headers)
    assert delete_resp.status_code == 204
    gone = await client.get(f"/v1/persons/{uuid}", headers=auth_headers)
    assert gone.status_code == 404


async def test_pagination_and_updated_since(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Pagination + updated_since filter behave correctly."""
    # Create 5 persons.
    for i in range(5):
        r = await client.post("/v1/persons", json={"given_name": f"P{i}"}, headers=auth_headers)
        assert r.status_code == 201

    page1 = (await client.get("/v1/persons?limit=2&offset=0", headers=auth_headers)).json()
    assert page1["limit"] == 2 and page1["offset"] == 0
    assert page1["total"] == 5
    assert len(page1["items"]) == 2
    assert page1["next_offset"] == 2

    page_last = (await client.get("/v1/persons?limit=2&offset=4", headers=auth_headers)).json()
    assert len(page_last["items"]) == 1
    assert page_last["next_offset"] is None

    # updated_since: after creating a new person, only it should appear.
    first_updated_at = page1["items"][0]["updated_at"]
    after = (await client.get(f"/v1/persons?updated_since={first_updated_at}", headers=auth_headers)).json()
    assert after["total"] <= 5


async def test_if_match_mismatch_412(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Stale If-Match → 412 PRECONDITION_FAILED."""
    created = (await client.post("/v1/persons", json={"given_name": "Stale"}, headers=auth_headers)).json()
    uuid = created["uuid"]
    bad_if_match = "1999-01-01T00:00:00+00:00"
    r = await client.patch(
        f"/v1/persons/{uuid}",
        json={"given_name": "Updated"},
        headers={**auth_headers, "If-Match": bad_if_match},
    )
    assert r.status_code == 412
    assert r.json()["error"]["code"] == "PRECONDITION_FAILED"


async def test_if_match_hit_passes(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Matching If-Match header allows the update."""
    created = (await client.post("/v1/persons", json={"given_name": "Fresh"}, headers=auth_headers)).json()
    r = await client.patch(
        f"/v1/persons/{created['uuid']}",
        json={"given_name": "Fresher"},
        headers={**auth_headers, "If-Match": created["updated_at"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["given_name"] == "Fresher"


async def test_add_non_system_identifier(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Non-system identifiers can be added freely."""
    created = (await client.post("/v1/persons", json={"given_name": "Grace"}, headers=auth_headers)).json()
    r = await client.post(
        f"/v1/persons/{created['uuid']}/identifiers",
        json={"identifier_type": "national_id_number", "identifier_value": "NID-XYZ"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    fetched = (await client.get(f"/v1/persons/{created['uuid']}", headers=auth_headers)).json()
    types = [i["identifier_type"] for i in fetched["identifiers"]]
    assert "national_id_number" in types and "system_id" in types


async def test_cannot_add_system_id(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """Adding a system_id identifier manually → 403 FORBIDDEN."""
    created = (await client.post("/v1/persons", json={"given_name": "X"}, headers=auth_headers)).json()
    r = await client.post(
        f"/v1/persons/{created['uuid']}/identifiers",
        json={"identifier_type": "system_id", "identifier_value": "hand-rolled"},
        headers=auth_headers,
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


async def test_add_identity_document(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """POST /identity-documents attaches the doc and backing identifier."""
    person = (await client.post("/v1/persons", json={"given_name": "Doc"}, headers=auth_headers)).json()
    r = await client.post(
        f"/v1/persons/{person['uuid']}/identity-documents",
        json={
            "document_type": "passport",
            "issuing_authority": "Govt of X",
            "issue_date": "2020-01-01",
            "expiry_date": "2030-01-01",
            "identifier_type": "passport_number",
            "identifier_value": "PP-ABC-123",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    fetched = (await client.get(f"/v1/persons/{person['uuid']}", headers=auth_headers)).json()
    assert len(fetched["identity_documents"]) == 1
    assert fetched["identity_documents"][0]["identifier"]["identifier_value"] == "PP-ABC-123"


async def test_person_attributes_roundtrip(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """PublicSchema fields beyond the typed core survive create/get/patch."""
    payload = {
        "given_name": "Ada",
        "family_name": "Lovelace",
        "attributes": {
            "preferred_language": "en",
            "nationality": "GB",
            "notes": "first programmer",
        },
    }
    create_resp = await client.post("/v1/persons", json=payload, headers=auth_headers)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["attributes"] == payload["attributes"]

    get_resp = await client.get(f"/v1/persons/{created['uuid']}", headers=auth_headers)
    assert get_resp.status_code == 200
    fetched = get_resp.json()
    assert fetched["attributes"] == payload["attributes"]

    patch_resp = await client.patch(
        f"/v1/persons/{created['uuid']}",
        json={
            "attributes": {
                "preferred_language": "fr",
                "nationality": "GB",
                "notes": "first programmer",
            }
        },
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["attributes"]["preferred_language"] == "fr"
