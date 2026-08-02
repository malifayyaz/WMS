# WMS — Project Visual Documentation

Generated from the actual codebase under `WMS/backend` and `WMS/frontend/src`.  
Diagrams use Mermaid. Only relationships and flows found in source are shown.

**Note:** There is no function named `syncToDailyBook`. Daily Book sync uses symbols such as `createDailyBookExpenseTotal`, `syncTransactionFromOrder`, `syncTransactionFromRawMaterial`, `syncSourceFromTransaction`, `cascadeDeleteSource`, and `recalcCustomerTotals` / `recalcSupplierTotals` in `transactionSyncService.js`.

---

## 1. System Architecture

How the React SPA, Express API, and MongoDB connect in code.

```mermaid
flowchart TB
  subgraph frontend [Frontend_CRA]
    Browser[Browser]
    ReactApp[React_App]
    AuthCtx[AuthContext_localStorage]
    Axios[Axios_api.js]
  end

  subgraph backend [Backend_Express]
    Server[server.js]
    AuthMW[authMiddleware_JWT]
    Controllers[Controllers]
    Utils[utils_services]
    Models[Mongoose_Models]
  end

  subgraph db [Database]
    MongoDB[(MongoDB_MONGODB_URI)]
  end

  Browser --> ReactApp
  ReactApp --> AuthCtx
  ReactApp --> Axios
  AuthCtx -->|"Bearer_token_on_requests"| Axios
  Axios -->|"REACT_APP_API_URL_/api"| Server
  Server -->|"POST_/api/auth/login_public"| Controllers
  Server -->|"other_/api/*"| AuthMW
  AuthMW --> Controllers
  Controllers --> Utils
  Controllers --> Models
  Utils --> Models
  Models --> MongoDB
```

**From code:**

- Frontend base URL: `process.env.REACT_APP_API_URL || 'http://localhost:5000/api'` in `frontend/src/services/api.js`
- Backend mounts routes in `backend/server.js`; connects via `config/db.js` using `MONGODB_URI`
- JWT stored in `localStorage` (`token`); Axios interceptor attaches `Authorization: Bearer …`

---

## 2. Database Diagram

All 16 Mongoose collections with key fields and real `ref` / `refPath` relationships.

