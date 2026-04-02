import type { ElementMeta } from "./element-identification";

export type AnnotationSubmissionInput = {
  pageUrl: string;
  pageTitle: string;
  boardId: string;
  columnId: string;
  agentId: string;
  meta: ElementMeta;
  note: string;
};

export function buildAnnotationSubmissionPayload({
  pageUrl,
  pageTitle,
  boardId,
  columnId,
  agentId,
  meta,
  note,
}: AnnotationSubmissionInput) {
  return {
    url: pageUrl,
    title: pageTitle,
    boardId,
    columnId,
    agentId,
    annotations: [
      {
        selector: meta.selector,
        component: meta.component,
        text: meta.text,
        tag: meta.tag,
        classes: meta.classes.join(" "),
        rect: meta.rect,
        styles: meta.styles,
        note,
        priority: null,
      },
    ],
  };
}
