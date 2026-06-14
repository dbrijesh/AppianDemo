"""Azure AD OIDC adapter — production auth.
Swap AUTH_ADAPTER=azure_ad in env to activate.
"""
import httpx
from jose import jwt, JWTError
from ..schemas import CurrentUser
from .base import AuthAdapter


class AzureADAdapter(AuthAdapter):
    def __init__(self, tenant_id: str, client_id: str, client_secret: str):
        self._tenant_id = tenant_id
        self._client_id = client_id
        self._client_secret = client_secret
        self._jwks: dict | None = None

    async def _fetch_jwks(self):
        url = f"https://login.microsoftonline.com/{self._tenant_id}/discovery/v2.0/keys"
        async with httpx.AsyncClient() as client:
            r = await client.get(url)
            r.raise_for_status()
            self._jwks = r.json()

    async def authenticate(self, email: str, password: str) -> CurrentUser | None:
        """Password flow — not used with Azure AD; redirect to OIDC instead."""
        raise NotImplementedError("Use OIDC redirect flow with Azure AD")

    async def verify_token(self, token: str) -> CurrentUser | None:
        if not self._jwks:
            await self._fetch_jwks()
        try:
            payload = jwt.decode(
                token,
                self._jwks,
                algorithms=["RS256"],
                audience=self._client_id,
            )
        except JWTError:
            return None
        roles = payload.get("roles", [])
        return CurrentUser(
            id=payload.get("oid", payload.get("sub")),
            email=payload.get("preferred_username", ""),
            full_name=payload.get("name", ""),
            roles=roles,
            is_active=True,
        )