```mermaid
erDiagram
  User {
    string name
    string username
    string password
    string role
  }

  Customer {
    string name
    string customerType
    number totalAmountPurchased
    number totalAmountPaid
    number totalAmountDue
    number openingBalance
    string openingBalanceType
    ObjectId linkedSupplierId
  }

  Supplier {
    string name
    number totalAmountPurchased
    number totalAmountPaid
    number totalAmountDue
    number openingBalance
    string openingBalanceType
    ObjectId linkedCustomerId
  }

  Order {
    ObjectId customerId
    number wireNumber
    string coilCategory
    number initialWeightKg
    number finalWeightKg
    number ratePerKg
    number totalAmount
    string orderStatus
    boolean isAnnealed
    ObjectId annealingRecordId
    boolean isReturn
    ObjectId returnOfOrderId
  }

  Transaction {
    string transactionType
    number amount
    string paymentMethod
    string relatedTo
    ObjectId relatedId
    ObjectId orderId
    string sourceType
    ObjectId sourceId
    ObjectId linkedExpenseId
    string bankAccount
  }

  Expense {
    string expenseGroup
    string expenseCategory
    number amount
    string paymentMethod
    ObjectId bankTransactionId
    string labourName
  }

  RawMaterial {
    ObjectId supplierId
    string coilCategory
    number weightInKg
    number ratePerKg
    number currentStock
    boolean isReturn
  }

  ReadyStock {
    number wireNumber
    string coilCategory
    number weightKg
    string source
    ObjectId orderId
  }

  JobWork {
    ObjectId customerId
    string coilCategory
    number arrivedWeightKg
    number coilRatePerKg
    number deliveredWeightKg
    number labourTotal
    string status
  }

  AnnealingRecord {
    string entryType
    string partyType
    ObjectId partyId
    string materialType
    string coilCategory
    number wireNumber
    ObjectId linkedOrderId
    ObjectId sourceSendId
    number weightKg
    number finalWeightKg
  }

  Worker {
    string name
    boolean active
    number openingBalance
  }

  WorkerLedgerEntry {
    ObjectId workerId
    string entryType
    number amount
    ObjectId expenseId
  }

  ConsumptionMaterial {
    string materialType
    number quantity
    number costPerUnit
    number totalCost
    number currentQuantity
  }

  ConsumptionUsage {
    string materialType
    number quantityUsed
    ObjectId materialId
  }

  DailyCashOpening {
    date bookDate
    number openingBalance
  }

  BankAccountOpening {
    string bankAccount
    string bankAccountOtherName
    number openingBalance
    date asOfDate
  }

  Customer ||--o{ Order : customerId
  Customer ||--o{ JobWork : customerId
  Customer }o--o| Supplier : linkedSupplierId
  Supplier }o--o| Customer : linkedCustomerId
  Supplier ||--o{ RawMaterial : supplierId
  Order }o--o| AnnealingRecord : annealingRecordId
  Order }o--o| Order : returnOfOrderId
  Order ||--o{ Transaction : orderId
  Transaction }o--o| Expense : linkedExpenseId
  Expense }o--o| Transaction : bankTransactionId
  AnnealingRecord }o--o| Order : linkedOrderId
  AnnealingRecord }o--o| AnnealingRecord : sourceSendId
  ReadyStock }o--o| Order : orderId
  Worker ||--o{ WorkerLedgerEntry : workerId
  WorkerLedgerEntry }o--o| Expense : expenseId
  ConsumptionUsage }o--o| ConsumptionMaterial : materialId
```

**Soft links (ObjectId without schema `ref`):**

- `Transaction.relatedId` → Customer or Supplier `_id` when `relatedTo` is set
- `Transaction.sourceId` → Expense / Order / RawMaterial / ConsumptionMaterial matching `sourceType`
- `AnnealingRecord.partyId` uses `refPath: 'partyType'` (`Supplier` | `Customer` | `None`)
- `AnnealingRecord.autoAllocationId` groups auto-split mixed arrivals

---

## 3. User Flow

Every route in `App.jsx` and sidebar navigation in `Sidebar.jsx`.

```mermaid
flowchart TD
  Start([App_Load]) --> AuthCheck{token_and_user}
  AuthCheck -->|no| Login["/login_LoginPage"]
  AuthCheck -->|yes| Dash["/dashboard"]
  Login -->|success| Dash

  Root["/"] --> Dash
  Catch["*_unknown"] --> Dash

  subgraph overview [Overview]
    Dash
  end

  subgraph procurement [Procurement]
    Sup["/suppliers"]
    Raw["/raw-materials"]
    Low["/low-stock"]
  end

  subgraph sales [Sales]
    Cust["/customers"]
    Ord["/orders"]
    Ready["/ready-stock"]
  end

  subgraph finance [Finance]
    Daily["/daily-book"]
    Bank["/bank"]
    Work["/workers"]
    Exp["/expenses"]
  end

  subgraph analytics [Analytics]
    Rep["/reports"]
  end

  Dash --> Sup
  Dash --> Raw
  Dash --> Low
  Dash --> Cust
  Dash --> Ord
  Dash --> Ready
  Dash --> Daily
  Dash --> Bank
  Dash --> Work
  Dash --> Exp
  Dash --> Rep

  subgraph dailyTabs [DailyBook_UI_tabs_not_routes]
    T0[CashBook]
    T1[DailyCustomers]
    T2[LedgerCustomers]
    T3[Suppliers]
    T4[Annealing]
    T5[ProcessingWork]
  end

  Daily --> T0
  Daily --> T1
  Daily --> T2
  Daily --> T3
  Daily --> T4
  Daily --> T5
```

