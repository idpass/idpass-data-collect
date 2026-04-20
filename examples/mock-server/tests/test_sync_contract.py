"""End-to-end simulation of a DataCollect V2 external sync adapter.

Walks through the adapter contract exactly as a real adapter would:

1. POST /oauth/token — get JWT
2. GET /v1/persons with pagination — initial full pull
3. GET /v1/persons?updated_since=<watermark> — delta pull returns nothing
4. Create a new person via the mock server (simulating OOB data entry)
5. Delta pull — watermark advances, sees the new record
6. PATCH with an If-Match that matches — succeeds
7. PATCH with a stale If-Match — 412 conflict
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from httpx import AsyncClient


async def _paginate(client: AsyncClient, headers: dict[str, str], base: str) -> list[dict]:
    """Walk through all pages and return the aggregated items list."""
    items: list[dict] = []
    offset = 0
    limit = 2
    sep = "&" if "?" in base else "?"
    while True:
        resp = await client.get(f"{base}{sep}limit={limit}&offset={offset}", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        items.extend(body["items"])
        if body["next_offset"] is None:
            break
        offset = body["next_offset"]
    return items


async def test_full_sync_contract(
    client: AsyncClient, auth_headers: dict[str, str], seeded: None
) -> None:
    """Full two-pass sync contract check against the seeded fixture."""
    # 1. Initial pull — pagination walks the full set.
    persons = await _paginate(client, auth_headers, "/v1/persons")
    groups = await _paginate(client, auth_headers, "/v1/groups")
    assert len(persons) == 5
    assert len(groups) == 2

    # All persons have a system_id identifier (auto-assigned).
    for p in persons:
        types = [i["identifier_type"] for i in p["identifiers"]]
        assert "system_id" in types

    # 2. Compute watermark from the last updated record.
    watermark = max(p["updated_at"] for p in persons)
    delta = await _paginate(client, auth_headers, f"/v1/persons?updated_since={quote(watermark)}")
    assert delta == []

    # 3. Simulate out-of-band data entry: create a new person.
    new_person = (
        await client.post(
            "/v1/persons",
            json={"given_name": "New", "family_name": "Arrival"},
            headers=auth_headers,
        )
    ).json()

    # 4. Delta pull picks up the new record only.
    delta2 = await _paginate(client, auth_headers, f"/v1/persons?updated_since={quote(watermark)}")
    assert len(delta2) == 1
    assert delta2[0]["uuid"] == new_person["uuid"]

    # 5. PATCH with matching If-Match succeeds.
    ok = await client.patch(
        f"/v1/persons/{new_person['uuid']}",
        json={"family_name": "Arrival-Jr"},
        headers={**auth_headers, "If-Match": new_person["updated_at"]},
    )
    assert ok.status_code == 200, ok.text

    # 6. PATCH with the original (now stale) If-Match → 412.
    stale = await client.patch(
        f"/v1/persons/{new_person['uuid']}",
        json={"family_name": "Stale"},
        headers={**auth_headers, "If-Match": new_person["updated_at"]},
    )
    assert stale.status_code == 412


async def test_health_no_auth(client: AsyncClient) -> None:
    """Health endpoint is public."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_second_sync_is_stable(
    client: AsyncClient, auth_headers: dict[str, str], seeded: None
) -> None:
    """Running the sync twice with the same watermark is idempotent."""
    all_persons = await _paginate(client, auth_headers, "/v1/persons")
    assert all_persons

    # Use a watermark far in the past — should return everything.
    far_past = (datetime.now(UTC) - timedelta(days=365)).isoformat()
    twice_a = await _paginate(client, auth_headers, f"/v1/persons?updated_since={quote(far_past)}")
    twice_b = await _paginate(client, auth_headers, f"/v1/persons?updated_since={quote(far_past)}")
    # Same set, identical ordering by (updated_at, uuid).
    assert [p["uuid"] for p in twice_a] == [p["uuid"] for p in twice_b]
    assert len(twice_a) == len(all_persons)
