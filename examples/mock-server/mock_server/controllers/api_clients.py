"""REST controller for OAuth2 API client management."""

from __future__ import annotations

import logging
from typing import Annotated

from litestar import Controller, delete, get, post
from litestar.params import Parameter
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.auth.guards import jwt_auth_guard
from mock_server.schemas import (
    ApiClientResponse,
    ApiClientWithSecret,
    CreateApiClient,
    PaginatedResponse,
)
from mock_server.services import ApiClientService

logger = logging.getLogger(__name__)


def _to_response(client) -> ApiClientResponse:  # type: ignore[no-untyped-def]
    """Hydrate a safe (no-secret) response from an ORM ApiClient."""
    return ApiClientResponse.model_validate(client)


def _to_response_with_secret(client, secret: str) -> ApiClientWithSecret:  # type: ignore[no-untyped-def]
    """Build a one-time response that carries the plaintext secret."""
    return ApiClientWithSecret(
        uuid=client.uuid,
        client_id=client.client_id,
        name=client.name,
        description=client.description,
        scopes=list(client.scopes or []),
        created_at=client.created_at,
        last_used_at=client.last_used_at,
        revoked_at=client.revoked_at,
        client_secret=secret,
    )


class ApiClientController(Controller):
    """All ``/v1/api-clients*`` routes. Protected by :func:`jwt_auth_guard`."""

    path = "/v1/api-clients"
    tags = ["api-clients"]
    guards = [jwt_auth_guard]

    @get("/")
    async def list_clients(
        self,
        db_session: AsyncSession,
        active_only: Annotated[
            bool,
            Parameter(description="If true (default), hide revoked clients."),
        ] = True,
        limit: Annotated[int, Parameter(ge=1, le=500)] = 50,
        offset: Annotated[int, Parameter(ge=0)] = 0,
    ) -> PaginatedResponse[ApiClientResponse]:
        """Paged list of registered clients. Secrets are never returned."""
        svc = ApiClientService(db_session)
        rows, total = await svc.list(active_only=active_only, limit=limit, offset=offset)
        next_offset = offset + limit if offset + limit < total else None
        return PaginatedResponse[ApiClientResponse](
            items=[_to_response(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
            next_offset=next_offset,
        )

    @get("/{uuid:str}")
    async def get_client(self, uuid: str, db_session: AsyncSession) -> ApiClientResponse:
        """Fetch a single client by UUID."""
        svc = ApiClientService(db_session)
        client = await svc.get(uuid)
        return _to_response(client)

    @post("/", status_code=HTTP_201_CREATED)
    async def create_client(self, data: CreateApiClient, db_session: AsyncSession) -> ApiClientWithSecret:
        """Create a new client and return the one-time plaintext secret.

        The secret in the response is the **only** opportunity to capture it.
        After this call returns, the server stores only a bcrypt hash and
        cannot recover the plaintext.
        """
        svc = ApiClientService(db_session)
        client, secret = await svc.create(
            name=data.name,
            client_id=data.client_id,
            description=data.description,
            scopes=data.scopes,
        )
        # Log the event, never the value.
        logger.info("POST /v1/api-clients: created uuid=%s client_id=%s", client.uuid, client.client_id)
        return _to_response_with_secret(client, secret)

    @post("/{uuid:str}/rotate")
    async def rotate_client(self, uuid: str, db_session: AsyncSession) -> ApiClientWithSecret:
        """Rotate a client's secret. Old secret immediately stops working."""
        svc = ApiClientService(db_session)
        client, secret = await svc.rotate_secret(uuid)
        logger.info("POST /v1/api-clients/%s/rotate", client.uuid)
        return _to_response_with_secret(client, secret)

    @post("/{uuid:str}/revoke")
    async def revoke_client(self, uuid: str, db_session: AsyncSession) -> ApiClientResponse:
        """Soft-delete: mark the client as revoked. Authentication stops immediately."""
        svc = ApiClientService(db_session)
        client = await svc.revoke(uuid)
        return _to_response(client)

    @delete("/{uuid:str}", status_code=HTTP_204_NO_CONTENT)
    async def delete_client(self, uuid: str, db_session: AsyncSession) -> None:
        """Hard-delete. Useful for tests; prefer ``revoke`` in production."""
        svc = ApiClientService(db_session)
        await svc.delete(uuid)