All routes except `/login` wrap `ProtectedRoute` + `AppLayout`.

---

## 4. All Module Connections

Arrows only where one module writes to or recalculates another in controllers/utils.

```mermaid
flowchart LR
  Orders[Orders]
  RawMat[RawMaterials]
  Customers[Customers]
  Suppliers[Suppliers]
  Txn[Transactions_DailyBook]
  Expenses[Expenses]
  Annealing[Annealing]
  JobWork[JobWork]
  Workers[Workers]
  Consumption[Consumption]
  ReadyStock[ReadyStock]
  CashBook[CashBook_Service]
  BankBook[BankBook_Service]
  Reports[Reports]
  Dashboard[Dashboard]

  Orders -->|"deduct_or_restore_stock"| RawMat
  Orders -->|"syncTransactionFromOrder_Daily"| Txn
  Orders -->|"Sold_entry"| Annealing
  Orders -->|"recalcCustomerTotals"| Customers
  Orders -->|"wire_return_creates"| ReadyStock

  RawMat -->|"syncTransactionFromRawMaterial"| Txn
  RawMat -->|"recalcSupplierTotals"| Suppliers
  RawMat -->|"fulfil_pending_orders"| Orders

  Txn -->|"createDailyBookExpenseTotal"| Expenses
  Txn -->|"linked_bank_Expense"| Expenses
  Txn -->|"syncSourceFromTransaction"| Orders
  Txn -->|"syncSourceFromTransaction"| RawMat
  Txn -->|"cascadeDeleteSource"| Orders
  Txn -->|"cascadeDeleteSource"| RawMat
  Txn -->|"recalc_party_totals"| Customers
  Txn -->|"recalc_party_totals"| Suppliers

  Expenses -->|"bankTransactionId_update_delete"| Txn

  JobWork -->|"recalcCustomerTotals"| Customers

  Annealing -->|"own_Patri_Arrival_may_create"| RawMat

  Workers -->|"Payment_Advance_Expense"| Expenses

  Consumption -->|"usage_stock"| Consumption

  CashBook -->|"reads"| Txn
  CashBook -->|"reads"| Expenses
  CashBook -->|"reads"| Consumption
  BankBook -->|"reads_openings_and"| Txn

  Reports -->|"aggregates"| Orders
  Reports -->|"aggregates"| RawMat
  Reports -->|"aggregates"| JobWork
  Reports -->|"aggregates"| Expenses
  Reports -->|"aggregates"| Consumption
  Reports -->|"aggregates"| Txn
  Reports -->|"aggregates"| Annealing

  Dashboard -->|"buildProfitReport_cash_bank"| Reports
  Dashboard -->|"reads"| Customers
  Dashboard -->|"reads"| Suppliers
  Dashboard -->|"reads"| Orders
  Dashboard -->|"reads"| RawMat
  Dashboard -->|"reads"| JobWork
  Dashboard -->|"reads"| Annealing
  Dashboard -->|"reads"| Txn
```

---

## 5. Daily Book Sync Diagram

Based on real sync helpers (not a `syncToDailyBook` function).

