"""HTTP client for Larkin's /v1/check endpoint.

Synchronous by default — httpx also supports async (AsyncClient), but the v1
SDK surface is sync for simplicity. Callers who want async can wrap:

    result = await asyncio.to_thread(client.check, wallet="0x...")
"""

from __future__ import annotations

from typing import Any

import httpx

DEFAULT_ENDPOINT = "https://larkin.sh"
DEFAULT_TIMEOUT_SECONDS = 5.0


class Larkin:
    def __init__(
        self,
        api_key: str,
        endpoint: str = DEFAULT_ENDPOINT,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._endpoint = endpoint.rstrip("/")
        self._client = httpx.Client(timeout=timeout)

    def check(
        self,
        wallet: str,
        chain_id: int = 1,
        min_score: int | None = None,
        require_erc8004: bool = False,
    ) -> dict[str, Any]:
        """Call POST /v1/check.

        Returns the full decoded JSON response — {"ok": True, "data": {...}, "meta": {...}}
        or {"ok": False, "error": {...}}. Raises on network/HTTP errors.
        """
        body: dict[str, Any] = {"wallet": wallet, "chainId": chain_id}
        if min_score is not None:
            body["minScore"] = min_score
        if require_erc8004:
            body["requireERC8004"] = True

        response = self._client.post(
            f"{self._endpoint}/v1/check",
            json=body,
            headers={"x-api-key": self._api_key},
        )
        response.raise_for_status()
        return response.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "Larkin":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()
