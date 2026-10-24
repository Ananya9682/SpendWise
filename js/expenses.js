import { supabase } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { CURRENCY_CODE } from "./config.js";

// ---------- Settings ----------

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

    budgetMonthLabel: $("budget-month-label"),
    budgetForm: $("budget-form"),
    budgetAmount: $("budget-amount"),
    budgetSaveBtn: $("budget-save-btn"),
    budgetMessage: $("budget-message"),
    budgetProgressArea: $("budget-progress-area"),
    budgetSpent: $("budget-spent"),
    budgetRemaining: $("budget-remaining"),
    budgetProgressTrack: $("budget-progress-track"),
    budgetProgressBar: $("budget-progress-bar"),
    budgetPercent: $("budget-percent"),
    budgetAlert: $("budget-alert"),

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

    search: $("search-expenses"),
    filterCategory: $("filter-category"),
    filterFrom: $("filter-from"),
    filterTo: $("filter-to"),
    clearFilters: $("clear-filters"),
    exportExpenses: $("export-expenses"),
    filterCount: $("filter-count"),
    filterError: $("filter-error"),

    insightTopCategory: $("insight-top-category"),
    insightTopCategoryDetail: $("insight-top-category-detail"),
    insightMonthChange: $("insight-month-change"),
    insightMonthChangeDetail: $("insight-month-change-detail"),
    insightMessage: $("insight-message"),

    chartContainer: $("chart-container"),
    chartCanvas: $("category-chart"),
    chartEmpty: $("chart-empty"),
    chartError: $("chart-error"),
    categorySummary: $("category-summary"),
};

let session = null;
let expenses = [];
let currentBudget = null;
let editingId = null;
let categoryChart = null;
let searchDebounceId = null;

// ---------- Money and date helpers ----------

function makeMoneyFormatter() {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: CURRENCY_CODE,
        });
    } catch {
        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }
}

const money = makeMoneyFormatter();

function todayString() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function currentMonthStart() {
    return todayString().slice(0, 7) + "-01";
}

function formatMonthLabel() {
    return new Date().toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
}

function formatDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(
        undefined,
        {
            day: "numeric",
            month: "short",
            year: "numeric",
        }
    );
}

function showMessage(element, text, type) {
    if (!element) return;

    element.textContent = text;
    element.className =
        "message" +
        (text ? (type === "error" ? " is-error" : " is-success") : "");
}

function prefersReducedMotion() {
    return window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;
}

function getMonthPrefix(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
    ].join("-");
}

// ---------- Monthly statistics ----------

// Calculate monthly totals and category totals together.
// This avoids repeatedly filtering the same expense array.

function calculateMonthlyStats() {
    const currentPrefix = getMonthPrefix();
    const previousDate = new Date();
    previousDate.setDate(1);
    previousDate.setMonth(previousDate.getMonth() - 1);

    const previousPrefix = getMonthPrefix(previousDate);

    const stats = {
        currentCount: 0,
        currentTotal: 0,
        previousCount: 0,
        previousTotal: 0,
        categoryTotals: new Map(),
    };

    for (const expense of expenses) {
        const amount = Number(expense.amount);
        const date = expense.expense_date;

        if (date.startsWith(currentPrefix)) {
            stats.currentCount += 1;
            stats.currentTotal += amount;

            const category = CATEGORIES.includes(expense.category)
                ? expense.category
                : "Other";

            stats.categoryTotals.set(
                category,
                (stats.categoryTotals.get(category) || 0) + amount
            );
        } else if (date.startsWith(previousPrefix)) {
            stats.previousCount += 1;
            stats.previousTotal += amount;
        }
    }

    return stats;
}

// ---------- CSV export ----------

