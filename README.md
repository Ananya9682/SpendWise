# SpendWise 💰

**SpendWise** is a web-based expense tracking application that helps users record their daily expenses, manage monthly budgets, and understand their spending habits through visual reports and analytics.

## ✨ Features

- **User Authentication:** Sign up and log in using an email account.
- **Expense Management:** Add, view, edit, and delete expenses.
- **Expense Notes:** Record additional details about individual purchases.
- **Dashboard:** View monthly spending summaries and category-wise charts.
- **Search and Filters:** Find expenses using search and filtering options.
- **Monthly Budgets:** Set a monthly budget and monitor spending progress.
- **Spending Insights:** Compare spending across months.
- **Reports and Analytics:** Review monthly spending trends and category summaries.
- **CSV Export:** Export expense records for personal record-keeping.
- **Responsive Interface:** Use the application on desktop and mobile-sized screens.
- **Data Privacy:** Uses Supabase authentication and Row Level Security policies to restrict access to user-specific records.

## 🛠️ Technologies Used

- **HTML5** — Website structure
- **CSS3** — Styling and responsive layout
- **JavaScript** — Application logic and interactions
- **Supabase** — Authentication and PostgreSQL database
- **Chart.js** — Data visualization
- **Git and GitHub** — Version control and code hosting
- **Netlify** — Website deployment

## 🌐 Live Demo

[Open SpendWise](https://spendwise-ananya-81348.netlify.app/)

## 🚀 Getting Started

To run SpendWise locally:

1. Clone or download this repository.
2. Open the project folder in Visual Studio Code.
3. Configure your Supabase project URL and publishable key in `js/config.js`.
4. Ensure the required database tables and Row Level Security policies are configured in Supabase.
5. Open `index.html` using a local development server, such as the Live Server extension in Visual Studio Code.

**Note:** A working Supabase configuration is required for authentication and database features.

## 🔐 Security

SpendWise uses Supabase authentication and Row Level Security (RLS) to restrict database access according to user ownership.

Never place a Supabase service-role key or other secret credentials in frontend code.

## 📌 Project Purpose

SpendWise was developed as a practical web development project to explore frontend development, database integration, authentication, expense management, and data visualization.

---

*Built with HTML, CSS, JavaScript, and Supabase.*
