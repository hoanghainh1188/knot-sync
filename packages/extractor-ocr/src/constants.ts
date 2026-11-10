/** Extractor id registered by this plugin. */
export const OCR_EXTRACTOR_ID = "ocr-docling";

/** Plugin name — also the config settings key (`extractor-ocr:`). */
export const OCR_PLUGIN_NAME = "extractor-ocr";

/** Extensions claimed when the plugin is loaded (office still owns .pdf first). */
export const OCR_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".tif",
  ".tiff",
  ".webp",
  ".pdf",
] as const;

/** Pinned Docling-serve CPU image (CLI override via settings.image). */
export const DEFAULT_DOCLING_IMAGE =
  "quay.io/docling-project/docling-serve-cpu:v1.38.2";

export const DEFAULT_TIMEOUT_SECONDS = 120;

export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_OCR_LICENSE";

/** Accepted only for tests / local smoke; document in README. */
export const OCR_TEST_LICENSE_SENTINEL = "knot-sync-ocr-dev";