```mermaid
flowchart TB
  UI[DailyBook.jsx]

  subgraph apis [APIs_called_from_DailyBook]
    OrdAPI[ordersAPI]
    TxnAPI[transactionsAPI]
    RawAPI[rawMaterialsAPI]
    AnnAPI[annealingAPI]
    JobAPI[jobWorkAPI]
    PartyAPI[customersAPI_suppliersAPI]
    RepAPI[reportsAPI_via_ReportDialog]
  end

  UI --> OrdAPI
  UI --> TxnAPI
  UI --> RawAPI
  UI --> AnnAPI
  UI --> JobAPI
  UI --> PartyAPI
  UI --> RepAPI

  subgraph writePaths [Write_side_effects]
    OrdCreate[Order_create]
    DailyTxn[syncTransactionFromOrder_MoneyIn]
    AnnSold[Annealing_Sold]
    CustTot[recalcCustomerTotals]

    TxnCreate[Transaction_create]
    ExpTotal[createDailyBookExpenseTotal]
    ATM[ATMWithdrawal_BankOut_plus_Expense]
    BankExp[createLinkedExpenseForBankTransfer]
    PartyTot[recalcCustomer_or_SupplierTotals]

    RawCreate[RawMaterial_create_or_return]
    SupTot[recalcSupplierTotals]
    PayTxn[syncTransactionFromRawMaterial]

    JobDel[JobWork_delivery]
    AnnArr[Annealing_Arrival]
  end

  OrdAPI --> OrdCreate
  OrdCreate --> DailyTxn
  OrdCreate --> AnnSold
  OrdCreate --> CustTot

  TxnAPI -->|"entryKind_Factory_or_SelfExpense"| ExpTotal
  TxnAPI -->|"entryKind_ATMWithdrawal"| ATM
  TxnAPI -->|"normal_plus_recordAsExpense"| BankExp
  TxnAPI --> TxnCreate
  TxnCreate --> PartyTot

  RawAPI --> RawCreate
  RawCreate --> PayTxn
  RawCreate --> SupTot

  JobAPI --> JobDel
  JobDel --> CustTot

  AnnAPI --> AnnArr
  AnnArr -->|"own_Patri_Coil"| RawCreate

  subgraph reverseSync [Reverse_and_delete]
    TxnUpd[Transaction_update]
    SyncSrc[syncSourceFromTransaction]
    TxnDel[Transaction_delete]
    Casc[cascadeDeleteSource]
    DelLink[deleteLinkedExpenseForBankTransfer]
  end

  TxnAPI --> TxnUpd
  TxnUpd --> SyncSrc
  SyncSrc --> OrdCreate
  SyncSrc --> RawCreate
  SyncSrc --> ExpTotal
  TxnAPI --> TxnDel
  TxnDel -->|"Bank_Transfer"| DelLink
  TxnDel -->|"non_bank"| Casc

  subgraph reads [Read_aggregation]
    Cash[cashBookService]
    Bank[bankBalanceService]
    Ledger[ledgerService]
    DBRep[dailyBookReportService]
  end

  TxnAPI -->|"getCashBook"| Cash
  TxnAPI -->|"getBankBook"| Bank
  PartyAPI -->|"getLedger"| Ledger
  RepAPI --> DBRep
  Cash -->|"Transactions_excl_Expense_Consumption_sources"| TxnCreate
  Cash -->|"Expense_and_Consumption_totals_skip_BankTransfer"| ExpTotal
```

**Two-way behaviour found in code:**

| Direction | Mechanism |
|-----------|-----------|
| Source → Daily Book / Transaction | `syncTransactionFromOrder`, `syncTransactionFromRawMaterial`, manual `POST /transactions` |
| Daily Book expense totals → Expense | `createDailyBookExpenseTotal` (no Transaction row) |
| Transaction → source | `syncSourceFromTransaction` on update |
| Transaction delete → source / Expense | `cascadeDeleteSource` or `deleteLinkedExpenseForBankTransfer` |
| Cash book read | Merges Transactions + Expense + ConsumptionMaterial; Bank Transfer expenses excluded from cash out |

---

## 6. Expense Structure Tree

Exact tree from `backend/utils/wireConfig.js` → `EXPENSE_CATEGORY_TREE`.

