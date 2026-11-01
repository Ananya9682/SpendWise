
import { supabase } from "./supabaseClient.js";
import { requireSession, signOut } from "./auth.js";
import { CURRENCY_CODE } from "./config.js";
import { applyStoredTheme, loadSavedTheme } from "./theme.js";

// Use the theme this browser remembers right away; the saved theme is
// confirmed once login is checked (see init).
applyStoredTheme();

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
    editNotesBtn: $("edit-notes-btn"),
    notesForm: $("notes-form"),
    notesInput: $("notes-input"),
    notesMessage: $("notes-message"),
    saveNotesBtn: $("save-notes-btn"),
    cancelNotesBtn: $("cancel-notes-btn"),
};

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: CURRENCY_CODE,
});

let currentExpense = null;
let currentUserId = null;

function formatDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(
        undefined,
        {
            day: "numeric",
            month: "long",
            year: "numeric",
        }
    );
}

function showProblem(message) {
    els.loading.hidden = true;
    els.details.hidden = true;
    els.problem.textContent = message;
    els.problem.hidden = false;
}

function showNotesMessage(message, isError = false) {
    els.notesMessage.textContent = message;
    els.notesMessage.hidden = !message;
    els.notesMessage.classList.toggle("is-error", isError);
}

function showExpense(expense) {
    currentExpense = expense;

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

function openNotesEditor() {
    els.notesInput.value = currentExpense.notes || "";

    showNotesMessage("");

    els.notes.hidden = true;
    els.editNotesBtn.hidden = true;
    els.notesForm.hidden = false;

    els.notesInput.focus();
}

function closeNotesEditor() {
    els.notesInput.value = currentExpense.notes || "";

    els.notesForm.hidden = true;
    els.notes.hidden = false;
    els.editNotesBtn.hidden = false;

    showNotesMessage("");
}

async function saveNotes(event) {
    event.preventDefault();

    if (!currentExpense || !currentUserId) {
        showNotesMessage("Please reload the page and try again.", true);
        return;
    }

    const notes = els.notesInput.value.trim();

    els.saveNotesBtn.disabled = true;
    els.cancelNotesBtn.disabled = true;
    showNotesMessage("Saving notes…");

    try {
        const { data, error } = await supabase
            .from("expenses")
            .update({ notes: notes || null })
            .eq("id", currentExpense.id)
            .eq("user_id", currentUserId)
            .select("id, title, amount, category, expense_date, notes")
            .maybeSingle();

        if (error) {
            console.error("Save notes error:", error);
            showNotesMessage(
                "Could not save your notes. Please try again.",
                true
            );
            return;
        }

        if (!data) {
            showNotesMessage(
                "This expense could not be updated. Return to your expense list and try again.",
                true
            );
            return;
        }

        showExpense(data);
        closeNotesEditor();
    } catch (error) {
        console.error("Unexpected save notes error:", error);
        showNotesMessage(
            "Something went wrong. Please check your connection and try again.",
            true
        );
    } finally {
        els.saveNotesBtn.disabled = false;
        els.cancelNotesBtn.disabled = false;
    }
}

async function init() {
    const session = await requireSession();

    if (!session) return;

    await loadSavedTheme(session.user.id);

    currentUserId = session.user.id;
    els.userEmail.textContent = session.user.email;

    els.logoutBtn.addEventListener("click", signOut);

    els.editNotesBtn.addEventListener("click", openNotesEditor);
    els.notesForm.addEventListener("submit", saveNotes);
    els.cancelNotesBtn.addEventListener("click", closeNotesEditor);

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
        .eq("user_id", currentUserId)
        .maybeSingle();

    if (error) {
        console.error("Expense details error:", error);
        showProblem("Couldn’t load this expense. Please try again.");
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
