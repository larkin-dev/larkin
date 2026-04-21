# preflight-x402

> Python SDK for Preflight — wallet authorization for x402-paid APIs.

```python
from preflight_x402 import Preflight, verify

client = Preflight(api_key="pf_live_...")
result = client.check(wallet="0x...", min_score=40)

ok = verify(receipt, public_key)
```

## Install

```bash
pip install preflight-x402
```

## Status

Stubbed in CP1. Full client + verifier land in CP3/CP6. See `PREFLIGHT_BRIEF.md`.

## License

MIT
