import { supabase } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { CURRENCY_CODE } from "./config.js";

const CATEGORIES = [
  "Food",
  "Transport",
  "Education",
  "Rent and bills",
  "Shopping",
  "Health",
  "Entertainment",
  "Other"
];

const VALID_THEMES = [
  "default",
  "youthful",
  "classic",
  "calm",
  "high_contrast",
  "midnight_navy"
];

// How many expenses the list shows before the "View all" button is used.
const COLLAPSED_EXPENSE_COUNT = 5;

const els = {
  loading: document.getElementById("loading"),
  app: document.getElementById("app"),
  userEmail: document.getElementById("user-email"),
  logoutBtn: document.getElementById("logout-btn"),

  monthTotal: document.getElementById("month-total"),
  monthCount: document.getElementById("month-count"),

  budgetMonthLabel: document.getElementById("budget-month-label"),
  budgetAmount: document.getElementById("budget-amount"),
  budgetForm: document.getElementById("budget-form"),
  budgetMessage: document.getElementById("budget-message"),
  budgetProgressArea: document.getElementById("budget-progress-area"),
  budgetSpent: document.getElementById("budget-spent"),
  budgetRemaining: document.getElementById("budget-remaining"),
  budgetProgressTrack: document.getElementById("budget-progress-track"),
  budgetProgressBar: document.getElementById("budget-progress-bar"),
  budgetPercent: document.getElementById("budget-percent"),
  budgetAlert: document.getElementById("budget-alert"),

  form: document.getElementById("expense-form"),
  formTitle: document.getElementById("form-title"),
  title: document.getElementById("title"),
  amount: document.getElementById("amount"),
  category: document.getElementById("category"),
  date: document.getElementById("expense_date"),
  notes: document.getElementById("notes"),
  saveBtn: document.getElementById("save-btn"),
  cancelBtn: document.getElementById("cancel-btn"),
  formMessage: document.getElementById("form-message"),

  list: document.getElementById("expense-list"),
  listMessage: document.getElementById("list-message"),
  emptyState: document.getElementById("empty-state"),
  toggleExpensesRow: document.getElementById("expenses-toggle-row"),
  toggleExpensesBtn: document.getElementById("toggle-expenses-btn"),
  toggleExpensesIcon: document.getElementById("toggle-expenses-icon"),
  toggleExpensesLabel: document.getElementById("toggle-expenses-label"),

  search: document.getElementById("search-expenses"),
  filterCategory: document.getElementById("filter-category"),
  filterFrom: document.getElementById("filter-from"),
  filterTo: document.getElementById("filter-to"),
  clearFiltersBtn: document.getElementById("clear-filters"),
  exportBtn: document.getElementById("export-expenses"),
  filterCount: document.getElementById("filter-count"),
  filterError: document.getElementById("filter-error"),

  chartContainer: document.getElementById("chart-container"),
  chart: document.getElementById("category-chart"),
  chartEmpty: document.getElementById("chart-empty"),
  chartError: document.getElementById("chart-error"),
  categorySummary: document.getElementById("category-summary"),

  insightTopCategory: document.getElementById("insight-top-category"),
  insightTopCategoryDetail: document.getElementById("insight-top-category-detail"),
  insightMonthChange: document.getElementById("insight-month-change"),
  insightMonthChangeDetail: document.getElementById("insight-month-change-detail"),
  insightMessage: document.getElementById("insight-message"),

  preferencesToggle: document.getElementById("preferences-toggle"),
  preferencesCard: document.getElementById("preferences-card"),
  preferencesForm: document.getElementById("preferences-form"),
  themeChoice: document.getElementById("theme-choice"),
  preferencesMessage: document.getElementById("preferences-message"),
  closePreferencesBtn: document.getElementById("close-preferences-btn"),
  themeButtons: document.querySelectorAll("[data-theme-choice]"),
  quickThemeMessage: document.getElementById("quick-theme-message")
};

let session = null;
let expenses = [];
let currentBudget = null;
let editingId = null;
let categoryChart = null;
let searchDebounceId = null;
let savedPreferences = null;
let preferencesLoaded = false;
let showAllExpenses = false; // display only: false = newest five, true = every match

