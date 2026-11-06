import { createCleanerJaViPlugin } from "@hoanghainh/knot-sync-cleaner-ja-vi";
import fsPlugin from "@hoanghainh/knot-sync-connector-fs";
import officePlugin from "@hoanghainh/knot-sync-extractor-office";
import { createGuardPlugin } from "@hoanghainh/knot-sync-guard";
import { createPiiBasicPlugin } from "@hoanghainh/knot-sync-pii-basic";
import {
  loadPlugins,
  type Extractor,
  type FileEntry,
  type PluginHost,
  type StructuralConfig,
} from "@hoanghainh/knot-sync-core";

export async function loadAppPlugins(structural: StructuralConfig): Promise<PluginHost> {
  return loadPlugins({
    builtins: [
      fsPlugin,
      officePlugin,
      createCleanerJaViPlugin(structural.cleaning),
      createPiiBasicPlugin(structural.pii),
      createGuardPlugin(structural.guard),
    ],
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
