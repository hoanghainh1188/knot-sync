import fsPlugin from "@hoanghainh/knot-sync-connector-fs";
import officePlugin from "@hoanghainh/knot-sync-extractor-office";
import {
  loadPlugins,
  type Extractor,
  type FileEntry,
  type PluginHost,
  type StructuralConfig,
} from "@hoanghainh/knot-sync-core";

/** Built-in plugins always loaded before config `plugins:`. */
export const BUILTIN_PLUGINS = [fsPlugin, officePlugin];

export async function loadAppPlugins(structural: StructuralConfig): Promise<PluginHost> {
  return loadPlugins({
    builtins: BUILTIN_PLUGINS,
    entries: structural.plugins,
    baseDir: structural.baseDir,
    pluginSettings: structural.pluginSettings,
  });
}

/** First registered extractor that claims this file extension. */
export function findExtractor(host: PluginHost, file: FileEntry): Extractor | undefined {
  for (const extractor of host.extractors.values()) {
    if (extractor.extensions.includes(file.ext)) return extractor;
  }
  return undefined;
}