```mermaid
flowchart TD
  Root[Expense_Categories]

  Root --> Labour
  Labour --> LS[Labour_Salary]
  Labour --> LA[Labour_Advance]
  Labour --> LT[Labour_Tea]
  Labour --> LF[Labour_Food]
  Labour --> PL[Petrol_Labour]
  Labour --> LM[Miscellaneous]

  Root --> Rental
  Rental --> CR[Coil_Rental]
  Rental --> WR[Wire_Rental]
  Rental --> RM[Miscellaneous]

  Root --> Operations
  Operations --> WS[Weight_Scale_Payment]
  Operations --> HM[Hardware_Maintenance]
  Operations --> EL[Electricity]
  Operations --> OE[Office_Expense]
  Operations --> OM[Miscellaneous]

  Root --> Manufacturing
  Manufacturing --> AN[Annealing]
  Manufacturing --> MM[Miscellaneous]

  Root --> SelfExpense[Self_Expense]
  SelfExpense --> Fayyaz[Fayyaz_Expense]
  SelfExpense --> Faisal[Faisal_Expense]
  SelfExpense --> Mutual[Mutual_Expense]

  Root --> FactoryTotal[Factory_Expense_Total]
  FactoryTotal --> DailyTotal[Daily_Total]

  Root --> ProcessMaterial[Process_Material]
  ProcessMaterial --> Acid
  ProcessMaterial --> Dye
  ProcessMaterial --> Soap
  ProcessMaterial --> Stationary
  ProcessMaterial --> PM[Miscellaneous]
```

**Also in enum (legacy):** Salary, Bills, Maintenance, Manufacturing, Other.

**Rules from code:**

- `FACTORY_EXPENSE_GROUPS` = Labour, Rental, Operations, Manufacturing, Process Material
- Process Material **cannot** be created via Expense API (must use Consumption / Process Material stock)
- Worker Payment → Labour / Labour Salary; Advance → Labour / Labour Advance
- Rental may also store `coilType` and `rentalRoute` on Expense documents

---

## 7. Order Lifecycle Flowchart

States and triggers from `Order` model and `orderController.js`.

```mermaid
flowchart TD
  Create[POST_orders_create] --> Outer[Outer_default]

  Outer -->|"PUT_status_In_Process"| InProcess[In_Process]
  InProcess -->|"sets_heatingStartDate_if_empty"| InProcess

  Outer -->|"PUT_status_Done"| Done[Done]
  InProcess -->|"PUT_status_Done"| Done

  Done -->|"sets_deliveryDate"| DoneMeta[Done_side_effects]
  DoneMeta -->|"deduct_stockPendingKg_if_any"| Stock[RawMaterial_stock]
  DoneMeta -->|"clear_stockPendingKg_lowStockAlert"| Done
  DoneMeta -->|"heatingEndDate_if_finalWeightKg"| Done

  Outer -->|"PUT_status_Outer"| Outer
  InProcess -->|"PUT_status_Outer"| Outer
  Done -->|"PUT_status_allowed_enum"| Outer

  Create -->|"deductStockByCategory_unless_annealed"| Stock
  Create -->|"Daily_customer"| MoneyIn[Transaction_MoneyIn]
  Create -->|"isAnnealed"| AnnSold[Annealing_Sold]

  FinalW[PUT_final_weight] -->|"recalc_totalAmount_amountDue"| Outer
  FinalW --> InProcess
  FinalW --> Done

  WireRet[POST_orders_return] --> RetDone[Order_isReturn_status_Done]
  WireRet --> Ready[ReadyStock_Customer_Return]

  Delete[DELETE_orders] -->|"restoreStock"| Stock
  Delete -->|"deleteTransactionsForSource"| MoneyIn
  Delete -->|"release_Annealing_Sold"| AnnSold
```

Valid status enum: `Outer` | `In Process` | `Done` (validated in `updateOrderStatus`).

---

## 8. Profit and Loss Calculation Diagram

From `backend/utils/profitReportService.js` → `buildProfitReport`.