function exportAllExpenses() {
    if (expenses.length === 0) {
        showMessage(
            els.listMessage,
            "There are no expenses to export yet.",
            "error"
        );
        return;
    }

    const columns = ["Title", "Amount", "Category", "Date", "Notes"];

    function escapeCSV(value) {
        let text = String(value ?? "");

        // Reduce spreadsheet formula-injection risk.
        if (/^[\t\r ]*[=+\-@]/.test(text)) {
            text = "'" + text;
        }

        return `"${text.replace(/"/g, '""')}"`;
    }

    const rows = expenses.map((expense) => [
        expense.title,
        Number(expense.amount).toFixed(2),
        expense.category,
        expense.expense_date,
        expense.notes || "",
    ]);

    const csvContent = [columns, ...rows]
        .map((row) => row.map(escapeCSV).join(","))
        .join("\r\n");

    const blob = new Blob(
        ["\uFEFF", csvContent],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `SpendWise-expenses-${todayString()}.csv`;

    document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    showMessage(
        els.listMessage,
        `Exported ${expenses.length} expenses to CSV.`,
        "success"
    );
}

// ---------- Search and filtering ----------

function getFilteredExpenses() {
    const searchText = els.search.value.trim().toLowerCase();
    const selectedCategory = els.filterCategory.value;
    const fromDate = els.filterFrom.value;
    const toDate = els.filterTo.value;

    return expenses.filter((expense) => {
        const title = String(expense.title || "").toLowerCase();

        return (
            title.includes(searchText) &&
            (!selectedCategory ||
                expense.category === selectedCategory) &&
            (!fromDate || expense.expense_date >= fromDate) &&
            (!toDate || expense.expense_date <= toDate)
        );
    });
}

function renderFilteredExpenses() {
    const fromDate = els.filterFrom.value;
    const toDate = els.filterTo.value;

    if (fromDate && toDate && fromDate > toDate) {
        els.list.replaceChildren();
        els.emptyState.hidden = true;
        els.filterCount.textContent = "";

        showMessage(
            els.filterError,
            "The start date must be on or before the end date.",
            "error"
        );
        return;
    }

    showMessage(els.filterError, "", "error");

    const filteredExpenses = getFilteredExpenses();
    const count = filteredExpenses.length;
    const total = expenses.length;

    els.filterCount.textContent =
        count === total
            ? `${total} ${total === 1 ? "expense" : "expenses"}`
            : `Showing ${count} of ${total} expenses`;

    els.emptyState.hidden = total > 0;
    els.list.replaceChildren();

    if (total > 0 && count === 0) {
        els.filterCount.textContent =
            "No expenses match your search or filters.";
    }

    // Build the list off-screen, then insert it once.
    const fragment = document.createDocumentFragment();

    for (const expense of filteredExpenses) {
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
        viewLink.href =
            "expense-details.html?id=" +
            encodeURIComponent(expense.id);
        viewLink.textContent = "View details";
        viewLink.setAttribute(
            "aria-label",
            `View details for ${expense.title}`
        );

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
        fragment.append(item);
    }

    els.list.append(fragment);
}

function debouncedRenderFilteredExpenses() {
    window.clearTimeout(searchDebounceId);

    searchDebounceId = window.setTimeout(() => {
        renderFilteredExpenses();
    }, 200);
}

function clearFilters() {
    els.search.value = "";
    els.filterCategory.value = "";
    els.filterFrom.value = "";
    els.filterTo.value = "";

    showMessage(els.filterError, "", "error");
    renderFilteredExpenses();
}

function setupFilters() {
    for (const name of CATEGORIES) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        els.filterCategory.append(option);
    }

    els.search.addEventListener(
        "input",
        debouncedRenderFilteredExpenses
    );

    els.filterCategory.addEventListener(
        "change",
        renderFilteredExpenses
    );

    els.filterFrom.addEventListener(
        "change",
        renderFilteredExpenses
    );

    els.filterTo.addEventListener(
        "change",
        renderFilteredExpenses
    );

    els.clearFilters.addEventListener("click", clearFilters);
    els.exportExpenses.addEventListener("click", exportAllExpenses);
}

// ---------- Supabase: expenses ----------

