
import { supabase } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { CURRENCY_CODE } from "./config.js";

const $ = (id) => document.getElementById(id);

const els = {
  userEmail: $("user-email"),
  logoutBtn: $("logout-btn"),
  loading: $("loading"),
  problem: $("problem"),
  details: $("details"),
  title: $("detail-title"),
  amount: $("detail-amount"),
  category: $("detail-category"),
  date: $("detail-date"),
  notes: $("detail-notes"),
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: CURRENCY_CODE,
});

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);

  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function showProblem(message) {
  els.loading.hidden = true;
  els.details.hidden = true;
  els.problem.textContent = message;
  els.problem.hidden = false;
}

function showExpense(expense) {
  els.title.textContent = expense.title;
  els.amount.textContent = money.format(Number(expense.amount));
  els.category.textContent = expense.category || "Other";
  els.date.textContent = formatDate(expense.expense_date);

  const notes = (expense.notes || "").trim();

  if (notes) {
    els.notes.textContent = notes;
    els.notes.classList.remove("is-empty");
  } else {
    els.notes.textContent = "No notes were added for this expense.";
    els.notes.classList.add("is-empty");
  }

  document.title = `${expense.title} – SpendWise`;

  els.loading.hidden = true;
  els.problem.hidden = true;
  els.details.hidden = false;
}

async function init() {
  const session = await requireSession();
  if (!session) return;

  els.userEmail.textContent = session.user.email;
  els.logoutBtn.addEventListener("click", signOut);

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      window.location.replace("login.html");
    }
  });

  const id = new URLSearchParams(window.location.search).get("id");

  if (!id || !UUID_PATTERN.test(id)) {
    showProblem(
      'This link doesn’t point to an expense. Go back to your list and choose "View details" again.'
    );
    return;
  }

  const { data, error } = await supabase
    .from("expenses")
    .select("id, title, amount, category, expense_date, notes")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    showProblem("Couldn’t load this expense. Please try again.");
    console.error("Expense details error:", error);
    return;
  }

  if (!data) {
    showProblem(
      "Expense not found. It may have been deleted, or it isn’t in your account."
    );
    return;
  }

  showExpense(data);
}

init();
