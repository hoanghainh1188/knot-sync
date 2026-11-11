# Spec Delta

## ADDED Requirements

### Requirement: Locale overviews clarify Paid distribution

The primary Japanese overview under `docs/ja/` and the primary Vietnamese
overview under `docs/vi/` SHALL each state that Paid plugins are not published
as separate npm packages, and that operators enable them from the monorepo via
config `plugins:` plus each plugin’s license environment variable.

#### Scenario: Japanese overview mentions Paid not on npm

- **WHEN** a reader opens the primary Japanese overview under `docs/ja/`
- **THEN** it states that Paid plugins are not separate npm packages (or clear
  Japanese equivalent)
- **AND** it mentions `plugins:` and license env / ライセンス環境変数 (or
  clear equivalent)

#### Scenario: Vietnamese overview mentions Paid không trên npm

- **WHEN** a reader opens the primary Vietnamese overview under `docs/vi/`
- **THEN** it states that plugin trả phí không phải gói npm riêng (or clear
  equivalent)
- **AND** it mentions `plugins:` and biến môi trường license (or clear
  equivalent)