async function loadExpenses() {
    const { data, error } = await supabase
        .from("expenses")
        .select(
            "id, title, amount, category, expense_date, notes, created_at"
        )
        .eq("user_id", session.user.id)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) {
        showMessage(
            els.listMessage,
            "Couldn’t load your expenses: " + error.message,
            "error"
        );
        return false;
    }

    expenses = data || [];
    showMessage(els.listMessage, "", "success");
    render();

    return true;
}

// ---------- Monthly budget ----------

async function loadBudget() {
    const { data, error } = await supabase
        .from("budgets")
        .select("id, amount, budget_month")
        .eq("user_id", session.user.id)
        .eq("budget_month", currentMonthStart())
        .maybeSingle();

    if (error) {
        currentBudget = null;
        els.budgetProgressArea.hidden = true;

        showMessage(
            els.budgetMessage,
            "Couldn’t load your budget: " + error.message,
            "error"
        );
        return;
    }

    currentBudget = data;

    els.budgetAmount.value = data
        ? Number(data.amount).toFixed(2)
        : "";

    showMessage(els.budgetMessage, "", "success");
    renderBudget();
}

function renderBudget(stats = calculateMonthlyStats()) {
    els.budgetMonthLabel.textContent = formatMonthLabel();

    if (!currentBudget) {
        els.budgetProgressArea.hidden = true;
        els.budgetAlert.textContent = "";
        return;
    }

    const budget = Number(currentBudget.amount);
    const spent = stats.currentTotal;
    const remaining = budget - spent;
    const percent = (spent / budget) * 100;
    const progressWidth = Math.min(percent, 100);

    els.budgetProgressArea.hidden = false;
    els.budgetSpent.textContent = money.format(spent);
    els.budgetRemaining.textContent = money.format(remaining);
    els.budgetPercent.textContent =
        `${percent.toFixed(1)}% of your monthly budget used`;

    els.budgetProgressBar.style.width = `${progressWidth}%`;

    els.budgetProgressTrack.setAttribute(
        "aria-valuenow",
        String(Math.min(Math.round(percent), 100))
    );

    els.budgetProgressTrack.setAttribute(
        "aria-valuetext",
        `${percent.toFixed(1)} percent of budget used`
    );

    els.budgetProgressBar.classList.remove(
        "is-warning",
        "is-over-budget"
    );

    els.budgetAlert.className = "budget-alert";

    if (percent >= 100) {
        els.budgetProgressBar.classList.add("is-over-budget");
        els.budgetAlert.classList.add("is-over-budget");

        els.budgetAlert.textContent =
            `Budget exceeded by ${money.format(spent - budget)}. ` +
            "Review your spending for the rest of the month.";
    } else if (percent >= 80) {
        els.budgetProgressBar.classList.add("is-warning");
        els.budgetAlert.classList.add("is-warning");

        els.budgetAlert.textContent =
            "You’ve used at least 80% of your budget. Keep an eye on your spending.";
    } else {
        els.budgetAlert.textContent =
            "You’re within your monthly budget. Keep it up!";
    }
}

async function saveBudget(event) {
    event.preventDefault();
    showMessage(els.budgetMessage, "", "success");

    const amount = Number(els.budgetAmount.value);

    if (!Number.isFinite(amount) || amount <= 0) {
        showMessage(
            els.budgetMessage,
            "Enter a budget greater than zero.",
            "error"
        );
        els.budgetAmount.focus();
        return;
    }

    els.budgetSaveBtn.disabled = true;

    try {
        const { data, error } = await supabase
            .from("budgets")
            .upsert(
                {
                    user_id: session.user.id,
                    budget_month: currentMonthStart(),
                    amount,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "user_id,budget_month",
                }
            )
            .select("id, amount, budget_month")
            .single();

        if (error) {
            showMessage(
                els.budgetMessage,
                "Couldn’t save your budget: " + error.message,
                "error"
            );
            return;
        }

        currentBudget = data;
        renderBudget();

        showMessage(
            els.budgetMessage,
            "Your monthly budget has been saved.",
            "success"
        );
    } catch (error) {
        console.error("Save budget error:", error);

        showMessage(
            els.budgetMessage,
            "Something went wrong while saving your budget. Please try again.",
            "error"
        );
    } finally {
        els.budgetSaveBtn.disabled = false;
    }
}

