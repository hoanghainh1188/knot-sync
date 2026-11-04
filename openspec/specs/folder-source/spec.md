# folder-source Specification

## Purpose

Reads a folder tree on disk as a data source, strictly read-only, and produces one inventory entry per eligible file for later processing.

## Requirements

### Requirement: Read-only access
Reading a folder source MUST NOT create, modify, move or delete any file or folder inside the source.

#### Scenario: Scan leaves the source untouched
- **WHEN** a folder source is scanned
- **THEN** no file or folder inside the source path is created, changed or removed

### Requirement: File inventory entry
For each eligible file the source SHALL report its path relative to the source root (using `/` separators), lower-case extension, document type, size in bytes, modification time and, when hashing is enabled, the sha256 of its bytes.

#### Scenario: Japanese and Vietnamese paths
- **GIVEN** files `経理/2024/請求書.xlsx` and `Hóa đơn.PDF`
- **WHEN** the folder is scanned
- **THEN** their relative paths are reported unchanged and `Hóa đơn.PDF` has extension `.pdf` and type `pdf`

#### Scenario: Identical files share a hash
- **WHEN** two files have identical bytes
- **THEN** both entries have the same sha256

### Requirement: Skipped entries
The source SHALL skip symbolic links, excluded folder names (case-insensitive), files outside the extension filter, and junk files: Office lock files (`~$*`), macOS resource files (`._*`), `Thumbs.db`, `desktop.ini` and `.DS_Store`.

#### Scenario: Office lock file
- **WHEN** the folder contains `~$見積書.xlsx`
- **THEN** it is not reported

#### Scenario: Symbolic link
- **WHEN** the folder contains a symbolic link to another folder
- **THEN** the link is not followed

### Requirement: Unreadable items do not stop the scan
A file or sub-folder that cannot be read SHALL be reported as an issue with its path and an error code (`EACCES`, `EPERM`, `ENOENT`, `EBUSY` or `OTHER`), and the scan SHALL continue.

#### Scenario: Permission denied
- **WHEN** one sub-folder cannot be opened
- **THEN** it is reported as an `EACCES` issue and the other files are still reported

### Requirement: Invalid source root
If the source root does not exist or is not a folder, scanning that source SHALL fail with an error.

#### Scenario: Missing root
- **WHEN** the source path does not exist
- **THEN** the scan fails with an error naming the path
