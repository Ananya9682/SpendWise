
import { supabase } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { CURRENCY_CODE } from "./config.js";
import { applyStoredTheme, loadSavedTheme } from "./theme.js";

// Use the theme this browser remembers right away; the saved theme is
// confirmed once login is checked (see initReports).
applyStoredTheme();

const $ = (id) => document.getElementById(id);

let trendChart = null;

const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function formatMoney(amount) {
    return money.format(Number(amount) || 0);
}

function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date) {
    return date.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric"
    });
}

function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEndDateString(date) {
    const lastDay = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0
    ).getDate();

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function showError(message) {
    $("report-error").textContent = message;
    $("report-error").hidden = false;
}

function hideError() {
    $("report-error").textContent = "";
    $("report-error").hidden = true;
}

function showExpenseCount(elementId, count) {
    $(elementId).textContent =
        `${count} expense${count === 1 ? "" : "s"}`;
}

function buildMonthlyData(expenses, months) {
    const totals = {};

    for (const month of months) {
        totals[month.key] = {
            total: 0,
            count: 0
        };
    }

    for (const expense of expenses) {
        const key = String(expense.expense_date).slice(0, 7);

        if (!totals[key]) continue;

        totals[key].total += Number(expense.amount) || 0;
        totals[key].count += 1;
    }

    return totals;
}

function renderSummary(months, totals, expenses) {
    const currentMonth = months[months.length - 1];
    const previousMonth = months[months.length - 2];

    const current = totals[currentMonth.key];
    const previous = totals[previousMonth.key];

    $("current-month-name").textContent = currentMonth.label;
    $("current-month-total").textContent = formatMoney(current.total);
    showExpenseCount("current-month-count", current.count);

    $("previous-month-name").textContent = previousMonth.label;
    $("previous-month-total").textContent = formatMoney(previous.total);
    showExpenseCount("previous-month-count", previous.count);

    const changeElement = $("spending-change");
    const descriptionElement = $("spending-change-description");

    if (previous.total === 0 && current.total === 0) {
        changeElement.textContent = "No change";
        descriptionElement.textContent =
            "There is no spending recorded in either month.";
    } else if (previous.total === 0) {
        changeElement.textContent = "New spending";
        descriptionElement.textContent =
            "There was no spending last month, so a percentage change cannot be calculated.";
    } else {
        const difference = current.total - previous.total;
        const percentage = (difference / previous.total) * 100;
        const direction = difference > 0
            ? "increase"
            : difference < 0
                ? "decrease"
                : "no change";

        changeElement.textContent =
            `${difference > 0 ? "+" : difference < 0 ? "−" : ""}${formatMoney(Math.abs(difference))}`;

        descriptionElement.textContent =
            `${Math.abs(percentage).toFixed(1)}% ${direction} compared with last month.`;
    }

    // Find the category with the highest total across the six-month period.
    const categoryTotals = {};

    for (const expense of expenses) {
        const category = expense.category || "Uncategorized";
        categoryTotals[category] =
            (categoryTotals[category] || 0) + (Number(expense.amount) || 0);
    }

    const topCategory = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])[0];

    if (topCategory) {
        $("top-category").textContent = topCategory[0];
        $("top-category-total").textContent =
            `${formatMoney(topCategory[1])} across the last six months`;
    } else {
        $("top-category").textContent = "—";
        $("top-category-total").textContent =
            "No spending data available yet.";
    }
}

// Reads the active theme's colours so the chart matches the rest of the page.
function getChartColors() {
    const styles = getComputedStyle(document.body);
    const read = (name, fallback) =>
        styles.getPropertyValue(name).trim() || fallback;

    return {
        bar: read("--primary", "#2b3bd1"),
        text: read("--muted", "#51606e"),
        grid: read("--line", "#d5dce3")
    };
}

function renderChart(months, totals) {
    const canvas = $("spending-trend-chart");
    const chartContainer = $("trend-chart-container");
    const emptyMessage = $("trend-empty");

    const hasSpending = months.some(
        (month) => totals[month.key].count > 0
    );

    if (trendChart) {
        trendChart.destroy();
        trendChart = null;
    }

    if (!hasSpending) {
        chartContainer.hidden = true;
        emptyMessage.hidden = false;
        return;
    }

    chartContainer.hidden = false;
    emptyMessage.hidden = true;

    const colors = getChartColors();

    trendChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: months.map((month) => month.label),
            datasets: [{
                label: "Total spending",
                data: months.map((month) => totals[month.key].total),
                backgroundColor: colors.bar,
                borderColor: colors.bar,
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `Total: ${formatMoney(context.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: colors.text
                    },
                    grid: {
                        color: colors.grid
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: colors.text,
                        callback: (value) =>
                            formatMoney(value)
                    },
                    grid: {
                        color: colors.grid
                    }
                }
            }
        }
    });
}

function renderMonthlyTable(months, totals) {
    const tbody = $("monthly-breakdown-body");
    tbody.replaceChildren();

    for (const month of [...months].reverse()) {
        const data = totals[month.key];
        const row = document.createElement("tr");

        const monthCell = document.createElement("td");
        monthCell.textContent = month.label;

        const totalCell = document.createElement("td");
        totalCell.textContent = formatMoney(data.total);

        const countCell = document.createElement("td");
        countCell.textContent = String(data.count);

        row.append(monthCell, totalCell, countCell);
        tbody.appendChild(row);
    }
}

async function loadReports() {
    hideError();

    const now = new Date();
    const currentMonthStart = getMonthStart(now);

    // Include the current month and the five preceding months.
    const months = [];

    for (let offset = 5; offset >= 0; offset--) {
        const date = new Date(
            currentMonthStart.getFullYear(),
            currentMonthStart.getMonth() - offset,
            1
        );

        months.push({
            key: getMonthKey(date),
            label: getMonthLabel(date)
        });
    }

    const firstMonthDate = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth() - 5,
        1
    );

    const startDate =
        `${firstMonthDate.getFullYear()}-${String(firstMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

    const endDate = getMonthEndDateString(currentMonthStart);

    const { data: expenses, error } = await supabase
        .from("expenses")
        .select("amount, category, expense_date")
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .order("expense_date", { ascending: true });

    if (error) {
        console.error("Could not load spending reports:", error);
        showError(
            "We couldn't load your spending reports. Please refresh the page and try again."
        );
        return;
    }

    const monthlyTotals = buildMonthlyData(expenses || [], months);

    renderSummary(months, monthlyTotals, expenses || []);
    renderChart(months, monthlyTotals);
    renderMonthlyTable(months, monthlyTotals);
}

async function initReports() {
    try {
        const session = await requireSession();

        if (!session) return;

        await loadSavedTheme(session.user.id);

        $("user-email").textContent = session.user?.email || "";
        $("loading").hidden = true;
        $("reports-app").hidden = false;

        await loadReports();
    } catch (error) {
        console.error("Could not initialize reports page:", error);
        showError("Something went wrong while opening your reports.");
        $("loading").hidden = true;
        $("reports-app").hidden = false;
    }
}

$("logout-btn").addEventListener("click", async () => {
    try {
        await signOut();
    } catch (error) {
        console.error("Could not log out:", error);
        showError("Log out failed. Please try again.");
    }
});

initReports();
