export interface ElementMeta {
  tag: string;
  id: string;
  classes: string[];
  text: string;
  selector: string;
  component: string | null;
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
}

export function identifyElement(el: HTMLElement): ElementMeta {
  const rect = el.getBoundingClientRect();
  const computed = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || "",
    classes: [...el.classList],
    text: (el.textContent || "").trim().slice(0, 200),
    selector: buildCssSelector(el),
    component: getReactComponentName(el),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    styles: {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      padding: computed.padding,
      margin: computed.margin,
    },
  };
}

export function buildCssSelector(el: HTMLElement): string {
  if (el.id) return "#" + el.id;
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    let seg = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift("#" + current.id);
      break;
    }
    if (current.className && typeof current.className === "string") {
      const cls = current.className
        .trim()
        .split(/\s+/)
        .filter((c) => !c.match(/^(js-|_|css-)/))
        .slice(0, 2);
      if (cls.length) seg += "." + cls.join(".");
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter(
        (c) => c.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const idx = [...parent.children].indexOf(current) + 1;
        seg += `:nth-child(${idx})`;
      }
    }
    parts.unshift(seg);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

export function getReactComponentName(el: HTMLElement): string | null {
  const key = Object.keys(el).find(
    (k) =>
      k.startsWith("__reactFiber$") ||
      k.startsWith("__reactInternalInstance$"),
  );
  if (!key) return null;
  let fiber = (el as Record<string, unknown>)[key] as Record<string, unknown> | null;
  while (fiber) {
    if (fiber.type && typeof fiber.type === "function") {
      const fn = fiber.type as { displayName?: string; name?: string };
      return fn.displayName || fn.name || null;
    }
    fiber = fiber.return as Record<string, unknown> | null;
  }
  return null;
}

export function buildHoverLabel(el: HTMLElement): string {
  let label = el.tagName.toLowerCase();
  const classes = [...el.classList].slice(0, 2);
  if (classes.length) label += "." + classes.join(".");
  return label;
}

export function annotationsToMarkdown(
  annotations: Array<{
    meta: ElementMeta;
    note: string;
    boardId: string;
    columnId: string;
    agentId: string;
  }>,
): string {
  const lines: string[] = [];
  lines.push(`# Annotations — ${window.location.href}`);
  lines.push(`> ${document.title}`);
  lines.push("");
  annotations.forEach((a, i) => {
    lines.push(`## ${i + 1}. ${a.meta.selector}`);
    if (a.meta.component) lines.push(`React: \`${a.meta.component}\``);
    lines.push(`Tag: \`${a.meta.tag}\``);
    if (a.meta.text) lines.push(`Text: "${a.meta.text.slice(0, 80)}"`);
    if (a.note) lines.push(`Note: ${a.note}`);
    lines.push("");
  });
  return lines.join("\n");
}
