export interface ThemeColors {
  bg: string;
  bgAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
  textDimmer: string;
}

const dark: ThemeColors = {
  bg: "#18181b",
  bgAlt: "#09090b",
  border: "#27272a",
  text: "#e4e4e7",
  textMuted: "#a1a1aa",
  textDim: "#71717a",
  textDimmer: "#52525b",
};

const light: ThemeColors = {
  bg: "#ffffff",
  bgAlt: "#f4f4f5",
  border: "#e4e4e7",
  text: "#18181b",
  textMuted: "#52525b",
  textDim: "#71717a",
  textDimmer: "#a1a1aa",
};

export function getThemeColors(isDark: boolean): ThemeColors {
  return isDark ? dark : light;
}

export function resolveIsDark(
  themeSetting: "light" | "dark" | "system",
): boolean {
  if (themeSetting === "dark") return true;
  if (themeSetting === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