// ---------- Add and edit expenses ----------

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
        showMessage(
            els.formMessage,
            "Enter an amount greater than zero.",
            "error"
        );
        els.amount.focus();
        return;
    }

    if (!els.date.value) {
        showMessage(els.formMessage, "Choose an expense date.", "error");
        els.date.focus();
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

    try {
        let result;

        if (editingId) {
            result = await supabase
                .from("expenses")
                .update(fields)
                .eq("id", editingId)
                .eq("user_id", session.user.id)
                .select();
        } else {
            result = await supabase
                .from("expenses")
                .insert({
                    ...fields,
                    user_id: session.user.id,
                })
                .select();
        }

        if (result.error) {
            showMessage(
                els.formMessage,
                "Couldn’t save: " + result.error.message,
                "error"
            );
            return;
        }

        if (!result.data || result.data.length === 0) {
            showMessage(
                els.formMessage,
                "Couldn’t save: that expense wasn’t found.",
                "error"
            );
            return;
        }

        const wasEditing = Boolean(editingId);
        resetForm();

        showMessage(
            els.formMessage,
            wasEditing ? "Changes saved." : "Expense added.",
            "success"
        );

        await loadExpenses();
    } catch (error) {
        console.error("Save expense error:", error);

        showMessage(
            els.formMessage,
            "Something went wrong while saving. Please try again.",
            "error"
        );
    } finally {
        els.saveBtn.disabled = false;
    }
}

async function deleteExpense(expense) {
    const ok = window.confirm(
        `Delete “${expense.title}”? This can’t be undone.`
    );

    if (!ok) return;

    const { data, error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expense.id)
        .eq("user_id", session.user.id)
        .select();

    if (error) {
        showMessage(
            els.listMessage,
            "Couldn’t delete: " + error.message,
            "error"
        );
        return;
    }

    if (!data || data.length === 0) {
        showMessage(
            els.listMessage,
            "Couldn’t delete: that expense wasn’t found.",
            "error"
        );
        return;
    }

    if (editingId === expense.id) {
        resetForm();
    }

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

    els.category.value = CATEGORIES.includes(expense.category)
        ? expense.category
        : "Other";

    els.notes.value = expense.notes || "";
    els.formTitle.textContent = "Edit expense";
    els.saveBtn.textContent = "Save changes";
    els.cancelBtn.hidden = false;

    showMessage(els.formMessage, "", "success");

    els.form.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
    });

    els.title.focus();
}

// ---------- Category chart ----------

