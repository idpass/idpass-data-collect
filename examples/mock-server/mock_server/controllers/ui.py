"""UI controllers — Jinja2 templates + htmx partials.

Authentication is session-based (cookie). Everything under ``/ui`` except
``/ui/login`` requires authentication via :func:`ui_session_guard`.
"""

from __future__ import annotations

import logging
import secrets
from datetime import date
from typing import Annotated, Any

from litestar import Controller, Request, get, post
from litestar.enums import RequestEncodingType
from litestar.params import Body
from litestar.response import Redirect, Template
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.auth.guards import ui_session_guard
from mock_server.config import get_settings
from mock_server.errors import AppError
from mock_server.models.identifier import SYSTEM_ID_TYPE
from mock_server.schemas.group import CreateGroup, MemberAdd, UpdateGroup
from mock_server.schemas.identifier import CreateIdentifier
from mock_server.schemas.person import CreatePerson, UpdatePerson
from mock_server.services import ApiClientService, GroupService, PersonService

logger = logging.getLogger(__name__)


def _filter_visible_identifiers(identifiers: list[Any]) -> list[Any]:
    """Hide ``system_id`` rows from the UI (they remain in the API response)."""
    return [i for i in identifiers if i.identifier_type != SYSTEM_ID_TYPE]


def _parse_optional_date(value: str | None) -> date | None:
    """Parse an HTML ``<input type=date>`` value, treating empty string as None."""
    if value is None or value == "":
        return None
    return date.fromisoformat(value)


# ---------------------------------------------------------------------------
# Auth (login/logout) — no session guard
# ---------------------------------------------------------------------------


