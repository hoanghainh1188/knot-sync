export const CLOUD_DRIVE_PLUGIN_NAME = "@hoanghainh/knot-sync-connector-cloud-drive";
export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_CLOUD_DRIVE_LICENSE";
export const CLOUD_DRIVE_TEST_LICENSE_SENTINEL = "test-cloud-drive-license";
export const CLOUD_DRIVE_TYPES = ["gdrive", "sharepoint", "onedrive"] as const;
export type CloudDriveType = (typeof CLOUD_DRIVE_TYPES)[number];
