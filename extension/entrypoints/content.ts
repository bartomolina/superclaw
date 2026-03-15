import ReactDOM from "react-dom/client";
import { createElement } from "react";
import { Toolbar } from "@/components/Toolbar";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  cssInjectionMode: "ui",

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "kanban-tagger",
      position: "overlay",
      zIndex: 2147483647,
      onMount(container) {
        const root = document.createElement("div");
        root.id = "kanban-tagger-root";
        container.appendChild(root);
        const reactRoot = ReactDOM.createRoot(root);
        reactRoot.render(createElement(Toolbar));
        return reactRoot;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
