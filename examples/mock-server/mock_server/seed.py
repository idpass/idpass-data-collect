"""Seed fixture data used for manual QA and adapter integration testing.

Creates:
* 2 households ("Lovelace Household", "Turing Household")
* 5 individuals — 3 with real identifiers, 2 with only auto-assigned ``system_id``
* 1 IdentityDocument (passport) attached to Alan Turing
* GroupMembership rows linking each person to their household
"""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import select

from mock_server.config import get_settings
from mock_server.db import create_all, drop_all, get_sessionmaker
from mock_server.models import Person
from mock_server.models.api_client import ApiClient
from mock_server.schemas.group import CreateGroup
from mock_server.schemas.identity_document import CreateIdentityDocument
from mock_server.schemas.person import CreatePerson
from mock_server.services import GroupService, PersonService

logger = logging.getLogger(__name__)


async def is_seeded() -> bool:
    """Return True if any Person exists."""
    sm = get_sessionmaker()
    async with sm() as session:
        result = await session.execute(select(Person).limit(1))
        return result.first() is not None


async def seed_default_api_client() -> None:
    """Ensure an ``api_client`` row exists for the env-default credentials.

    Idempotent: if a client with ``client_id == settings.oauth_client_id``
    already exists, no-op. This preserves rotated secrets across restarts —
    we never overwrite an existing row with the env-configured secret.
    """
    settings = get_settings()
    sm = get_sessionmaker()
    async with sm() as session:
        existing = await session.execute(
            select(ApiClient).where(ApiClient.client_id == settings.oauth_client_id)
        )
        if existing.scalar_one_or_none() is not None:
            return

        # Create via the service so the secret is hashed, then overwrite the
        # hash with one derived from the configured plaintext. Doing it in
        # two steps keeps all hashing in one place (ApiClientService.create).
        from passlib.hash import bcrypt  # local import: keep module light if seed unused

        client = ApiClient(
            client_id=settings.oauth_client_id,
            client_secret_hash=bcrypt.hash(settings.oauth_client_secret),
            name="Default client (from MOCK_OAUTH_* env)",
            description=(
                "Seeded on first startup from MOCK_OAUTH_CLIENT_ID / "
                "MOCK_OAUTH_CLIENT_SECRET. Rotate or delete via the UI — the env "
                "vars are no longer consulted for authentication."
            ),
            scopes=[],
        )
        session.add(client)
        await session.commit()
        logger.info(
            "seeded default api_client from env: client_id=%s", settings.oauth_client_id
        )


async def seed(*, reset: bool = False) -> None:
    """Create fixture data. If ``reset``, drops and recreates tables first."""
    if reset:
        logger.info("seed --reset: dropping all tables")
        await drop_all()
    await create_all()

    # Always ensure the default OAuth2 client exists so `seed` alone is
    # sufficient to bring up a working auth story. Idempotent.
    await seed_default_api_client()

    if not reset and await is_seeded():
        logger.info("database already contains data — skipping seed (use --reset to force)")
        return

    settings = get_settings()
    sm = get_sessionmaker()
    async with sm() as session:
        ps = PersonService(session, settings)
        gs = GroupService(session, settings)

        # Groups -------------------------------------------------------------
        lovelace_hh = await gs.create(CreateGroup(name="Lovelace Household", group_type="household"))
        turing_hh = await gs.create(CreateGroup(name="Turing Household", group_type="household"))

        # Persons with real identifiers --------------------------------------
        ada = await ps.create(
            CreatePerson(
                given_name="Ada",
                family_name="Lovelace",
                date_of_birth=date(1815, 12, 10),
                gender="2",
            )
        )
        await ps.identifiers.add_person_identifier(
            ada.uuid,
            identifier_type="national_id_number",
            identifier_value="NID-LOVELACE-001",
            identifier_scheme_name="Mock National ID",
        )

        alan = await ps.create(
            CreatePerson(
                given_name="Alan",
                family_name="Turing",
                date_of_birth=date(1912, 6, 23),
                gender="1",
            )
        )
        # Alan gets a passport document (auto-creates the passport_number identifier).
        await ps.add_identity_document(
            alan.uuid,
            CreateIdentityDocument(
                document_type="passport",
                issuing_authority="UK Passport Office",
                issuing_jurisdiction="GB",
                issue_date=date(1935, 5, 1),
                expiry_date=date(1945, 5, 1),
                identifier_type="passport_number",
                identifier_value="PP-TURING-001",
                identifier_scheme_name="UK Passport",
            ),
        )

        grace = await ps.create(
            CreatePerson(
                given_name="Grace",
                family_name="Hopper",
                date_of_birth=date(1906, 12, 9),
                gender="2",
            )
        )
        await ps.identifiers.add_person_identifier(
            grace.uuid,
            identifier_type="national_id_number",
            identifier_value="NID-HOPPER-001",
            identifier_scheme_name="Mock National ID",
        )

        # Persons with only system_id (no real identifiers) ------------------
        anon1 = await ps.create(CreatePerson(given_name="Byron", family_name="Lovelace"))
        anon2 = await ps.create(CreatePerson(given_name="Joan", family_name="Clarke"))

        # Memberships --------------------------------------------------------
        await gs.add_member(lovelace_hh.uuid, ada.uuid, role="head")
        await gs.add_member(lovelace_hh.uuid, anon1.uuid, role="member")

        await gs.add_member(turing_hh.uuid, alan.uuid, role="head")
        await gs.add_member(turing_hh.uuid, grace.uuid, role="member")
        await gs.add_member(turing_hh.uuid, anon2.uuid, role="member")

        await session.commit()

    logger.info(
        "seed complete: 2 groups, 5 persons (3 with real identifiers, 2 system_id-only), 1 passport document"
    )
