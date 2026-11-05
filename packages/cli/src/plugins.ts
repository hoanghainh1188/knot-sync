import fsPlugin from "@hoanghainh/knot-sync-connector-fs";
import {
  loadPlugins,
  type PluginHost,
  type StructuralConfig,
} from "@hoanghainh/knot-sync-core";

/** Built-in plugins always loaded before config `plugins:`. */
export const BUILTIN_PLUGINS = [fsPlugin];

export async function loadAppPlugins(structural: StructuralConfig): Promise<PluginHost> {
  return loadPlugins({
    builtins: BUILTIN_PLUGINS,
    entries: structural.plugins,
    baseDir: structural.baseDir,
    pluginSettings: structural.pluginSettings,
  });
}
