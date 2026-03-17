import { storage } from "wxt/utils/storage";

export const kanbanBaseUrl = storage.defineItem<string>("local:kanbanBaseUrl", {
  fallback: "http://localhost:3000",
});

export const extensionCredential = storage.defineItem<string>("local:extensionCredential", {
  fallback: "",
});

export const apiUrl = kanbanBaseUrl;
export const apiToken = extensionCredential;

export const selectedBoard = storage.defineItem<string>(
  "local:selectedBoard",
  { fallback: "" },
);

export const theme = storage.defineItem<"light" | "dark" | "system">(
  "local:theme",
  { fallback: "system" },
);
