# Spec Delta

## ADDED Requirements

### Requirement: Trilingual 3-step Enterprise Pilot Playbook
The repository SHALL include `docs/PILOT_PLAYBOOK.md` (English) along with Japanese (`docs/ja/PILOT_PLAYBOOK.md`) and Vietnamese (`docs/vi/PILOT_PLAYBOOK.md`) translations documenting the 3-step Enterprise Pilot workflow: Step 1 (`scan --pii --report`), Step 2 (`describe` + `ui`), and Step 3 (LAN `serve --http` + MCP client setup).

#### Scenario: Japanese pilot playbook covers 3-step workflow and read-only safety
- **WHEN** a Japanese IT admin (情シス) opens `docs/ja/PILOT_PLAYBOOK.md`
- **THEN** it documents `knot-sync scan --pii --report`, `knot-sync describe` + `knot-sync ui`, and LAN `serve --http` with read-only (`:ro` / 読み取り専用) source guarantees

#### Scenario: Vietnamese pilot playbook covers 3-step workflow and read-only safety
- **WHEN** a Vietnamese IT admin opens `docs/vi/PILOT_PLAYBOOK.md`
- **THEN** it documents `knot-sync scan --pii --report`, `knot-sync describe` + `knot-sync ui`, and LAN `serve --http` with read-only (`:ro` / chỉ đọc) source guarantees

#### Scenario: Root README links to Enterprise Pilot Playbook
- **WHEN** a reader inspects `README.md`
- **THEN** it links to `docs/PILOT_PLAYBOOK.md`, `docs/ja/PILOT_PLAYBOOK.md`, and `docs/vi/PILOT_PLAYBOOK.md`
