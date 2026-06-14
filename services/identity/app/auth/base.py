from abc import ABC, abstractmethod
from ..schemas import CurrentUser


class AuthAdapter(ABC):
    @abstractmethod
    async def authenticate(self, email: str, password: str) -> CurrentUser | None:
        """Return CurrentUser if credentials valid, else None."""

    @abstractmethod
    async def verify_token(self, token: str) -> CurrentUser | None:
        """Decode and verify a JWT, return CurrentUser or None."""
