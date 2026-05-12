export type ColorTheme = "dark" | "light";

export const THEME_KEY = "p5js-studio-theme";

export function readStoredTheme(): ColorTheme {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function isLightTheme(theme: ColorTheme) {
  return theme === "light";
}
