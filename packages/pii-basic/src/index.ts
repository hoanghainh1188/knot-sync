import {
  DEFAULT_PII_MODE,
  PLUGIN_API_VERSION,
  type KnotSyncPlugin,
  type PiiConfig,
} from "@hoanghainh/knot-sync-core";
import { applyPiiToDocument, textHasPii } from "./apply.js";
import { ALL_RULES } from "./rules.js";

export {
  applyModeToText,
  applyPiiToDocument,
  collectFindings,
  mergeSpans,
  textHasPii,
} from "./apply.js";
export {
  ALL_RULES,
  bankAccountRule,
  creditCardRule,
  emailRule,
  isValidMyNumber,
  luhnOk,
  makeValidMyNumber,
  mstVnRule,
  myNumberCheckDigit,
  personNameRule,
  phoneJpRule,
  phoneVnRule,
} from "./rules.js";
export { loadOrCreateSalt } from "./salt.js";

export function createPiiBasicPlugin(
  settings: PiiConfig = { mode: DEFAULT_PII_MODE, saltPath: "" },
): KnotSyncPlugin {
  void settings; // salt/mode applied by CLI via applyPiiToDocument(config)
  return {
    name: "pii-basic",
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      for (const rule of ALL_RULES) {
        api.registerPiiRule(rule);
      }
    },
  };
}

const defaultPlugin = createPiiBasicPlugin();
export default defaultPlugin;
