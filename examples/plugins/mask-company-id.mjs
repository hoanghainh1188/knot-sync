/**
 * Example KnotSync plugin: registers a PII rule that finds company-id-like spans.
 * Plugins run in-process with full trust — only load modules you trust.
 *
 * Config:
 *   plugins:
 *     - ./plugins/mask-company-id.mjs
 *   mask-company-id:
 *     pattern: "ACME-.*"
 */
const plugin = {
  name: "mask-company-id",
  version: "0.0.1",
  apiVersion: 1,
  register(api) {
    const settings = api.getPluginSettings();
    const pattern =
      settings && typeof settings === "object" && typeof settings.pattern === "string"
        ? settings.pattern
        : "ACME-\\d+";
    let re;
    try {
      re = new RegExp(pattern, "g");
    } catch {
      re = /ACME-\d+/g;
    }
    api.registerPiiRule({
      id: "mask-company-id",
      find(text) {
        const hits = [];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          hits.push({ start: m.index, end: m.index + m[0].length });
          if (m[0].length === 0) re.lastIndex += 1;
        }
        return hits;
      },
    });
  },
};

export default plugin;
