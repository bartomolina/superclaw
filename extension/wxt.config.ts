import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "SuperClaw - Tagger",
    description:
      "Annotate UI elements and push them as cards to your Kanban board",
    version: "0.1.0",
    permissions: ["storage", "activeTab", "contextMenus"],
    action: {
      default_icon: {
        "16": "icon/16.png",
        "48": "icon/48.png",
        "128": "icon/128.png",
      },
    },
    icons: {
      "16": "icon/16.png",
      "48": "icon/48.png",
      "128": "icon/128.png",
    },
  },
});
