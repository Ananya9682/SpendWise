// Applies the user's saved SpendWise theme on pages other than the dashboard.
//
// It follows exactly the same rules the dashboard uses in expenses.js:
//   - the same six valid theme names
//   - the same Supabase table and column (user_preferences.theme)
//   - the same browser fallback key ("spendwise-theme")
//   - the same data-theme attributes, so the existing theme CSS does the styling
// It only READS the saved theme. Saving a theme is still done in Settings.
import { supabase } from "./supabaseClient.js";

const THEME_STORAGE_KEY = "spendwise-theme";

const VALID_THEMES = [
  "default",
  "youthful",
  "classic",
  "calm",
  "high_contrast",
  "midnight_navy"
];

function isValidTheme(theme) {
  return VALID_THEMES.includes(theme);
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    return isValidTheme(stored) ? stored : null;
  } catch (error) {
    return null;
  }
}

function setThemeAttributes(theme) {
  document.documentElement.dataset.theme = theme;

  if (document.body) {
    document.body.dataset.theme = theme;
  }
}

// Quick first step: use the theme this browser remembers, so the page does not
// show the wrong colours while the saved theme is being loaded.
export function applyStoredTheme() {
  setThemeAttributes(readStoredTheme() || "default");
}

// Main step: look up the theme saved in the user's account, apply it, and keep
// the browser copy in step (the dashboard does the same). If the lookup fails,
// the browser copy is used, and then the default theme.
export async function loadSavedTheme(userId) {
  let theme = null;

  if (userId) {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("user_id, theme")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (isValidTheme(data?.theme)) {
        theme = data.theme;
      }
    } catch (error) {
      console.error("Could not load the saved theme:", error);
    }
  }

  const selectedTheme = theme || readStoredTheme() || "default";

  setThemeAttributes(selectedTheme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
  } catch (error) {
    // The page works without local storage.
  }

  return selectedTheme;
}
