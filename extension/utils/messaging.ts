export type MessageType =
  | "TOGGLE"
  | "SUBMIT_ANNOTATIONS"
  | "UPDATE_BADGE"
  | "FETCH_BOARDS"
  | "FETCH_COLUMNS"
  | "FETCH_AGENTS"
  | "OPEN_SETTINGS";

export interface ToggleMessage {
  type: "TOGGLE";
}

export interface SubmitAnnotationsMessage {
  type: "SUBMIT_ANNOTATIONS";
  payload: {
    annotations: unknown[];
    url?: string;
    boardId?: string;
    [key: string]: unknown;
  };
}

export interface UpdateBadgeMessage {
  type: "UPDATE_BADGE";
  count: number;
}

export interface FetchBoardsMessage {
  type: "FETCH_BOARDS";
}

export interface FetchColumnsMessage {
  type: "FETCH_COLUMNS";
  boardId: string;
}

export interface FetchAgentsMessage {
  type: "FETCH_AGENTS";
}

export interface OpenSettingsMessage {
  type: "OPEN_SETTINGS";
}

export type ExtensionMessage =
  | ToggleMessage
  | SubmitAnnotationsMessage
  | UpdateBadgeMessage
  | FetchBoardsMessage
  | FetchColumnsMessage
  | FetchAgentsMessage
  | OpenSettingsMessage;