/* =========================================================
   GENERAL HELPERS
========================================================= */

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: CURRENCY_CODE || "INR",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function todayString() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

function currentMonthStart() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    "01"
  ].join("-");
}

function getMonthPrefix(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0")
  ].join("-");
}

function formatMonthLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric"
  }).format(new Date());
}

function formatDate(dateString) {
  if (!dateString) return "No date";

  const parts = dateString.split("-");

  if (parts.length !== 3) return dateString;

  const date = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function showMessage(element, message, type = "info") {
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`;
}

function clearMessage(element) {
  if (!element) return;

  element.textContent = "";
  element.className = "message";
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function safelySetText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function isValidTheme(theme) {
  return VALID_THEMES.includes(theme);
}

/* =========================================================
   THEMES AND USER PREFERENCES
========================================================= */

function applyTheme(theme) {
  const selectedTheme = isValidTheme(theme) ? theme : "default";

  document.documentElement.dataset.theme = selectedTheme;
  document.body.dataset.theme = selectedTheme;

  try {
    localStorage.setItem("spendwise-theme", selectedTheme);
  } catch (error) {
    // The app can work without local storage.
  }

  // Keep both theme selectors synchronized.
  els.themeButtons.forEach((button) => {
    const isSelected = button.dataset.themeChoice === selectedTheme;

    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (els.themeChoice) {
    els.themeChoice.value = selectedTheme;
  }
}

function showPreferences(open = true) {
  if (!els.preferencesCard) return;

  els.preferencesCard.hidden = !open;

  els.preferencesToggle?.setAttribute(
    "aria-expanded",
    String(open)
  );

  if (open) {
    els.preferencesCard.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest"
    });
  }
}

async function loadPreferences() {
  if (!session?.user?.id) return;

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("user_id, theme")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) throw error;

    savedPreferences = data || null;

    let theme = isValidTheme(data?.theme)
      ? data.theme
      : null;

    if (!theme) {
      try {
        const localTheme = localStorage.getItem("spendwise-theme");

        theme = isValidTheme(localTheme)
          ? localTheme
          : "default";
      } catch (storageError) {
        theme = "default";
      }
    }

    applyTheme(theme);
    showPreferences(false);
    preferencesLoaded = true;
  } catch (error) {
    console.error("Could not load preferences:", error);

    let localTheme = "default";

    try {
      const storedTheme = localStorage.getItem("spendwise-theme");

      if (isValidTheme(storedTheme)) {
        localTheme = storedTheme;
      }
    } catch (storageError) {
      // Use the default theme.
    }

    applyTheme(localTheme);
    showPreferences(false);
    preferencesLoaded = true;
  }
}

async function savePreferences(theme) {
  if (!session?.user?.id) {
    const message = "Please log in again to save your theme.";

    showMessage(els.preferencesMessage, message, "error");
    showMessage(els.quickThemeMessage, message, "error");

    return false;
  }

  if (!isValidTheme(theme)) return false;

  const record = {
    user_id: session.user.id,
    theme,
    onboarding_completed: true,
    updated_at: new Date().toISOString()
  };

  els.themeButtons.forEach((button) => {
    button.disabled = true;
  });

  try {
    const { error } = await supabase
      .from("user_preferences")
      .upsert(record, {
        onConflict: "user_id"
      });

    if (error) throw error;

    savedPreferences = record;
    preferencesLoaded = true;

    applyTheme(theme);

    showMessage(
      els.preferencesMessage,
      "Your theme has been saved.",
      "success"
    );

    showMessage(
      els.quickThemeMessage,
      "Theme saved successfully!",
      "success"
    );

    return true;
  } catch (error) {
    console.error("Could not save theme:", error);

    showMessage(
      els.preferencesMessage,
      "We couldn't save your theme. Please try again.",
      "error"
    );

    showMessage(
      els.quickThemeMessage,
      "We couldn't save your theme. Please try again.",
      "error"
    );

    return false;
  } finally {
    els.themeButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function setupPreferences() {
  els.preferencesToggle?.addEventListener("click", async () => {
    const currentlyOpen =
      els.preferencesCard && !els.preferencesCard.hidden;

    if (!preferencesLoaded) {
      await loadPreferences();
    }

    showPreferences(!currentlyOpen);
    clearMessage(els.preferencesMessage);
  });

  els.preferencesForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const theme = els.themeChoice?.value || "default";

    showMessage(
      els.preferencesMessage,
      "Saving your theme...",
      "info"
    );

    const saved = await savePreferences(theme);

    if (saved) {
      showPreferences(false);
    }
  });

  els.closePreferencesBtn?.addEventListener("click", () => {
    showPreferences(false);
    clearMessage(els.preferencesMessage);
  });

  els.themeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const theme = button.dataset.themeChoice;

      if (!isValidTheme(theme)) return;

      // Apply the theme immediately.
      applyTheme(theme);

      showMessage(
        els.preferencesMessage,
        "Saving your theme...",
        "info"
      );

      showMessage(
        els.quickThemeMessage,
        "Saving your theme...",
        "info"
      );

      await savePreferences(theme);
    });
  });
}

/* =========================================================
   MONTHLY STATISTICS
========================================================= */

function calculateMonthlyStats() {
  const currentMonth = getMonthPrefix(new Date());

  const previousDate = new Date();
  previousDate.setDate(1);
  previousDate.setMonth(previousDate.getMonth() - 1);

  const previousMonth = getMonthPrefix(previousDate);

  let currentTotal = 0;
  let previousTotal = 0;
  let currentCount = 0;

  const categoryTotals = {};

  for (const expense of expenses) {
    const month = (expense.expense_date || "").slice(0, 7);
    const amount = Number(expense.amount) || 0;

    if (month === currentMonth) {
      currentTotal += amount;
      currentCount += 1;

      categoryTotals[expense.category] =
        (categoryTotals[expense.category] || 0) + amount;
    }

    if (month === previousMonth) {
      previousTotal += amount;
    }
  }

  return {
    currentMonth,
    previousMonth,
    currentTotal,
    previousTotal,
    currentCount,
    categoryTotals
  };
}

/* =========================================================
   CSV EXPORT
========================================================= */

function escapeCSV(value) {
  let text = String(value ?? "");

  // Protect against spreadsheet formula injection.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function exportAllExpenses() {
  if (!expenses.length) {
    showMessage(
      els.listMessage,
      "There are no expenses to export yet.",
      "info"
    );
    return;
  }

  const headers = ["Title", "Amount", "Category", "Date", "Notes"];

  const rows = expenses.map((expense) => [
    expense.title,
    expense.amount,
    expense.category,
    expense.expense_date,
    expense.notes || ""
  ]);

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(","))
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `spendwise-expenses-${todayString()}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  showMessage(
    els.listMessage,
    "Your expense CSV has been exported.",
    "success"
  );
}

/* =========================================================
   SEARCH AND FILTERING
========================================================= */

function getFilteredExpenses() {
  const searchTerm = (els.search?.value || "").trim().toLowerCase();
  const selectedCategory = els.filterCategory?.value || "";
  const fromDate = els.filterFrom?.value || "";
  const toDate = els.filterTo?.value || "";

  return expenses.filter((expense) => {
    const title = (expense.title || "").toLowerCase();
    const category = (expense.category || "").toLowerCase();
    const notes = (expense.notes || "").toLowerCase();

    const matchesSearch =
      !searchTerm ||
      title.includes(searchTerm) ||
      category.includes(searchTerm) ||
      notes.includes(searchTerm);

    const matchesCategory =
      !selectedCategory || expense.category === selectedCategory;

    const matchesFrom =
      !fromDate || expense.expense_date >= fromDate;

    const matchesTo =
      !toDate || expense.expense_date <= toDate;

    return matchesSearch && matchesCategory && matchesFrom && matchesTo;
  });
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;

  if (text !== undefined && text !== null) {
    element.textContent = text;
  }

  return element;
}

// Returns a sorted COPY (newest date first). The loaded data is never changed.
function sortNewestFirst(list) {
  return [...list].sort((a, b) => {
    const byDate = (b.expense_date || "").localeCompare(a.expense_date || "");

    if (byDate !== 0) return byDate;

    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}

// Shows the expand/collapse button only when more than five expenses match.
function updateExpensesToggle(matchCount) {
  if (!els.toggleExpensesRow || !els.toggleExpensesBtn) return;

  const needsToggle = matchCount > COLLAPSED_EXPENSE_COUNT;

  els.toggleExpensesRow.hidden = !needsToggle;

  if (!needsToggle) return;

  els.toggleExpensesBtn.setAttribute("aria-expanded", String(showAllExpenses));

  safelySetText(els.toggleExpensesIcon, showAllExpenses ? "⌃" : "⌄");

  safelySetText(
    els.toggleExpensesLabel,
    showAllExpenses ? "Show less" : `View all expenses (${matchCount})`
  );
}

function toggleExpensesList() {
  showAllExpenses = !showAllExpenses;
  renderFilteredExpenses();
}

function renderFilteredExpenses() {
  if (!els.list) return;

  const filteredExpenses = sortNewestFirst(getFilteredExpenses());

  updateExpensesToggle(filteredExpenses.length);

  els.list.replaceChildren();

  if (els.filterCount) {
    els.filterCount.textContent =
      `${filteredExpenses.length} of ${expenses.length} expenses`;
  }

  if (!filteredExpenses.length) {
    const message = expenses.length
      ? "No expenses match your search or filters."
      : "No expenses yet. Add your first expense using the form.";

    showMessage(els.listMessage, message, "info");

    if (els.emptyState) {
      els.emptyState.hidden = false;
      els.emptyState.textContent = message;
    }

    return;
  }

  clearMessage(els.listMessage);

  if (els.emptyState) {
    els.emptyState.hidden = true;
  }

  const visibleExpenses = showAllExpenses
    ? filteredExpenses
    : filteredExpenses.slice(0, COLLAPSED_EXPENSE_COUNT);

  for (const expense of visibleExpenses) {
    const item = createElement("article", "expense-item");
    const details = createElement("div", "expense-info");

    const title = createElement("h3", "expense-title", expense.title);

    const meta = createElement(
      "p",
      "expense-meta",
      `${expense.category} • ${formatDate(expense.expense_date)}`
    );

    const amount = createElement(
      "p",
      "expense-amount",
      money(expense.amount)
    );

    details.append(title, meta);

    if (expense.notes) {
      details.append(
        createElement("p", "expense-notes-preview", expense.notes)
      );
    }

    const actions = createElement("div", "expense-actions");

    const viewLink = createElement(
      "a",
      "btn btn-secondary",
      "View details"
    );

    viewLink.href =
      `expense-details.html?id=${encodeURIComponent(expense.id)}`;

    const editButton = createElement("button", "btn btn-secondary", "Edit");
    editButton.type = "button";
    editButton.disabled = !navigator.onLine;
    editButton.addEventListener("click", () => startEdit(expense.id));

    const deleteButton = createElement("button", "btn btn-danger", "Delete");
    deleteButton.type = "button";
    deleteButton.disabled = !navigator.onLine;
    deleteButton.addEventListener("click", () => deleteExpense(expense.id));

    actions.append(viewLink, editButton, deleteButton);
    item.append(details, amount, actions);
    els.list.append(item);
  }
}

function debounce(callback, delay = 250) {
  window.clearTimeout(searchDebounceId);
  searchDebounceId = window.setTimeout(callback, delay);
}

function clearFilters() {
  if (els.search) els.search.value = "";
  if (els.filterCategory) els.filterCategory.value = "";
  if (els.filterFrom) els.filterFrom.value = "";
  if (els.filterTo) els.filterTo.value = "";

  clearMessage(els.filterError);
  renderFilteredExpenses();
}

function setupFilters() {
  els.search?.addEventListener("input", () => {
    debounce(renderFilteredExpenses);
  });

  [
    els.filterCategory,
    els.filterFrom,
    els.filterTo
  ].forEach((element) => {
    element?.addEventListener("change", renderFilteredExpenses);
  });

  els.clearFiltersBtn?.addEventListener("click", clearFilters);
  els.exportBtn?.addEventListener("click", exportAllExpenses);
  els.toggleExpensesBtn?.addEventListener("click", toggleExpensesList);
}

/* =========================================================
   LOAD EXPENSES AND BUDGET
========================================================= */

// Create a separate cache for each logged-in user.
function getExpenseCacheKey(userId) {
    return `spendwise-expenses-${userId}`;
}

// Read previously saved expenses from this user's cache.
function getCachedExpenses() {
    const cacheKey = getExpenseCacheKey(session.user.id);
    const savedData = localStorage.getItem(cacheKey);

    if (savedData === null) {
        return null;
    }

    try {
        const parsedData = JSON.parse(savedData);
        return Array.isArray(parsedData) ? parsedData : null;
    } catch (error) {
        console.error("Could not read saved expenses:", error);
        return null;
    }
}

// Load expenses from Supabase or use saved data when offline.
async function loadExpenses() {

    // If offline, try to use previously saved expenses.
    if (!navigator.onLine) {
        const cachedExpenses = getCachedExpenses();

        if (cachedExpenses !== null) {
            expenses = cachedExpenses;
            console.log("Loaded saved expenses while offline.");
            return;
        }

        throw new Error("No saved expenses are available offline.");
    }

    // If online, fetch the latest expenses from Supabase.
    const { data, error } = await supabase
        .from("expenses")
        .select("id, title, amount, category, expense_date, notes, created_at")
        .eq("user_id", session.user.id)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Could not load expenses:", error);
        throw error;
    }

    expenses = data || [];

    // Save a copy for future offline viewing.
    try {
        localStorage.setItem(
            getExpenseCacheKey(session.user.id),
            JSON.stringify(expenses)
        );
    } catch (error) {
        console.error("Could not save expenses offline:", error);
    }
}

async function loadBudget() {
      // Skip the Supabase budget request when offline.
    if (!navigator.onLine) {
        currentBudget = null;

        if (els.budgetAmount) {
            els.budgetAmount.value = "";
        }

        return;
    }
  const month = currentMonthStart();

  const { data, error } = await supabase
    .from("budgets")
    .select("id, user_id, budget_month, amount")
    .eq("user_id", session.user.id)
    .eq("budget_month", month)
    .maybeSingle();

  if (error) throw error;

  currentBudget = data || null;

  if (els.budgetAmount) {
    els.budgetAmount.value = currentBudget ? currentBudget.amount : "";
  }
}

/* =========================================================
   MONTHLY BUDGET
========================================================= */

function renderBudget() {
  const stats = calculateMonthlyStats();
  const spent = stats.currentTotal;
  const budget = Number(currentBudget?.amount) || 0;

  if (!budget) {
    if (els.budgetProgressArea) {
      els.budgetProgressArea.hidden = true;
    }

    safelySetText(els.budgetSpent, money(0));
    safelySetText(els.budgetRemaining, money(0));

    safelySetText(
      els.budgetPercent,
      "Set a budget to track spending."
    );

    if (els.budgetAlert) {
      els.budgetAlert.hidden = true;
      els.budgetAlert.textContent = "";
    }

    if (els.budgetProgressBar) {
      els.budgetProgressBar.style.width = "0%";
    }

    els.budgetProgressTrack?.setAttribute("aria-valuenow", "0");

    return;
  }

  const percentage = (spent / budget) * 100;
  const displayedPercentage = Math.min(percentage, 100);
  const remaining = budget - spent;

  if (els.budgetProgressArea) {
    els.budgetProgressArea.hidden = false;
  }

  if (els.budgetProgressBar) {
    els.budgetProgressBar.style.width = `${displayedPercentage}%`;
    els.budgetProgressBar.classList.toggle(
      "is-warning",
      percentage >= 80 && percentage < 100
    );
    els.budgetProgressBar.classList.toggle(
      "is-over-budget",
      percentage >= 100
    );
  }

  els.budgetProgressTrack?.setAttribute(
    "aria-valuenow",
    String(Math.round(displayedPercentage))
  );

  safelySetText(els.budgetSpent, money(spent));

  safelySetText(
    els.budgetPercent,
    `${percentage.toFixed(1)}% of your monthly budget used`
  );

  safelySetText(
    els.budgetRemaining,
    remaining >= 0
      ? money(remaining)
      : `${money(Math.abs(remaining))} over budget`
  );

  if (els.budgetAlert) {
    if (percentage >= 100) {
      els.budgetAlert.hidden = false;
      els.budgetAlert.className = "budget-alert is-over-budget";
      els.budgetAlert.textContent =
        "You have reached or exceeded your monthly budget.";
    } else if (percentage >= 80) {
      els.budgetAlert.hidden = false;
      els.budgetAlert.className = "budget-alert is-warning";
      els.budgetAlert.textContent =
        "You've used at least 80% of your monthly budget.";
    } else {
      els.budgetAlert.hidden = true;
      els.budgetAlert.textContent = "";
      els.budgetAlert.className = "budget-alert";
    }
  }
}

async function saveBudget(event) {
  event.preventDefault();

  const amount = Number(els.budgetAmount?.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage(
      els.budgetMessage,
      "Enter a budget amount greater than zero.",
      "error"
    );
    return;
  }

  try {
    const { data, error } = await supabase
      .from("budgets")
      .upsert(
        {
          user_id: session.user.id,
          budget_month: currentMonthStart(),
          amount
        },
        {
          onConflict: "user_id,budget_month"
        }
      )
      .select()
      .single();

    if (error) throw error;

    currentBudget = data;

    showMessage(
      els.budgetMessage,
      "Your monthly budget has been saved.",
      "success"
    );

    renderBudget();
  } catch (error) {
    console.error("Could not save budget:", error);

    showMessage(
      els.budgetMessage,
      "We couldn't save your budget. Please try again.",
      "error"
    );
  }
}

/* =========================================================
   ADD, EDIT, AND DELETE EXPENSES
========================================================= */

async function saveExpense(event) {
  event.preventDefault();

  const title = (els.title?.value || "").trim();
  const amount = Number(els.amount?.value);
  const category = els.category?.value;
  const expenseDate = els.date?.value;
  const notes = (els.notes?.value || "").trim();

  if (!title) {
    showMessage(els.formMessage, "Enter an expense title.", "error");
    els.title?.focus();
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage(
      els.formMessage,
      "Enter an amount greater than zero.",
      "error"
    );
    els.amount?.focus();
    return;
  }

  if (!CATEGORIES.includes(category)) {
    showMessage(
      els.formMessage,
      "Choose a valid expense category.",
      "error"
    );
    els.category?.focus();
    return;
  }

  if (!expenseDate) {
    showMessage(
      els.formMessage,
      "Choose the date of the expense.",
      "error"
    );
    els.date?.focus();
    return;
  }

  const record = {
    title,
    amount,
    category,
    expense_date: expenseDate,
    notes,
    user_id: session.user.id
  };

  const wasEditing = editingId !== null;

  try {
    if (els.saveBtn) {
      els.saveBtn.disabled = true;
      els.saveBtn.textContent = wasEditing ? "Updating..." : "Saving...";
    }

    let error;

    if (wasEditing) {
      ({ error } = await supabase
        .from("expenses")
        .update({
          title,
          amount,
          category,
          expense_date: expenseDate,
          notes
        })
        .eq("id", editingId)
        .eq("user_id", session.user.id));
    } else {
      ({ error } = await supabase
        .from("expenses")
        .insert(record));
    }

    if (error) throw error;

    showMessage(
      els.formMessage,
      wasEditing
        ? "Expense updated successfully."
        : "Expense added successfully.",
      "success"
    );

    resetForm();
    await loadExpenses();
    render();
  } catch (error) {
    console.error("Could not save expense:", error);

    showMessage(
      els.formMessage,
      "We couldn't save this expense. Please try again.",
      "error"
    );
  } finally {
    if (els.saveBtn) {
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = editingId
        ? "Update Expense"
        : "Save Expense";
    }
  }
}

async function deleteExpense(id) {
  const expense = expenses.find(
    (item) => String(item.id) === String(id)
  );

  if (!expense) return;

  if (!window.confirm(`Delete "${expense.title}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);

    if (error) throw error;

    expenses = expenses.filter(
      (item) => String(item.id) !== String(id)
    );

    if (String(editingId) === String(id)) {
      resetForm();
    }

    showMessage(
      els.listMessage,
      "Expense deleted successfully.",
      "success"
    );

    render();
  } catch (error) {
    console.error("Could not delete expense:", error);

    showMessage(
      els.listMessage,
      "We couldn't delete this expense. Please try again.",
      "error"
    );
  }
}

function resetForm() {
  editingId = null;

  els.form?.reset();

  if (els.date) {
    els.date.value = todayString();
  }

  safelySetText(els.formTitle, "Add an expense");

  if (els.saveBtn) {
    els.saveBtn.textContent = "Save Expense";
    els.saveBtn.disabled = false;
  }

  if (els.cancelBtn) {
    els.cancelBtn.hidden = true;
  }

  clearMessage(els.formMessage);
}

function startEdit(id) {
  const expense = expenses.find(
    (item) => String(item.id) === String(id)
  );

  if (!expense) return;

  editingId = expense.id;

  if (els.title) els.title.value = expense.title;
  if (els.amount) els.amount.value = expense.amount;
  if (els.category) els.category.value = expense.category;
  if (els.date) els.date.value = expense.expense_date || todayString();
  if (els.notes) els.notes.value = expense.notes || "";

  safelySetText(els.formTitle, "Edit expense");

  if (els.saveBtn) {
    els.saveBtn.textContent = "Update Expense";
  }

  if (els.cancelBtn) {
    els.cancelBtn.hidden = false;
  }

  clearMessage(els.formMessage);

  els.form?.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start"
  });

  els.title?.focus();
}

/* =========================================================
   CATEGORY CHART
========================================================= */

function renderCategoryChart(categoryTotals) {
  const labels = Object.keys(categoryTotals);
  const values = Object.values(categoryTotals);
  const chartContext = els.chart?.getContext("2d");

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  if (els.chartError) {
    els.chartError.hidden = true;
    els.chartError.textContent = "";
  }

  if (!labels.length) {
    if (els.chartEmpty) {
      els.chartEmpty.hidden = false;
    }

    if (els.chartContainer) {
      els.chartContainer.hidden = true;
    }

    els.categorySummary?.replaceChildren();
    return;
  }

  if (!chartContext || typeof Chart === "undefined") {
    if (els.chartError) {
      els.chartError.hidden = false;
      els.chartError.textContent =
        "The chart could not be loaded. Please refresh the page.";
    }

    if (els.chartEmpty) {
      els.chartEmpty.hidden = true;
    }

    return;
  }

  if (els.chartEmpty) {
    els.chartEmpty.hidden = true;
  }

  if (els.chartContainer) {
    els.chartContainer.hidden = false;
  }

  categoryChart = new Chart(chartContext, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.label || ""}: ${money(Number(context.raw) || 0)}`;
            }
          }
        }
      }
    }
  });

  if (els.categorySummary) {
    els.categorySummary.replaceChildren();

    labels.forEach((label, index) => {
      const item = document.createElement("p");
      item.textContent = `${label}: ${money(values[index])}`;
      els.categorySummary.appendChild(item);
    });
  }
}

