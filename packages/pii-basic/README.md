# @hoanghainh/knot-sync-pii-basic

Built-in PII detection and masking plugin.

## Rule ids

| Id | Detects |
|---|---|
| `email` | Email addresses |
| `phone-jp` | Japanese phone numbers |
| `phone-vn` | Vietnamese phone numbers |
| `cccd` | Vietnamese CCCD (12 digits) |
| `my-number` | Japanese My Number (check digit) |
| `credit-card` | Card numbers (Luhn) |
| `mst-vn` | Vietnamese tax code (10-digit enterprise / `NNNNNNNNNN-NNN` branch) |
| `bank-account` | Account digit runs near JP/VN/EN labels (`口座番号`, `Số tài khoản`, …) |
| `person-name` | Label-gated JP/VN name heuristics (`氏名`, `Họ tên`, …) |

Modes (`pii.mode`): `mask`, `hash`, `drop`. Findings store `{ rule, start, end }` without raw match text.

Part of [KnotSync](https://github.com/hoanghainh1188/knot-sync). See the
repository root README for install and usage.

**License:** Apache-2.0  
**Version:** 0.1.1
