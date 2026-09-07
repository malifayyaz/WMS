# Wire Manufacturing Management System (WMS)

## Short Description
A comprehensive, full-stack Wire Manufacturing Management System (WMS) designed to streamline operations for wire manufacturing facilities. It provides end-to-end management of inventory, production, sales, finances, and workforce, integrated with advanced reporting and AI-driven insights.

## Long Description
The Wire Manufacturing Management System (WMS) is a robust, tailor-made ERP solution built to digitize and optimize the daily operations of a wire manufacturing plant. It replaces manual bookkeeping and disjointed spreadsheets with a unified, secure, and user-friendly platform. 

The system tracks the entire manufacturing lifecycle: from procuring raw materials and tracking consumption, to the annealing process, job work, and producing ready stock. It also manages the financial and operational aspects of the business, maintaining detailed ledgers for customers, suppliers, and workers. The integrated financial module handles complex accounting needs, including daily cash books, bank books, cheque management (endorsements, deposits, returns), balance sheets, and profit & loss reports. 

Key features include a sophisticated "Period Close" workflow that allows administrators to securely archive historical data into comprehensive Excel backups and reset opening balances for a new financial period. Additionally, the platform is equipped with an AI module capable of parsing orders, predicting profits, and generating daily summaries, empowering management to make data-driven decisions.

## Core Modules & Features

**1. Inventory & Production Management**
*   **Raw Materials:** Track purchases, current stock, returns, and low-stock alerts.
*   **Consumption Materials:** Monitor usage, stock levels, and perform consumption analysis.
*   **Annealing:** Manage arrival and processing of materials through the annealing phase.
*   **Job Work:** Handle customer coils manufactured into wire, including stock pools, deliveries, and returns.
*   **Ready Stock:** Track finalized production ready for dispatch.

**2. Sales & Procurement**
*   **Customers:** Manage profiles, orders, payment history, and comprehensive ledgers.
*   **Suppliers:** Track raw material purchases, payments, and supplier ledgers.
*   **Orders:** Create, track, and update order statuses, including final weight adjustments and stock checks.

**3. Financial Accounting**
*   **Transactions:** Maintain a general ledger, daily cash book (with breakdowns and opening/closing balances), and bank books.
*   **Cheque Management:** Track cheques in-hand, process deposits, endorsements, and returns.
*   **Expenses:** Record operational expenses with detailed breakdowns and summaries.
*   **Receivables & Payables:** Real-time summaries of outstanding balances.
*   **Personal Payments:** Track standalone personal financial transactions.
*   **Reports:** Generate automated Balance Sheets, Profit & Loss statements, Financial summaries, and Daily Books.

**4. Workforce Management**
*   **Workers:** Manage worker profiles, ledger entries, salary payments, and advance distributions.

**5. Administration & Security**
*   **Role-Based Access:** Secure login and profile management with restricted Admin-only routes.
*   **Period Close & Fresh Start:** A secure, password-protected workflow to generate full system backups (Excel) and reset data/balances for a new financial period.
*   **Opening Balances Wizard:** Easily configure fresh balances for cash, bank, stock, and ledgers after a period close.
*   **Activity Logging:** Complete audit trails tracking system interactions.

**6. Analytics & AI Integrations**
*   **Dashboard:** Visual charts and real-time statistics of factory operations.
*   **AI Agent:** Built-in AI for chatting, executing tasks, parsing raw text into structured orders, predicting profits, and generating daily business summaries.

## Technical Stack
*   **Frontend:** React.js, Axios, React Router (Modern, responsive UI).
*   **Backend:** Node.js, Express.js.
*   **Database:** MongoDB (Mongoose ORM).
*   **Key Libraries:** ExcelJS (for backup generation), JSON Web Tokens (JWT for secure authentication).
