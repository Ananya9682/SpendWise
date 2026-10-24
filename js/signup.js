import { supabase } from "./supabaseClient.js";
import { redirectIfSignedIn } from "./auth.js";

const form = document.getElementById("signup-form");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submit-btn");

function showMessage(text, type) {
  message.textContent = text;
  message.className = "message " + (type === "error" ? "is-error" : "is-success");
}

redirectIfSignedIn();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.className = "message";

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const confirm = form.elements.confirm.value;

  // Check the easy mistakes ourselves before asking Supabase.
  if (password.length < 8) {
    showMessage("Your password needs at least 8 characters.", "error");
    return;
  }
  if (password !== confirm) {
    showMessage("The two passwords don’t match. Type them again.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account…";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Where the link in the confirmation email sends the user.
      emailRedirectTo: new URL("login.html", window.location.href).href,
    },
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Sign up";

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  // When email confirmation is ON, Supabase hides whether an email is already
  // registered by returning a user with no identities and no session.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    showMessage("This email may already have an account. Try logging in instead.", "error");
    return;
  }

  if (data.session) {
    // Email confirmation is OFF: the user is already logged in.
    window.location.replace("expenses.html");
    return;
  }

  // Email confirmation is ON: the user must click the link we emailed.
  form.reset();
  showMessage(
    "Account created. Check your email and click the confirmation link, then log in.",
    "success"
  );
});
