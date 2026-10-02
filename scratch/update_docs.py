import os

file_path = "d:\\Ali Fayaz Projects\\WMS\\WMS_UPDATED_PROJECT_DOCUMENTATION.md"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Section 1
s1_addition = """
- **Cheques & Personal Payments:** Manage post-dated cheques, their lifecycles, and owner/partner drawings outside the main P&L.
- **Security & Integrity:** `PeriodClose` locks historical data, and `ActivityLog` provides immutable audit trails.
- **AI Agent:** Groq-powered natural language assistant (`aiController`) for parsing intents and executing factory actions.
"""
content = content.replace("- Authenticate users with **JWT Bearer** tokens.", s1_addition + "\n- Authenticate users with **JWT Bearer** tokens.")


# 2. Add to Controllers table
controllers_addition = """| `controllers/aiController.js` | Groq AI intent parsing & action execution |
| `controllers/chequeController.js` | Lifecycle of physical cheques (Clear, Bounce) |
| `controllers/periodCloseController.js` | Locks DB prior to a date |
| `controllers/activityLogController.js` | Immutable audit trails |
| `controllers/personalPaymentController.js` | Partner drawings/investments |
| `controllers/balanceSheetController.js` | Advanced accounting views |
"""
content = content.replace("#### Controllers\n\n| Path | Purpose |\n|------|---------|\n", "#### Controllers\n\n| Path | Purpose |\n|------|---------|\n" + controllers_addition)


# 3. Add to Models table
models_addition = """| `models/Cheque.js` | Physical cheques lifecycle |
| `models/PeriodClose.js` | Locks database by date |
| `models/ActivityLog.js` | Audit trail of all CRUD actions |
| `models/PersonalPayment.js` | Partner drawings & external investments |
| `models/SystemSettings.js` | Global app config |
"""
content = content.replace("#### Models\n\n| Path | Purpose |\n|------|---------|\n", "#### Models\n\n| Path | Purpose |\n|------|---------|\n" + models_addition)

# 4. Add to Routes table
routes_addition = """| `routes/aiRoutes.js` | `/api/ai` |
| `routes/chequeRoutes.js` | `/api/cheques` |
| `routes/periodCloseRoutes.js` | `/api/period-close` |
| `routes/activityLogRoutes.js` | `/api/activity-logs` |
| `routes/personalPaymentRoutes.js` | `/api/personal-payments` |
"""
content = content.replace("#### Routes\n\n| Path | Mount prefix (from `server.js`) |\n|------|----------------------------------|\n", "#### Routes\n\n| Path | Mount prefix (from `server.js`) |\n|------|----------------------------------|\n" + routes_addition)

# 5. Add to Pages table
pages_addition = """| `pages/Cheques.jsx` | Cheque management |
| `pages/PeriodClose.jsx` | Data freezing UI |
| `pages/SecuritySettings.jsx` | Audit logs view |
| `pages/PersonalPayments.jsx` | Partner drawings |
| `pages/BalanceSheet.jsx` | Accounting snapshot |
"""
content = content.replace("#### Pages\n\n| Path | Purpose |\n|------|---------|\n", "#### Pages\n\n| Path | Purpose |\n|------|---------|\n" + pages_addition)


