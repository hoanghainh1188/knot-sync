## ADDED Requirements

### Requirement: Localized pruned count in run completion message

The `run.complete` message in `en`, `ja`, and `vi` SHALL include the `{pruned}` placeholder alongside `{extracted}`, `{skipped}`, and `{failed}`, formatted in the active CLI locale while keeping command tokens and exit codes unchanged.

#### Scenario: Japanese and Vietnamese run completion output shows pruned count

- **GIVEN** a scanned folder where one stale document was removed since the previous run
- **WHEN** the user runs `knot-sync run --lang ja` (or `--lang vi`)
- **THEN** stdout includes the localized `run.complete` line containing the pruned count `1`
- **AND** the existing `run.next` hint remains in the active locale

#### Scenario: Never-scanned store still reports missing inventory

- **GIVEN** a newly initialized store where `knot-sync scan` has never been executed
- **WHEN** the user runs `knot-sync run --lang ja`
- **THEN** the process exits 1
- **AND** stderr displays the localized `run.noInventory` message
