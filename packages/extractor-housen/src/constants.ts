/** Extractor id registered by this plugin. */
export const HOUSEN_EXTRACTOR_ID = "housen-xlsx";

/** Plugin name — also the config settings key (`extractor-housen:`). */
export const HOUSEN_PLUGIN_NAME = "extractor-housen";

export const HOUSEN_EXTENSIONS = [".xlsx"] as const;

export const DEFAULT_TIMEOUT_SECONDS = 30;

export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_HOUSEN_LICENSE";

/** Accepted only for tests / local smoke; document in README. */
export const HOUSEN_TEST_LICENSE_SENTINEL = "knot-sync-housen-dev";

/** Default form-likeness score threshold in [0, 1]. */
export const DEFAULT_FORM_THRESHOLD = 0.42;

/** Soft-fail code when workbook is not form-like (CLI keeps office Document). */
export const NOT_FORM_CODE = "NOT_FORM";
