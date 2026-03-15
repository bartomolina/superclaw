import { storage } from "wxt/utils/storage";

export const apiUrl = storage.defineItem<string>("local:apiUrl", {
  fallback: "http://localhost:4101",
});

export const apiToken = storage.defineItem<string>("local:apiToken", {
  fallback: "",
});

export const selectedBoard = storage.defineItem<string>(
  "local:selectedBoard",
  { fallback: "" },
);

export const theme = storage.defineItem<"light" | "dark" | "system">(
  "local:theme",
  { fallback: "system" },
);