# 6. Inject the huge tables for new models
new_models = """
### 3.17 Cheque

| Field | Type | Purpose | Manual / Auto |
|-------|------|---------|---------------|
| chequeNumber | String (required) | Cheque number | Manual |
| chequeType | Customer/Company/Personal | Type of cheque | Manual |
| direction | Received/Issued | Direction | Manual |
| bankName | String (required) | Origin bank | Manual |
| amount | Number (required) | Amount | Manual |
| chequeDate / receivedDate / issueDate | Date | Key dates | Manual |
| status | In Hand/Deposited/Endorsed/Issued/Cleared/Bounced/Returned/Cancelled | Status | Manual/Flow |
| receivedFrom | subdoc (partyType, partyId, partyName) | Who gave it | Manual |
| givenTo | subdoc (partyType, partyId, partyName, expense details) | Who it was given to | Manual |
| sourceChequeId | ObjectId → Cheque | Endorsement link | Auto when endorsed |
| depositBankAccount / depositDate | String / Date | Deposit details | Manual |
| transactionId | ObjectId → Transaction | Linked clearing txn | **Auto** on Clear |
| orderId / rawMaterialId | ObjectId | Payment links | Manual / Sync |

### 3.18 PeriodClose

| Field | Type | Purpose | Manual / Auto |
|-------|------|---------|---------------|
| closeDate | Date (required) | Date locked | Manual |
| executedBy | String (required) | Admin who closed | Manual |
| status | Completed/Superseded | Lock status | Auto |
| backupFilePath | String | Path to DB dump | Auto |
| deletedCounts | Object | Summary of purge | Auto |

### 3.19 ActivityLog

| Field | Type | Purpose | Manual / Auto |
|-------|------|---------|---------------|
| userId / userName / userRole | ObjectId / String / String | Who | Auto (Middleware) |
| action | CREATE/UPDATE/DELETE/LOGIN | Action type | Auto |
| module | String enum | Affected module | Auto |
| description | String | Details | Auto |
| documentId / previousValue / newValue | String / Mixed / Mixed | Data tracking | Auto |
| ipAddress | String | Security | Auto |

### 3.20 PersonalPayment

| Field | Type | Purpose | Manual / Auto |
|-------|------|---------|---------------|
| categoryName / categoryType | String / enum | Drawing type | Manual |
| paymentDirection | Receivable/Payable | Direction | Manual |
| expectedLumpSum | Number | Goal amount | Manual |
| totalContributed / remainingToContribute | Number | Tally | **Auto** pre-save |
| status | Active/Completed/Cancelled | Status | Auto pre-save |
| receivedVia / initialTransactionId | String / ObjectId | Opening setup | Auto / Manual |
| payments[] | subdocs | Payment history | Manual |

"""
content = content.replace("## 4. Relationships Between Models", new_models + "## 4. Relationships Between Models")

# 7. Add relationships
new_rels = """  Transaction }o--o| Cheque : transactionId
  Cheque }o--o| Customer : receivedFrom.partyId
  PersonalPayment ||--o{ Transaction : initialTransactionId
"""
content = content.replace("Customer ||--o{ paymentHistory : orderId_optional", "Customer ||--o{ paymentHistory : orderId_optional\n" + new_rels)

# 8. Add API routes
new_routes = """
### 5.16 AI Assistant — `/api/ai`

| Method | Route | Does | Takes | Returns |
|--------|-------|------|-------|---------|
| POST | `/intent` | Parse NL to Intent | `{ query }` | Action JSON |
| POST | `/execute` | Execute Intent | `{ action, context }` | Success + Logs |
| POST | `/undo` | Undo last AI action | `{ logId }` | Reverted state |

### 5.17 Cheques — `/api/cheques`

| Method | Route | Does | Takes | Returns |
|--------|-------|------|-------|---------|
| GET | `/` | List all cheques | Filters | List |
| POST | `/` | Create a cheque | Cheque body | Created |
| PUT | `/:id/status` | Update status (may trigger Transaction) | `{ status }` | Updated |
| DELETE | `/:id` | Delete cheque + cascade | — | Message |

### 5.18 Period Close & Security — `/api/period-close` & `/api/activity-logs`

| Method | Route | Does | Takes | Returns |
|--------|-------|------|-------|---------|
| POST | `/period-close` | Lock database | `{ closeDate }` | PeriodClose object |
| GET | `/activity-logs` | Fetch audit logs | Filters | Logs |

### 5.19 Extended Financials

| Method | Route | Does | Takes | Returns |
|--------|-------|------|-------|---------|
| GET | `/balance-sheet` | Aggregate balance sheet | — | Balances JSON |
| GET | `/payables` | Who factory owes | — | List of debts |
| GET | `/receivables` | Who owes factory | — | List of receivables |
| GET | `/personal-payments` | Owner drawings | Filters | List |

"""
content = content.replace("## 6. Every Module — Files, Flow, Calculations", new_routes + "## 6. Every Module — Files, Flow, Calculations")

# 9. Add cross-module connections
new_cross = """| Cheque status changed to "Cleared" | Creates a corresponding `Transaction` and hits party totals |
| Cheque status changed to "Bounced" | Deletes linked `Transaction`; reverts party totals |
| Period Close executed | Protects all past data; updates ActivityLog heavily |
| AI Agent execution | Dynamically triggers any module above |
"""
content = content.replace("| Server startup | `reconcileAllPendingOrders` runs |", "| Server startup | `reconcileAllPendingOrders` runs |\n" + new_cross)

# 10. Update Title
content = content.replace("# Wire Manufacturing System (WMS) — Project Documentation", "# Wire Manufacturing System (WMS) — Latest Comprehensive Project Documentation (V3)")


with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done updating!")
