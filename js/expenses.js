import { supabase } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { CURRENCY_CODE } from "./config.js";

// ---------- Settings and page elements ----------

const CATEGORIES = [
  "Food",
  "Transport",
  "Education",
  "Rent and bills",
  "Shopping",
  "Health",
  "Entertainment",
  "Other",
];

const $ = (id) => document.getElementById(id);

const els = {
  loading: $("loading"),
  app: $("app"),
  userEmail: $("user-email"),
  logoutBtn: $("logout-btn"),
  monthTotal: $("month-total"),
  monthCount: $("month-count"),
  formTitle: $("form-title"),
  form: $("expense-form"),
  title: $("title"),
  amount: $("amount"),
  date: $("expense_date"),
  category: $("category"),
  notes: $("notes"),
  saveBtn: $("save-btn"),
  cancelBtn: $("cancel-btn"),
  formMessage: $("form-message"),
  listMessage: $("list-message"),
  emptyState: $("empty-state"),
  list: $("expense-list"),
};

// "state" is the data the page remembers while it is open.
let session = null;
let expenses = [];
let editingId = null; // null = adding a new expense, otherwise the id being edited

// ---------- Small helper functions ----------

function makeMoneyFormatter() {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY_CODE });
  } catch (err) {
    // An unknown currency code in config.js: fall back to plain numbers.
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
const money = makeMoneyFormatter();

// Today's date as YYYY-MM-DD in the user's own time zone.
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// Turns "2026-10-22" into a readable date without time-zone surprises.
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function showMessage(element, text, type) {
  element.textContent = text;
  element.className = "message" + (text ? (type === "error" ? " is-error" : " is-success") : "");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------- Talking to Supabase ----------

// READ: fetch this user's expenses, newest first.
// RLS already limits the rows to the logged-in user; .eq("user_id", ...)
// just makes that intention visible in the code.
async function loadExpenses() {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, title, amount, category, expense_date, notes, created_at")
    .eq("user_id", session.user.id)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    showMessage(els.listMessage, "Couldn’t load your expenses: " + error.message, "error");
    return;
  }
  showMessage(els.listMessage, "", "success");
  expenses = data;
  render();
}

// CREATE or UPDATE, depending on whether we are editing.
async function saveExpense(event) {
  event.preventDefault();
  showMessage(els.formMessage, "", "success");

  const title = els.title.value.trim();
  const amount = Number(els.amount.value);

  if (!title) {
    showMessage(els.formMessage, "Enter what you bought.", "error");
    els.title.focus();
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage(els.formMessage, "Enter an amount greater than zero.", "error");
    els.amount.focus();
    return;
  }

  const fields = {
    title,
    amount,
    category: els.category.value,
    expense_date: els.date.value,
    notes: els.notes.value.trim() || null,
  };

  els.saveBtn.disabled = true;
  let result;

  if (editingId) {
    // UPDATE: change only this expense. We never change user_id.
    // .select() makes Supabase return the changed row, so we can tell
    // whether anything was really updated.
    result = await supabase
      .from("expenses")
      .update(fields)
      .eq("id", editingId)
      .eq("user_id", session.user.id)
      .select();
  } else {
    // INSERT: attach the logged-in user's id. The INSERT policy only allows
    // rows where user_id equals the user making the request.
    result = await supabase
      .from("expenses")
      .insert({ ...fields, user_id: session.user.id })
      .select();
  }

  els.saveBtn.disabled = false;

  if (result.error) {
    showMessage(els.formMessage, "Couldn’t save: " + result.error.message, "error");
    return;
  }
  if (!result.data || result.data.length === 0) {
    showMessage(els.formMessage, "Couldn’t save: that expense wasn’t found.", "error");
    return;
  }

  const wasEditing = Boolean(editingId);
  resetForm();
  showMessage(els.formMessage, wasEditing ? "Changes saved." : "Expense added.", "success");
  await loadExpenses();
}

// DELETE: remove one expense after the user confirms.
async function deleteExpense(expense) {
  const ok = window.confirm(`Delete “${expense.title}”? This can’t be undone.`);
  if (!ok) return;

  const { data, error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expense.id)
    .eq("user_id", session.user.id)
    .select();

  if (error) {
    showMessage(els.listMessage, "Couldn’t delete: " + error.message, "error");
    return;
  }
  if (!data || data.length === 0) {
    showMessage(els.listMessage, "Couldn’t delete: that expense wasn’t found.", "error");
    return;
  }

  if (editingId === expense.id) resetForm();
  showMessage(els.listMessage, "Expense deleted.", "success");
  await loadExpenses();
}

// ---------- Form behaviour ----------

function resetForm() {
  editingId = null;
  els.form.reset();
  els.date.value = todayString();
  els.category.value = CATEGORIES[0];
  els.formTitle.textContent = "Add an expense";
  els.saveBtn.textContent = "Add expense";
  els.cancelBtn.hidden = true;
  showMessage(els.formMessage, "", "success");
}

function startEdit(expense) {
  editingId = expense.id;
  els.title.value = expense.title;
  els.amount.value = expense.amount;
  els.date.value = expense.expense_date;
  els.category.value = CATEGORIES.includes(expense.category) ? expense.category : "Other";
  els.notes.value = expense.notes || "";
  els.formTitle.textContent = "Edit expense";
  els.saveBtn.textContent = "Save changes";
  els.cancelBtn.hidden = false;
  showMessage(els.formMessage, "", "success");

  els.form.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
  els.title.focus();
}

// ---------- Drawing the page ----------

function render() {
  // This month's total (expense_date starts with "YYYY-MM").
  const monthPrefix = todayString().slice(0, 7);
  const thisMonth = expenses.filter((e) => e.expense_date.startsWith(monthPrefix));
  const total = thisMonth.reduce((sum, e) => sum + Number(e.amount), 0);
  els.monthTotal.textContent = money.format(total);
  els.monthCount.textContent =
    thisMonth.length === 1 ? "1 expense so far" : `${thisMonth.length} expenses so far`;

  // The list. We build elements with textContent (not innerHTML), so
  // anything a user types is shown as plain text and can never run as code.
  els.list.replaceChildren();
  els.emptyState.hidden = expenses.length > 0;

  for (const expense of expenses) {
    const item = document.createElement("li");
    item.className = "expense";

    const title = document.createElement("h3");
    title.className = "expense-title";
    title.textContent = expense.title;

    const amount = document.createElement("p");
    amount.className = "expense-amount";
    amount.textContent = money.format(Number(expense.amount));

    const meta = document.createElement("p");
    meta.className = "expense-meta";
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = expense.category || "Other";
    const date = document.createElement("span");
    date.textContent = formatDate(expense.expense_date);
    meta.append(chip, date);

    item.append(title, amount, meta);

    if (expense.notes) {
      const notes = document.createElement("p");
      notes.className = "expense-notes";
      notes.textContent = expense.notes;
      item.append(notes);
    }

    const actions = document.createElement("div");
    actions.className = "expense-actions";
    
    const viewLink = document.createElement("a");
    viewLink.className = "btn btn-secondary btn-small";
    viewLink.href = "expense-details.html?id=" + encodeURIComponent(expense.id);
    viewLink.textContent = "View details";
    viewLink.setAttribute("aria-label", `View details for ${expense.title}`);


    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-small";
    editBtn.textContent = "Edit";
    editBtn.setAttribute("aria-label", `Edit ${expense.title}`);
    editBtn.addEventListener("click", () => startEdit(expense));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete ${expense.title}`);
    deleteBtn.addEventListener("click", () => deleteExpense(expense));

    actions.append(viewLink, editBtn, deleteBtn);
    item.append(actions);
    els.list.append(item);
  }
}

// ---------- Start-up ----------

async function init() {
  // 1. Only logged-in users may stay on this page.
  session = await requireSession();
  if (!session) return;

  els.userEmail.textContent = session.user.email;

  // 2. Fill in the category menu and today's date.
  for (const name of CATEGORIES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    els.category.append(option);
  }
  els.date.value = todayString();

  // 3. Wire up the buttons.
  els.form.addEventListener("submit", saveExpense);
  els.cancelBtn.addEventListener("click", resetForm);
  els.logoutBtn.addEventListener("click", signOut);

  // 4. If the session ends (for example, logout in another tab), leave the page.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") window.location.replace("login.html");
  });

  // 5. Load data, then show the page.
  await loadExpenses();
  els.loading.hidden = true;
  els.app.hidden = false;
}

init();