```mermaid
flowchart TB
  subgraph inputs [Inputs]
    Sales[Orders_not_return]
    WireRet[Orders_isReturn]
    Purch[RawMaterials_not_return]
    CoilRet[RawMaterials_isReturn]
    Deliv[JobWork_deliveries_in_range]
    ProcPay[Transactions_MoneyIn_Processing_customers]
    FactExp[Expenses_not_Self_Expense]
    SelfExp[Expenses_Self_Expense]
    Cons[ConsumptionMaterial_totalCost]
  end

  Sales --> NetRev["netMainRevenue = sales - wireReturns"]
  WireRet --> NetRev
  Purch --> NetMat["netMaterialCost = purchases - coilReturns"]
  CoilRet --> NetMat
  NetRev --> MainGross["main.grossProfit = netRevenue - netMaterialCost"]
  NetMat --> MainGross

  Deliv --> Labour["labourEarned = sum labourAmount"]
  ProcPay --> LabOut["labourOutstanding = labourEarned - labourReceived"]
  Labour --> LabOut

  MainGross --> MainNet["main.netProfit = mainGross - factoryExpenses - consumption"]
  FactExp --> MainNet
  Cons --> MainNet

  MainGross --> CombGross["combined.grossProfit = mainGross + labourEarned"]
  Labour --> CombGross

  CombGross --> Op["operatingProfit = combinedGross - factoryExpenses - consumption"]
  FactExp --> Op
  Cons --> Op

  Op --> Final["finalNetProfit = operatingProfit - selfExpenses"]
  SelfExp --> Final
```

**Scopes returned in code:** `main`, `processing`, `combined` (plus annealing informational rows/pools).

---

## 9. Raw Material Mapping

From `backend/utils/wireConfig.js` defaults; coil category can be overridden on order/sale/production.

```mermaid
flowchart LR
  subgraph coils [Coil_Categories]
    Shiplet[Shiplet_Coil]
    Patri[Patri_Coil]
  end

  subgraph wires [Wire_Definitions]
    W1to19["Wire_1_to_19"]
    W20["Binding_Wire_20"]
  end

  Shiplet -->|"getCoilCategoryForWire_default"| W1to19
  Patri -->|"getCoilCategoryForWire_default"| W20

  W1to19 -->|"stock_deduct_uses_coilCategory"| StockLots[RawMaterial_lots_by_coilCategory]
  W20 --> StockLots

  Override[body.coilCategory_override] -.->|"Orders_DailyBook_ReadyStock"| StockLots
```

**Stock rules in `stockService.js`:**

- Deduct FIFO within chosen `coilCategory` (`purchaseDate` ascending)
- Low stock threshold: category total &lt; 1000 kg

**Consumption materials (separate from coils):** Acid, Dye, Soap, Stationary.

---

## 10. Frontend Component Tree

Hierarchy from `index.js`, `App.jsx`, and page imports.

```mermaid
flowchart TD
  Index[index.js]
  Index --> Theme[ThemeProvider_theme.js]
  Index --> Auth[AuthProvider_AuthContext]
  Auth --> App[App.jsx]

  App --> Login[LoginPage]
  App --> PR[ProtectedRoute]

  PR --> Layout[AppLayout]
  Layout --> Nav[Navbar]
  Layout --> Side[Sidebar]
  Layout --> PageSlot[Page_Outlet]

  PageSlot --> Dashboard
  PageSlot --> Suppliers
  PageSlot --> RawMaterials
  PageSlot --> LowStockAlerts
  PageSlot --> Customers
  PageSlot --> Orders
  PageSlot --> DailyBook
  PageSlot --> BankAccounts
  PageSlot --> Expenses
  PageSlot --> Workers
  PageSlot --> ReadyStock
  PageSlot --> Reports

  Dashboard --> StatCards
  Dashboard --> DashboardCharts

  Customers --> LedgerDialog
  Customers --> ExportButtons
  Customers --> ConfirmDialog

  Suppliers --> LedgerDialog
  Suppliers --> ExportButtons
  Suppliers --> ConfirmDialog

  Orders --> StatusBadge
  Orders --> ConfirmDialog

  DailyBook --> DateRangePicker
  DailyBook --> ConfirmDialog
  DailyBook --> LedgerDialog
  DailyBook --> DailyBookReportDialog
  DailyBook --> useDailyBookSession

  DailyBookReportDialog --> reportsAPI
  DailyBookReportDialog --> dailyBookReportExport

  BankAccounts --> ConfirmDialog
  Expenses --> DateRangePicker
  Expenses --> ConfirmDialog
  Workers --> ConfirmDialog
  ReadyStock --> ConfirmDialog

  Reports --> managementReportExport
  LedgerDialog --> ledgerExport
  ExportButtons --> xlsx_jspdf
```

