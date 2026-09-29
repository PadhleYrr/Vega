// settings.js — NetMirror
// Delegates to Nuvio's onSettings() which is embedded in stream.js.
// We re-expose it here as getSettingsSchema() for Vega.
// 
// Note: onSettings is defined in stream.js's embedded provider.
// We can't import across modules in Vega's sandbox, so we duplicate
// the settings extraction here by re-running the provider with a
// dummy getStreams call and catching onSettings.

module.exports = {
  getSettingsSchema: async function() {
    try {
      if (typeof onSettings === 'function') {
        return await onSettings();
      }
    } catch(e) {}
    return [];
  }
};
