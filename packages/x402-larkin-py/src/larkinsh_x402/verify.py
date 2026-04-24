"""Pure Ed25519 receipt verification — no HTTP, no Larkin dependency.

Mirrors @larkinsh/verify's semantics so receipts are interchangeable between
Python and TypeScript clients. Canonicalization uses sort_keys + compact
separators, which matches json-canonicalize for the receipt payload shape
(no floats, no scientific notation, only strings/ints/booleans/nested objects).
"""

from __future__ import annotations

import base64
import json
from typing import Any, Mapping

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

MOCK_SENTINEL = "MOCK_UNSIGNED_RECEIPT_DO_NOT_TRUST"


def _b64url_decode(s: str) -> bytes:
    # Python's urlsafe_b64decode requires correct padding; receipts use
    # unpadded base64url so we re-pad here.
    padding = (-len(s)) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def _canonicalize(payload: Mapping[str, Any]) -> bytes:
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def verify(
    receipt: Mapping[str, Any],
    public_key_b64url: str,
) -> dict[str, Any]:
    """Verify a Larkin receipt against a public key.

    Returns a dict {"valid": True, "payload": {...}} on success, or
    {"valid": False, "reason": "..."} on failure. Deliberately never raises
    on invalid receipts — callers shouldn't need try/except for auth checks.
    """
    if not isinstance(receipt, Mapping):
        return {"valid": False, "reason": "malformed receipt"}

    sig = receipt.get("sig")
    payload = receipt.get("payload")
    kid = receipt.get("kid")

    if sig == MOCK_SENTINEL:
        return {"valid": False, "reason": "unsigned mock receipt"}

    if not isinstance(payload, Mapping) or not isinstance(sig, str) or not isinstance(
        kid, str
    ):
        return {"valid": False, "reason": "malformed receipt"}

    expires_at = payload.get("expiresAt")
    if isinstance(expires_at, int):
        import time

        if expires_at < int(time.time()):
            return {"valid": False, "reason": "expired"}

    try:
        pub_bytes = _b64url_decode(public_key_b64url)
        sig_bytes = _b64url_decode(sig)
    except Exception:
        return {"valid": False, "reason": "malformed receipt"}

    if len(pub_bytes) != 32:
        return {"valid": False, "reason": "malformed public key"}
    if len(sig_bytes) != 64:
        return {"valid": False, "reason": "signature mismatch"}

    try:
        VerifyKey(pub_bytes).verify(_canonicalize(payload), sig_bytes)
    except BadSignatureError:
        return {"valid": False, "reason": "signature mismatch"}
    except Exception:
        return {"valid": False, "reason": "signature mismatch"}

    return {"valid": True, "payload": dict(payload)}
