# larkinsh-x402

> Python SDK for Larkin — wallet authorization for x402-paid APIs.

```python
from larkinsh_x402 import Larkin, verify

client = Larkin(api_key="pf_live_...")
result = client.check(wallet="0xd8dA...", min_score=40)
# → { "ok": True, "data": { ... } }

# Pure, synchronous, no HTTP — verify any receipt with our public key
status = verify(receipt, public_key_base64url)
# → { "valid": True, "payload": {...} } or { "valid": False, "reason": "..." }
```

## Install

```bash
pip install larkinsh-x402
```

## License

MIT
