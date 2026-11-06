import {
  DEFAULT_GUARD_MODE,
  PLUGIN_API_VERSION,
  type GuardConfig,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import { applyGuardToDocument } from "./apply.js";
import { ALL_RULES } from "./rules.js";

export {
  applyGuardToDocument,
  collectFindings,
  computeRisk,
  mergeSpans,
  stripInjection,
  stripSpans,
} from "./apply.js";
export {
  ALL_RULES,
  controlsRule,
  HIDDEN_CHANNEL_RULES,
  hiddenTextRule,
  instructionEnRule,
  instructionJaRule,
  instructionVnRule,
} from "./rules.js";

export function createGuardPlugin(
  settings: GuardConfig = { mode: DEFAULT_GUARD_MODE },
): KnotSyncPlugin {
  void settings; // mode applied by CLI via applyGuardToDocument(config)
  return {
    name: "guard",
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      for (const rule of ALL_RULES) {
        api.registerGuardRule(rule);
      }
    },
  };
}

const defaultPlugin = createGuardPlugin();
export default defaultPlugin;
