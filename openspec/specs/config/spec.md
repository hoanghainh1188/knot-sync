# config Specification

## Purpose

Defines how KnotSync is configured: one YAML file that lists data sources, the store location and scan settings, plus the `init` command that creates a starter file.

## Requirements

### Requirement: Config file location
The CLI SHALL read `knot-sync.config.yaml` from the current directory by default and SHALL accept another path through `-c` / `--config`.

#### Scenario: Default config file
- **WHEN** the user runs `knot-sync scan` in a folder that contains `knot-sync.config.yaml`
- **THEN** that file is used

#### Scenario: Missing config file
- **WHEN** the config file does not exist
- **THEN** the command exits with code 1 and tells the user to run `knot-sync init`

### Requirement: Relative paths resolve from the config file
All relative paths in the config (source paths, store path) SHALL resolve from the directory that contains the config file, not from the current directory.

#### Scenario: Relative source path
- **GIVEN** a config at `/work/knot-sync.config.yaml` with source path `./share`
- **WHEN** the config is loaded from any working directory
- **THEN** the source path is `/work/share`

### Requirement: Source validation
Each source SHALL have a unique `id` made of lower-case letters, digits, `-` or `_`, a supported `type`, and a non-empty `path`. Only `fs` is supported in this version.

#### Scenario: Invalid id
- **WHEN** a source id is `Bad Id`
- **THEN** loading fails with a message explaining the allowed characters

#### Scenario: Unsupported type
- **WHEN** a source has `type: oracle`
- **THEN** loading fails with a message listing the supported types

#### Scenario: Duplicate id
- **WHEN** two sources share the same id
- **THEN** loading fails with a message naming the duplicate id

### Requirement: Extension filter normalization
Source `extensions` SHALL be compared case-insensitively and SHALL accept values with or without a leading dot.

#### Scenario: Mixed-case extensions
- **WHEN** a source lists `extensions: [XLSX, .Pdf]`
- **THEN** the effective filter is `.xlsx` and `.pdf`

### Requirement: Defaults
When omitted, the store path SHALL be `.data/store.sqlite`, `scan.old_file_years` SHALL be 5 and `scan.hash` SHALL be true. Folders `node_modules`, `.git`, `.svn`, `$RECYCLE.BIN`, `System Volume Information`, `.Trash` and `.Trashes` SHALL always be excluded.

#### Scenario: Minimal config
- **WHEN** a config only defines one source
- **THEN** the defaults above apply and the always-excluded folders are skipped during scan

### Requirement: Init command
`knot-sync init` SHALL write a commented starter config, SHALL accept `--path <folder>` for the first source, and SHALL refuse to overwrite an existing file unless `--force` is given.

#### Scenario: Create starter config
- **WHEN** the user runs `knot-sync init --path ./share`
- **THEN** a config is created whose first source path is `./share`

#### Scenario: Existing config is protected
- **WHEN** the config file already exists and `--force` is not given
- **THEN** the command exits with code 1 and the file is unchanged
