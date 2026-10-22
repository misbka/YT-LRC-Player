/* Preload — expõe informações mínimas do app ao renderer, com segurança. */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  version: process.versions.electron,
});