class LoginController(Controller):
    """Session login/logout pages."""

    path = "/ui"
    tags = ["ui"]

    @get("/login")
    async def login_form(self, request: Request) -> Template:
        """Render the login page."""
        session = getattr(request, "session", None) or {}
        if session.get("authenticated"):
            return Template(
                template_name="login.html",
                context={"error": None, "already": True},
            )
        return Template(template_name="login.html", context={"error": None})

    @post("/login")
    async def login_submit(
        self,
        request: Request,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Template | Redirect:
        """Process login form submission."""
        settings = get_settings()
        username = data.get("username", "")
        password = data.get("password", "")
        ok_user = secrets.compare_digest(username, settings.ui_username)
        ok_pw = secrets.compare_digest(password, settings.ui_password)
        if not (ok_user and ok_pw):
            return Template(
                template_name="login.html",
                context={"error": "Invalid username or password"},
            )
        # Regenerate session to mitigate session fixation
        request.clear_session()
        request.set_session({"authenticated": True, "username": username})
        return Redirect(path="/", status_code=303)

    @get("/logout")
    async def logout(self, request: Request) -> Redirect:
        """Clear the session cookie and redirect to login."""
        request.clear_session()
        return Redirect(path="/ui/login", status_code=303)


# ---------------------------------------------------------------------------
# Landing + protected UI
# ---------------------------------------------------------------------------


class LandingController(Controller):
    """Landing page."""

    path = "/"
    tags = ["ui"]
    guards = [ui_session_guard]

    @get("/")
    async def index(self, db_session: AsyncSession) -> Template:
        """Landing page with record counts."""
        persons = PersonService(db_session)
        groups = GroupService(db_session)
        _, person_count = await persons.list(limit=1)
        _, group_count = await groups.list(limit=1)
        return Template(
            template_name="landing.html",
            context={"person_count": person_count, "group_count": group_count},
        )


class PersonsUIController(Controller):
    """UI routes for persons."""

    path = "/ui/persons"
    tags = ["ui"]
    guards = [ui_session_guard]

    @get("/")
    async def list_view(self, db_session: AsyncSession) -> Template:
        """List view with search box (htmx)."""
        svc = PersonService(db_session)
        rows, total = await svc.list(limit=100)
        return Template(
            template_name="persons/list.html",
            context={"persons": rows, "total": total, "q": ""},
        )

    @get("/search")
    async def search(self, db_session: AsyncSession, q: str | None = None) -> Template:
        """htmx partial: filter the persons table by name."""
        svc = PersonService(db_session)
        rows, _ = await svc.list(limit=100, search=q or None)
        return Template(
            template_name="persons/_rows.html",
            context={"persons": rows},
        )

    @get("/new")
    async def new_form(self) -> Template:
        """Render blank create form."""
        return Template(
            template_name="persons/form.html",
            context={"person": None, "action": "/ui/persons/new", "title": "New Person"},
        )

    @post("/new")
    async def new_submit(
        self,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Redirect:
        """Process new-person form."""
        svc = PersonService(db_session)
        payload = CreatePerson(
            given_name=data.get("given_name") or None,
            family_name=data.get("family_name") or None,
            date_of_birth=_parse_optional_date(data.get("date_of_birth")),
            gender=data.get("gender") or None,
        )
        person = await svc.create(payload)
        return Redirect(path=f"/ui/persons/{person.uuid}", status_code=303)

    @get("/{uuid:str}")
    async def detail(self, uuid: str, db_session: AsyncSession) -> Template:
        """Render the detail page, hiding system_id identifiers."""
        svc = PersonService(db_session)
        person = await svc.get(uuid)
        return Template(
            template_name="persons/detail.html",
            context={
                "person": person,
                "visible_identifiers": _filter_visible_identifiers(person.identifiers),
            },
        )

    @get("/{uuid:str}/edit")
    async def edit_form(self, uuid: str, db_session: AsyncSession) -> Template:
        """Render edit form pre-populated with current values."""
        svc = PersonService(db_session)
        person = await svc.get(uuid)
        return Template(
            template_name="persons/form.html",
            context={
                "person": person,
                "action": f"/ui/persons/{uuid}/edit",
                "title": "Edit Person",
            },
        )

    @post("/{uuid:str}/edit")
    async def edit_submit(
        self,
        uuid: str,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Redirect:
        """Process edit form submission."""
        svc = PersonService(db_session)
        payload = UpdatePerson(
            given_name=data.get("given_name") or None,
            family_name=data.get("family_name") or None,
            date_of_birth=_parse_optional_date(data.get("date_of_birth")),
            gender=data.get("gender") or None,
        )
        await svc.update(uuid, payload)
        return Redirect(path=f"/ui/persons/{uuid}", status_code=303)

    @get("/{uuid:str}/identifiers/new")
    async def new_identifier_form(self, uuid: str, db_session: AsyncSession) -> Template:
        """Render form to add an identifier to a person."""
        svc = PersonService(db_session)
        person = await svc.get(uuid)
        return Template(
            template_name="persons/identifier_form.html",
            context={"person": person},
        )

    @post("/{uuid:str}/identifiers/new")
    async def new_identifier_submit(
        self,
        uuid: str,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Redirect:
        """Process add-identifier form."""
        svc = PersonService(db_session)
        payload = CreateIdentifier(
            identifier_type=data.get("identifier_type", ""),
            identifier_value=data.get("identifier_value", ""),
            identifier_scheme_id=data.get("identifier_scheme_id") or None,
            identifier_scheme_name=data.get("identifier_scheme_name") or None,
        )
        await svc.identifiers.add_person_identifier(
            uuid,
            identifier_type=payload.identifier_type,
            identifier_value=payload.identifier_value,
            identifier_scheme_id=payload.identifier_scheme_id,
            identifier_scheme_name=payload.identifier_scheme_name,
        )
        return Redirect(path=f"/ui/persons/{uuid}", status_code=303)


class GroupsUIController(Controller):
    """UI routes for groups."""

    path = "/ui/groups"
    tags = ["ui"]
    guards = [ui_session_guard]

    @get("/")
    async def list_view(self, db_session: AsyncSession) -> Template:
        """List view."""
        svc = GroupService(db_session)
        rows, total = await svc.list(limit=100)
        return Template(
            template_name="groups/list.html",
            context={"groups": rows, "total": total, "q": ""},
        )

    @get("/search")
    async def search(self, db_session: AsyncSession, q: str | None = None) -> Template:
        """htmx partial for group search."""
        svc = GroupService(db_session)
        rows, _ = await svc.list(limit=100, search=q or None)
        return Template(
            template_name="groups/_rows.html",
            context={"groups": rows},
        )

    @get("/new")
    async def new_form(self) -> Template:
        """Render blank create form."""
        return Template(
            template_name="groups/form.html",
            context={"group": None, "action": "/ui/groups/new", "title": "New Group"},
        )

    @post("/new")
    async def new_submit(
        self,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Redirect:
        """Process new-group form."""
        svc = GroupService(db_session)
        payload = CreateGroup(
            name=data.get("name", "").strip() or "Unnamed Group",
            group_type=data.get("group_type", "household") or "household",
        )
        group = await svc.create(payload)
        return Redirect(path=f"/ui/groups/{group.uuid}", status_code=303)

    @get("/{uuid:str}")
    async def detail(self, uuid: str, db_session: AsyncSession) -> Template:
        """Render the detail page with membership management."""
        group_svc = GroupService(db_session)
        person_svc = PersonService(db_session)
        group = await group_svc.get(uuid)
        # Fetch all persons for the "add member" dropdown, excluding current members.
        member_uuids = {m.person_uuid for m in group.memberships}
        persons, _ = await person_svc.list(limit=500)
        candidates = [p for p in persons if p.uuid not in member_uuids]
        # Build a lookup so templates can render person names for memberships.
        person_lookup = {p.uuid: p for p in persons}
        return Template(
            template_name="groups/detail.html",
            context={
                "group": group,
                "visible_identifiers": _filter_visible_identifiers(group.identifiers),
                "candidates": candidates,
                "person_lookup": person_lookup,
            },
        )

    @get("/{uuid:str}/edit")
    async def edit_form(self, uuid: str, db_session: AsyncSession) -> Template:
        """Render edit form."""
        svc = GroupService(db_session)
        group = await svc.get(uuid)
        return Template(
            template_name="groups/form.html",
            context={"group": group, "action": f"/ui/groups/{uuid}/edit", "title": "Edit Group"},
        )

    @post("/{uuid:str}/edit")
    async def edit_submit(
        self,
        uuid: str,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Redirect:
        """Process group edit form."""
        svc = GroupService(db_session)
        payload = UpdateGroup(
            name=data.get("name") or None,
            group_type=data.get("group_type") or None,
        )
        await svc.update(uuid, payload)
        return Redirect(path=f"/ui/groups/{uuid}", status_code=303)

    @post("/{uuid:str}/members/add")
    async def add_member(
        self,
        uuid: str,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Redirect:
        """Add a person to the group (non-htmx submit that redirects)."""
        svc = GroupService(db_session)
        payload = MemberAdd(
            person_uuid=data.get("person_uuid", ""),
            role=data.get("role") or "member",
        )
        try:
            await svc.add_member(uuid, payload.person_uuid, role=payload.role)
        except AppError as exc:
            logger.warning("add_member failed: %s", exc.message)
        return Redirect(path=f"/ui/groups/{uuid}", status_code=303)

    @post("/{uuid:str}/members/{person_uuid:str}/remove")
    async def remove_member(
        self, uuid: str, person_uuid: str, db_session: AsyncSession
    ) -> Redirect:
        """Remove a person from the group."""
        svc = GroupService(db_session)
        try:
            await svc.remove_member(uuid, person_uuid)
        except AppError as exc:
            logger.warning("remove_member failed: %s", exc.message)
        return Redirect(path=f"/ui/groups/{uuid}", status_code=303)


# ---------------------------------------------------------------------------
# API Client management UI
# ---------------------------------------------------------------------------


# Session key used to briefly hold a one-time plaintext secret across a
# POST→303 redirect. The detail view clears it after the first render.
_PENDING_SECRET_KEY = "pending_client_secret"


def _stash_pending_secret(request: Request, client_uuid: str, secret: str) -> None:
    """Briefly persist a plaintext secret on the session for the detail page."""
    session = getattr(request, "session", None) or {}
    session[_PENDING_SECRET_KEY] = {"uuid": client_uuid, "secret": secret}
    request.set_session(session)


def _pop_pending_secret(request: Request, client_uuid: str) -> str | None:
    """Read and clear the pending secret if it matches ``client_uuid``."""
    session = getattr(request, "session", None) or {}
    pending = session.get(_PENDING_SECRET_KEY)
    if not pending or pending.get("uuid") != client_uuid:
        return None
    # Best-effort clear; session middleware rewrites on response.
    session.pop(_PENDING_SECRET_KEY, None)
    request.set_session(session)
    return pending.get("secret")


def _scopes_from_checkboxes(data: dict[str, Any]) -> list[str]:
    """Collect scopes from individual ``scope_<name>`` checkbox fields.

    Unchecked checkboxes are absent from URL-encoded form bodies, so a key's
    presence (with any truthy value) means the box was ticked. This avoids
    multi-value form parsing quirks in Litestar's ``URL_ENCODED`` body binding.
    """
    scopes: list[str] = []
    if data.get("scope_read"):
        scopes.append("read")
    if data.get("scope_write"):
        scopes.append("write")
    return scopes


class ApiClientsUIController(Controller):
    """UI routes for managing OAuth2 API clients."""

    path = "/ui/clients"
    tags = ["ui"]
    guards = [ui_session_guard]

    @get("/")
    async def list_view(self, db_session: AsyncSession) -> Template:
        """List view — all clients (including revoked)."""
        svc = ApiClientService(db_session)
        rows, total = await svc.list(active_only=False, limit=200)
        return Template(
            template_name="clients/list.html",
            context={"clients": rows, "total": total, "q": ""},
        )

    @get("/search")
    async def search(self, db_session: AsyncSession, q: str | None = None) -> Template:
        """htmx partial — filter by name or client_id substring."""
        svc = ApiClientService(db_session)
        rows, _ = await svc.list(active_only=False, limit=200)
        needle = (q or "").strip().lower()
        if needle:
            rows = [
                c
                for c in rows
                if needle in (c.name or "").lower() or needle in c.client_id.lower()
            ]
        return Template(
            template_name="clients/_rows.html",
            context={"clients": rows},
        )

    @get("/new")
    async def new_form(self) -> Template:
        """Render blank create form."""
        return Template(
            template_name="clients/form.html",
            context={"action": "/ui/clients/new", "title": "New API client", "error": None},
        )

    @post("/new")
    async def new_submit(
        self,
        request: Request,
        db_session: AsyncSession,
        data: Annotated[dict[str, Any], Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> Redirect | Template:
        """Process new-client form. Stashes secret on session for the detail page."""
        svc = ApiClientService(db_session)
        try:
            client, secret = await svc.create(
                name=(data.get("name") or "").strip() or None,
                client_id=(data.get("client_id") or "").strip() or None,
                description=(data.get("description") or "").strip() or None,
                scopes=_scopes_from_checkboxes(data),
            )
        except AppError as exc:
            return Template(
                template_name="clients/form.html",
                context={
                    "action": "/ui/clients/new",
                    "title": "New API client",
                    "error": exc.message,
                    "form": data,
                },
            )
        _stash_pending_secret(request, client.uuid, secret)
        return Redirect(path=f"/ui/clients/{client.uuid}?new=1", status_code=303)

    @get("/{uuid:str}")
    async def detail(
        self,
        uuid: str,
        request: Request,
        db_session: AsyncSession,
        new: int | None = None,
        rotated: int | None = None,
    ) -> Template:
        """Detail page. Shows a one-time secret banner when ``?new=1`` or ``?rotated=1``."""
        svc = ApiClientService(db_session)
        client = await svc.get(uuid)
        show_secret = None
        banner = None
        if new or rotated:
            show_secret = _pop_pending_secret(request, uuid)
            banner = "created" if new else "rotated"
        return Template(
            template_name="clients/detail.html",
            context={
                "client": client,
                "show_secret": show_secret,
                "banner": banner,
            },
        )

    @post("/{uuid:str}/rotate")
    async def rotate(self, uuid: str, request: Request, db_session: AsyncSession) -> Redirect:
        """Rotate the client secret and redirect with ``?rotated=1``."""
        svc = ApiClientService(db_session)
        client, secret = await svc.rotate_secret(uuid)
        _stash_pending_secret(request, client.uuid, secret)
        return Redirect(path=f"/ui/clients/{uuid}?rotated=1", status_code=303)

    @post("/{uuid:str}/revoke")
    async def revoke(self, uuid: str, db_session: AsyncSession) -> Redirect:
        """Revoke the client and return to the detail page."""
        svc = ApiClientService(db_session)
        await svc.revoke(uuid)
        return Redirect(path=f"/ui/clients/{uuid}", status_code=303)

    @post("/{uuid:str}/delete")
    async def delete(self, uuid: str, db_session: AsyncSession) -> Redirect:
        """Hard-delete the client and return to the list."""
        svc = ApiClientService(db_session)
        await svc.delete(uuid)
        return Redirect(path="/ui/clients", status_code=303)


__all__ = [
    "ApiClientsUIController",
    "GroupsUIController",
    "LandingController",
    "LoginController",
    "PersonsUIController",
]
