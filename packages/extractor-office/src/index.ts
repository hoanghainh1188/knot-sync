import {
  PLUGIN_API_VERSION,
  type Extractor,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import { OFFICE_EXTENSIONS, extractOfficeFile } from "./extract.js";

export { OFFICE_EXTENSIONS, extractOfficeFile } from "./extract.js";

export const officeExtractor: Extractor = {
  id: "office",
  extensions: [...OFFICE_EXTENSIONS],
  extract: (file) => extractOfficeFile(file),
};

const officePlugin: KnotSyncPlugin = {
  name: "extractor-office",
  version: "0.0.1",
  apiVersion: PLUGIN_API_VERSION,
  register(api) {
    api.registerExtractor(officeExtractor);
  },
};

export default officePlugin;
