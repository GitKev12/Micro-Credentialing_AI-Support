const THEME_STORAGE_KEY = "capstoneTheme";

export const THEMES = { LIGHT: "light", DARK: "dark" };

export function getStoredTheme() {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === THEMES.DARK
    ? THEMES.DARK
    : THEMES.LIGHT;
}

export function applyTheme(theme) {
  const next = theme === THEMES.DARK ? THEMES.DARK : THEMES.LIGHT;
  document.documentElement.setAttribute("data-theme", next);
  window.localStorage.setItem(THEME_STORAGE_KEY, next);
  return next;
}

export function applyStoredTheme() {
  return applyTheme(getStoredTheme());
}

export function toggleTheme() {
  return applyTheme(getStoredTheme() === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
}
