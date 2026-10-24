// Small helpers for checking who is logged in.
// These make the pages friendlier (redirects), but the REAL protection
// of your data is Row Level Security in the database.
import { supabase } from "./supabaseClient.js";

// Returns the current session, or null if nobody is logged in.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Could not read session:", error.message);
    return null;
  }
  return data.session;
}

// Use on protected pages. Sends logged-out visitors to the login page.
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.replace("login.html");
    return null;
  }
  return session;
}

// Use on login/signup pages. Sends already-logged-in users to the dashboard.
export async function redirectIfSignedIn() {
  const session = await getSession();
  if (session) {
    window.location.replace("expenses.html");
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Sign out problem:", error.message);
  }
  window.location.replace("index.html");
}
