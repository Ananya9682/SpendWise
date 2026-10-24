import { supabase } from "./supabaseClient.js";
import { redirectIfSignedIn } from "./auth.js";

const form = document.getElementById("login-form");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submit-btn");

function showMessage(text, type) {
  message.textContent = text;
  message.className = "message " + (type === "error" ? "is-error" : "is-success");
}

// If you are already logged in, skip straight to the dashboard.
redirectIfSignedIn();

form.addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the browser from reloading the page
  message.textContent = "";
  message.className = "message";

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in…";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage(error.message, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Log in";
    return;
  }

  window.location.replace("expenses.html");
});