Shared API layer: all pages (except Login via AuthContext) use `services/api.js`.

---

## 11. API Routes Map

Mounts from `server.js`. **Public** = no JWT. **Protected** = `authMiddleware` on the mount (or route-level for auth profile/password).

```mermaid
flowchart TB
  API["/api"]

  subgraph auth [auth_routes]
    LoginRoute["POST_/login_PUBLIC"]
    Profile["GET_/profile_JWT"]
    ChPwd["PUT_/change-password_JWT"]
  end

  subgraph protected [All_other_mounts_PROTECTED]
    SuppliersR["/suppliers"]
    RawR["/raw-materials"]
    CustR["/customers"]
    OrdR["/orders"]
    TxnR["/transactions"]
    ExpR["/expenses"]
    RepR["/reports"]
    DashR["/dashboard"]
    ConsR["/consumption"]
    ReadyR["/ready-stock"]
    CfgR["/config"]
    AnnR["/annealing"]
    JobR["/jobwork"]
    WorkR["/workers"]
  end

  API --> auth
  API --> protected
```

### Endpoints by module

| Module | Auth | Endpoints |
|--------|------|-----------|
| **auth** | Public: login; JWT: profile, change-password | `POST /login`, `GET /profile`, `PUT /change-password` |
| **suppliers** | Protected | `GET/POST /`, `GET/PUT/DELETE /:id`, `GET /:id/ledger`, `GET /:id/purchases` |
| **raw-materials** | Protected | `GET /`, `POST /`, `PUT/DELETE /:id`, `GET /stock-summary`, `GET /low-stock`, `POST /reconcile-pending`, `POST /return` |
| **customers** | Protected | `GET/POST /`, `GET/PUT/DELETE /:id`, `GET /:id/orders`, `GET /:id/payment-history`, `GET /:id/ledger`, `POST /:id/add-payment` |
| **orders** | Protected | `GET/POST /`, `GET/PUT/DELETE /:id`, `GET /check-stock`, `GET /by-status/:status`, `POST /return`, `PUT /:id/status`, `PUT /:id/final-weight` |
| **transactions** | Protected | `GET/POST /`, `GET/PUT/DELETE /:id`, `GET /summary`, `GET /daily/:date`, `GET /cashbook`, `POST /cashbook/opening`, `GET /cashbook/previous-closing`, `GET /bank-book`, `GET /bank-persons`, `GET/POST /bank-book/opening` |
| **expenses** | Protected | `GET/POST /`, `PUT/DELETE /:id`, `GET /summary`, `GET /breakdown` |
| **reports** | Protected | `GET /profit-loss`, `GET /financial`, `GET /customer/:id`, `GET /inventory`, `GET /daily-book` |
| **dashboard** | Protected | `GET /stats`, `GET /charts` |
| **consumption** | Protected | `GET /analysis`, `GET /stock`, `GET/POST /materials`, `PUT/DELETE /materials/:id`, `GET/POST /usage` |
| **ready-stock** | Protected | `GET /`, `GET /summary`, `POST /`, `DELETE /:id` |
| **config** | Protected | `GET /wires` |
| **annealing** | Protected | `GET /`, `POST /`, `POST /arrival`, `GET /summary`, `GET /pending`, `PUT/DELETE /:id` |
| **jobwork** | Protected | `GET /`, `POST /`, `GET /stock`, `GET /pools`, `POST /pool-deliver`, `POST /:id/delivery`, `PUT/DELETE /:id/delivery/:deliveryId`, `PUT/DELETE /:id` |
| **workers** | Protected | `GET/POST /`, `GET/PUT/DELETE /:id`, `GET /:id/ledger`, `POST /:id/entries`, `PUT/DELETE /:id/entries/:entryId` |

