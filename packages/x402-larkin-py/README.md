# larkin-x402

> Python SDK for Larkin — wallet authorization for x402-paid APIs.

```python
from larkin_x402 import Larkin, verify

client = Larkin(api_key="pf_live_...")
result = client.check(wallet="0x...", min_score=40)

ok = verify(receipt, public_key)
```

## Install

```bash
pip install larkin-x402
```

## Status

Stubbed in CP1. Full client + verifier land in CP3/CP6. See `BRIEF.md`.

## License

MIT
