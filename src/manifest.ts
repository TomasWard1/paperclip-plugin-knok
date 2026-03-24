import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-plugin-knok",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Knok Notifications",
  description: "Push desktop notifications via Knok when inbox events occur",
  author: "Tomas Ward",
  categories: ["automation"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "health-widget",
        displayName: "Knok Notifications Health",
        exportName: "DashboardWidget"
      }
    ]
  }
};

export default manifest;
