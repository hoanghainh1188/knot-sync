/**
 * Example KnotSync plugin: registers a stub PII rule id.
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
    // Stub rule for the plugin system demo. Real masking lands in add-pii-masking.
    api.registerPiiRule({
      id: "mask-company-id",
      settings: settings ?? {},
    });
  },
};

export default plugin;