/* =========================================================
   SPENDING INSIGHTS
========================================================= */

function renderSpendingInsights(stats) {
  const currentTotal = stats.currentTotal;
  const previousTotal = stats.previousTotal;

  const topCategoryEntry = Object.entries(stats.categoryTotals)
    .sort((a, b) => b[1] - a[1])[0];

  safelySetText(
    els.insightTopCategory,
    topCategoryEntry ? topCategoryEntry[0] : "No spending yet"
  );

  safelySetText(
    els.insightTopCategoryDetail,
    topCategoryEntry
      ? `${money(topCategoryEntry[1])} spent this month`
      : "Add expenses to discover your top category."
  );

  if (els.insightMonthChange && els.insightMonthChangeDetail) {
    if (previousTotal === 0 && currentTotal === 0) {
      els.insightMonthChange.textContent = "No change yet";
      els.insightMonthChangeDetail.textContent =
        "No spending recorded this month or last month.";
    } else if (previousTotal === 0) {
      els.insightMonthChange.textContent = "New activity";
      els.insightMonthChangeDetail.textContent =
        `You've spent ${money(currentTotal)} this month. There was no spending recorded last month.`;
    } else {
      const difference = currentTotal - previousTotal;
      const percentage = Math.abs(difference / previousTotal) * 100;

      if (difference > 0) {
        els.insightMonthChange.textContent =
          `${percentage.toFixed(1)}% increase`;
        els.insightMonthChangeDetail.textContent =
          `${money(difference)} more than last month.`;
      } else if (difference < 0) {
        els.insightMonthChange.textContent =
          `${percentage.toFixed(1)}% decrease`;
        els.insightMonthChangeDetail.textContent =
          `${money(Math.abs(difference))} less than last month.`;
      } else {
        els.insightMonthChange.textContent = "No change";
        els.insightMonthChangeDetail.textContent =
          "Your spending matches last month's total.";
      }
    }
  }

  safelySetText(
    els.insightMessage,
    `Number of expenses this month: ${stats.currentCount}`
  );
}