function renderCategoryChart(stats) {
    const entries = [...stats.categoryTotals.entries()]
        .filter(([, total]) => total > 0)
        .sort((a, b) => b[1] - a[1]);

    els.categorySummary.replaceChildren();
    els.chartError.hidden = true;

    const summaryFragment = document.createDocumentFragment();

    for (const [category, total] of entries) {
        const item = document.createElement("li");
        item.className = "category-summary-item";

        const name = document.createElement("span");
        name.textContent = category;

        const amount = document.createElement("strong");
        amount.textContent = money.format(total);

        item.append(name, amount);
        summaryFragment.append(item);
    }

    els.categorySummary.append(summaryFragment);

    if (entries.length === 0) {
        if (categoryChart) {
            categoryChart.destroy();
            categoryChart = null;
        }

        els.chartContainer.hidden = true;
        els.chartEmpty.hidden = false;
        return;
    }

    els.chartEmpty.hidden = true;

    if (typeof window.Chart !== "function") {
        els.chartContainer.hidden = true;
        els.chartError.hidden = false;
        return;
    }

    els.chartContainer.hidden = false;

    const labels = entries.map(([category]) => category);
    const values = entries.map(([, total]) => total);

    try {
        if (categoryChart) {
            // Update the existing chart instead of rebuilding it.
            categoryChart.data.labels = labels;
            categoryChart.data.datasets[0].data = values;
            categoryChart.update("none");
            return;
        }

        categoryChart = new window.Chart(els.chartCanvas, {
            type: "doughnut",
            data: {
                labels,
                datasets: [
                    {
                        data: values,
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "58%",
                plugins: {
                    legend: {
                        position: "bottom",
                    },
                    tooltip: {
                        callbacks: {
                            label(context) {
                                return `${context.label}: ${money.format(
                                    Number(context.raw)
                                )}`;
                            },
                        },
                    },
                },
            },
        });
    } catch (error) {
        console.error("Chart rendering error:", error);
        els.chartContainer.hidden = true;
        els.chartError.hidden = false;
    }
}

// ---------- Spending insights ----------

function renderSpendingInsights(stats) {
    const topCategory = [...stats.categoryTotals.entries()]
        .sort((a, b) => b[1] - a[1])[0];

    if (topCategory) {
        els.insightTopCategory.textContent = topCategory[0];
        els.insightTopCategoryDetail.textContent =
            `${money.format(topCategory[1])} spent this month`;
    } else {
        els.insightTopCategory.textContent = "No spending yet";
        els.insightTopCategoryDetail.textContent =
            "Add an expense to see your top category.";
    }

    if (stats.previousCount === 0) {
        els.insightMonthChange.textContent = "No comparison yet";
        els.insightMonthChangeDetail.textContent =
            "No expenses were recorded last month.";
    } else if (stats.previousTotal === 0) {
        els.insightMonthChange.textContent =
            stats.currentTotal > 0 ? "Spending started" : "No change";

        els.insightMonthChangeDetail.textContent =
            "Last month's total was ₹0.00, so percentage change isn't available.";
    } else {
        const difference = stats.currentTotal - stats.previousTotal;
        const percentage =
            (Math.abs(difference) / stats.previousTotal) * 100;

        if (difference > 0) {
            els.insightMonthChange.textContent =
                `${percentage.toFixed(1)}% higher`;
        } else if (difference < 0) {
            els.insightMonthChange.textContent =
                `${percentage.toFixed(1)}% lower`;
        } else {
            els.insightMonthChange.textContent = "No change";
        }

        els.insightMonthChangeDetail.textContent =
            `${money.format(stats.previousTotal)} last month · ` +
            `${money.format(stats.currentTotal)} this month`;
    }

    if (stats.currentCount === 0) {
        showMessage(
            els.insightMessage,
            "Your insights will update when you record expenses this month.",
            ""
        );
    } else if (topCategory) {
        showMessage(
            els.insightMessage,
            `Your highest-spending category this month is ${topCategory[0]}.`,
            ""
        );
    }
}

// ---------- Dashboard rendering ----------

function render() {
    const stats = calculateMonthlyStats();

    els.monthTotal.textContent = money.format(stats.currentTotal);
    els.monthCount.textContent =
        stats.currentCount === 1
            ? "1 expense so far"
            : `${stats.currentCount} expenses so far`;

    renderCategoryChart(stats);
    renderFilteredExpenses();
    renderBudget(stats);
    renderSpendingInsights(stats);
}

// ---------- Start-up ----------

async function init() {
    try {
        session = await requireSession();

        if (!session) return;

        els.userEmail.textContent = session.user.email;
        els.budgetMonthLabel.textContent = formatMonthLabel();

        for (const name of CATEGORIES) {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            els.category.append(option);
        }

        els.date.value = todayString();

        setupFilters();

        els.form.addEventListener("submit", saveExpense);
        els.cancelBtn.addEventListener("click", resetForm);
        els.budgetForm.addEventListener("submit", saveBudget);
        els.logoutBtn.addEventListener("click", signOut);

        supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT") {
                window.location.replace("login.html");
            }
        });

        // These requests can run concurrently.
        await Promise.all([loadExpenses(), loadBudget()]);

        els.loading.hidden = true;
        els.app.hidden = false;
    } catch (error) {
        console.error("SpendWise initialization error:", error);

        showMessage(
            els.listMessage,
            "SpendWise couldn't finish loading. Please refresh and try again.",
            "error"
        );

        els.loading.hidden = true;
    }
}

init();