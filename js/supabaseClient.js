// Creates ONE Supabase client that every page shares.
//
// We load the official supabase-js library from a CDN (a public file host),
// so there is nothing to install. The version is pinned so it never changes
// underneath you.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const stillPlaceholders =
  SUPABASE_URL.startsWith("PASTE_") || SUPABASE_PUBLISHABLE_KEY.startsWith("PASTE_");

if (stillPlaceholders) {
  // Show a visible message instead of failing silently.
  const banner = document.createElement("div");
  banner.className = "config-banner";
  banner.setAttribute("role", "alert");
  banner.textContent =
    "SpendWise is not connected yet. Open js/config.js and paste your Supabase Project URL and publishable key.";
  document.body.prepend(banner);
  throw new Error("Supabase config is missing: edit js/config.js");
}

// The client keeps the user's login session in the browser and sends it
// with every request, which is how RLS knows who is asking.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