---

## Connections Summary

Plain English cross-module links found in the code:

1. When an **Order is created** → **RawMaterial stock is reduced** because `deductStockByCategory` runs (unless the sale is annealed).
2. When an **Order is created for a Daily customer** → a **Transaction Money In** is created because `syncTransactionFromOrder` runs.
3. When an **annealed Order is created** → an **Annealing Sold** record is created and linked because the order controller writes annealing consumption.
4. When an **Order is created/updated/deleted or final weight changes** → **Customer totals** update because `recalcCustomerTotals` is called.
5. When an **Order is deleted** → **stock is restored**, **Order-sourced Transactions are deleted**, and **Annealing Sold is released** via delete helpers in the order controller / sync service.
6. When a **wire return** is posted → a **return Order** and a **ReadyStock (Customer Return)** row are created, then customer totals recalculate.
7. When a **RawMaterial purchase** is created with `amountPaid > 0` → a **Transaction Money Out** to the supplier is synced via `syncTransactionFromRawMaterial`.
8. When a **RawMaterial purchase/return** happens → **Supplier totals** recalculate via `recalcSupplierTotals`.
9. When **coil stock increases** → **pending Orders may be fulfilled** because `stockService` reconcile / fulfil logic runs (also on server startup).
10. When **Daily Book records FactoryExpense or SelfExpense** → an **Expense day total** is upserted via `createDailyBookExpenseTotal` and **no Transaction row** is created for that path.
11. When **Daily Book records ATMWithdrawal** → a **Bank Transfer Money Out Transaction** and a **linked Self Expense** are created.
12. When a **bank transfer Transaction is saved with recordAsExpense** → a **linked Expense** is created/updated via `createLinkedExpenseForBankTransfer` / sync helpers.
13. When a **Transaction related to Customer/Supplier is created/updated/deleted** → **party totals** recalculate.
14. When a **Transaction is updated** → the **source Order / RawMaterial / Expense / ConsumptionMaterial** may update because `syncSourceFromTransaction` runs.
15. When a **non-bank Transaction is deleted** → the **source document may be cascade-deleted** via `cascadeDeleteSource`.
16. When a **bank Transaction is deleted** → its **linked Expense is deleted** via `deleteLinkedExpenseForBankTransfer`.
17. When an **Expense with bankTransactionId is updated/deleted** → the **linked Transaction** may be updated or removed in the expense controller.
18. When a **JobWork delivery is added/updated/deleted** → **Customer totals** recalculate (labour receivable).
19. When an **Annealing Arrival of own Patri Coil** completes → a **RawMaterial factory lot** may be created in the annealing controller.
20. When a **Worker Payment or Advance entry** is saved → an **Expense** (Labour Salary / Labour Advance) is created or updated and stored on `expenseId`.
21. When a **Worker entry is changed away from Payment/Advance or deleted** → the **linked Expense is deleted**.
22. When a **Customer and Supplier are linked** → both `linkedSupplierId` and `linkedCustomerId` are set bidirectionally via `partyLinkService`.
23. When the **cash book is read** → it combines **Transactions** (excluding Expense/ConsumptionMaterial sources) with **Expense and ConsumptionMaterial totals**, skipping Bank Transfer expenses for cash out.
24. When the **bank book is read** → it uses **BankAccountOpening** plus **Bank Transfer Transactions** via `bankBalanceService`.
25. When **Reports / Dashboard profit stats** run → they call **`buildProfitReport`**, which aggregates Orders, RawMaterials, JobWork, Expenses, ConsumptionMaterial, and Processing payments.
26. When the **server starts** → **`reconcileAllPendingOrders`** runs so historical pending stock can be fulfilled after DB connect.