/* =========================================================
   RENDER DASHBOARD
========================================================= */

function render() {
  const stats = calculateMonthlyStats();

  safelySetText(els.monthTotal, money(stats.currentTotal));
  safelySetText(els.monthCount, String(stats.currentCount));

  renderCategoryChart(stats.categoryTotals);
  renderFilteredExpenses();
  renderBudget();
  renderSpendingInsights(stats);
}

/* =========================================================
   INITIALIZE APPLICATION
========================================================= */

async function init() {
  try {
    session = await requireSession();

    if (!session) return;

    if (els.userEmail) {
    els.userEmail.value = session?.user?.email || "";
}
    safelySetText(els.budgetMonthLabel, formatMonthLabel());

    if (els.category) {
      for (const name of CATEGORIES) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        els.category.append(option);
      }
    }

    if (els.filterCategory) {
      for (const name of CATEGORIES) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        els.filterCategory.append(option);
      }
    }

    if (els.date) {
      els.date.value = todayString();
    }

    setupFilters();
    setupPreferences();

    els.form?.addEventListener("submit", saveExpense);
    els.cancelBtn?.addEventListener("click", resetForm);
    els.budgetForm?.addEventListener("submit", saveBudget);
    els.logoutBtn?.addEventListener("click", signOut);

    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        window.location.replace("login.html");
      }
    });

    await loadExpenses();
    await loadBudget();
    if (els.loading) {
      els.loading.hidden = true;
    }

    if (els.app) {
      els.app.hidden = false;
    }

    render();

    // Load the saved theme without blocking the dashboard.
    await loadPreferences();

  } catch (error) {
    console.error("SpendWise initialization error:", error);

    if (els.loading) {
      els.loading.hidden = true;
    }

    showMessage(
      els.listMessage,
      "SpendWise couldn't finish loading. Please refresh and try again.",
      "error"
    );
  }
}
function updateConnectionStatus() {
    const offlineIndicator = document.getElementById("offline-indicator");

    if (offlineIndicator) {
        offlineIndicator.hidden = navigator.onLine;
    }

    // Disable adding or editing expenses while offline.
    const expenseForm = document.getElementById("expense-form");

    if (expenseForm) {
        const formFields = expenseForm.querySelectorAll(
            "input, select, textarea, button"
        );

        formFields.forEach((field) => {
            field.disabled = !navigator.onLine;
        });
    }

    // Disable changing the monthly budget while offline.
    const budgetForm = document.getElementById("budget-form");

    if (budgetForm) {
        const budgetFields = budgetForm.querySelectorAll(
            "input, select, textarea, button"
        );

        budgetFields.forEach((field) => {
            field.disabled = !navigator.onLine;
        });
    }

    // Enable or disable Edit and Delete buttons in the expense list.
    const expenseActionButtons = document.querySelectorAll(
        "#expense-list .expense-actions button"
    );

    expenseActionButtons.forEach((button) => {
        button.disabled = !navigator.onLine;
    });
}
// Check the connection when the page loads.
updateConnectionStatus();

// Update the app when the connection changes.
// Update the app when the connection changes.
window.addEventListener("online", async () => {
    updateConnectionStatus();

    try {
        await loadExpenses();
        await loadBudget();
        render();

        console.log("SpendWise data refreshed after reconnecting.");
    } catch (error) {
        console.error("Could not refresh SpendWise data:", error);
    }
});

init();