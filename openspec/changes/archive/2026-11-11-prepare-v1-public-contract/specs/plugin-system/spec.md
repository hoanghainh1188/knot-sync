# Spec Delta

## ADDED Requirements

### Requirement: Plugin host apiVersion 1 is the 1.0 contract

The plugin host SHALL keep `apiVersion` `1` as the 1.0-stable plugin contract.
Plugins whose `apiVersion` does not match the host MUST still be rejected with
an actionable error that names the plugin and the supported host version.
Changing the supported host `apiVersion` to a value other than `1` SHALL be a
breaking change requiring a major package version bump after 1.0.0.

#### Scenario: Compatible plugin loads at apiVersion 1

- **WHEN** a plugin exports `apiVersion: 1` matching the host
- **THEN** the host accepts the plugin for registration (subject to other
  existing validation)

#### Scenario: Incompatible apiVersion still fails clearly

- **WHEN** a plugin exports an `apiVersion` other than the host-supported value
- **THEN** registration fails with a message that includes the plugin name and
  the host-supported `apiVersion`
