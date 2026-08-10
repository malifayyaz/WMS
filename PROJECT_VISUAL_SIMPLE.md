# WMS — Simple Visual Guide

Pictures of how the factory software works, with everyday labels.  
For technical diagram labels, see `PROJECT_VISUAL.md`. For full written explanation, see `PROJECT_DOCUMENTATION_SIMPLE.md`.

---

## 1. Big picture — how the system is put together

```mermaid
flowchart TB
  You[You_on_phone_or_computer] --> Website[Website_screens]
  Website --> Office[Office_program_server]
  Office --> Filing[(Filing_cabinet_database)]
  Office --> Brain[Cloud_chatbot_brain_Groq]
  ChatBtn[Chat_button_on_screen] --> Website
```

**In plain words:** You use the website. The website asks the office program. The office program keeps records in the database. The chatbot also goes through the office program — there is no separate AI computer to deploy.

---

## 2. Login and permissions

```mermaid
flowchart TD
  Start[Open_login_page] --> Type[Enter_username_and_password]
  Type --> Ok{Correct?}
  Ok -->|No_5_times| Lock[Locked_for_5_minutes]
  Ok -->|Yes| In[Enter_the_app]
  In --> Role{Admin_or_Viewer?}
  Role -->|Admin| Full[Can_change_data_and_use_Agent]
  Role -->|Viewer| Look[Can_look_and_Ask_only]
  Idle[Leave_idle_about_2_hours] --> Out[Auto_logout]
```

---

## 3. What the main screens cover

```mermaid
flowchart LR
  subgraph overview [Overview]
    Dash[Dashboard]
  end
  subgraph buy [Buying]
    Sup[Suppliers]
    Coil[Coil_stock]
    Low[Low_stock_alerts]
  end
  subgraph sell [Selling]
    Cust[Customers]
    Ord[Orders]
    Ready[Ready_wire_stock]
  end
  subgraph money [Money]
    Daily[Daily_Book]
    Bank[Bank]
    Exp[Expenses]
    Work[Workers]
  end
  subgraph insight [Insight]
    Rep[Reports]
    Chat[Chat_helper]
  end
  subgraph settings [Settings_admins]
    Users[Users]
    Sec[Security_logs]
  end
```

---

## 4. Buying coils → making / selling wire → money

```mermaid
flowchart TD
  Buy[Buy_coils_from_supplier] --> Stock[Coil_stock_goes_up]
  Stock --> Sell[Sell_wire_to_customer]
  Sell --> StockDown[Coil_stock_goes_down_oldest_first]
  Sell --> CustomerOwes[Customer_balance_updates]
  Buy --> SupplierOwes[Supplier_balance_updates]
  Sell --> MoneyIn[Money_in_when_paid]
  Buy --> MoneyOut[Money_out_when_you_pay]
  StockDown --> Pending{Enough_coil?}
  Pending -->|No| Wait[Sale_saved_but_waiting_for_stock]
  Wait --> Later[New_purchase_fills_the_gap]
```

---

## 5. Order stages (customer sale)

```mermaid
flowchart LR
  Outer[Outer_just_entered] --> Heat[In_Process_heating]
  Heat --> Done[Done_finished_or_delivered]
  Done --> FinalWt[Optional_final_weight_updates_amount]
```

---

## 6. Daily Book — today’s notebook

```mermaid
flowchart TB
  DB[Daily_Book]
  DB --> Cash[Cash_Book]
  DB --> DailyCust[Daily_Customers]
  DB --> LedgerCust[Ledger_Customers]
  DB --> SupTab[Suppliers]
  DB --> Ann[Annealing]
  DB --> Proc[Processing_Work]
  Cash --> Holders[Who_is_holding_cash]
  BankPage[Bank_page] --> Banks[MBL_UBL_Faisal_Other]
```

**Plain meaning:** One place for today’s cash, customers, suppliers, annealing, and processing work. Bank details also live on the Bank page.

---

## 7. Annealing in three steps

```mermaid
flowchart LR
  Send[Send_metal_out] --> Away[Being_annealed]
  Away --> Back[Arrival_metal_returns]
  Back --> Sold[Sold_when_customer_buys]
```

---

## 8. Processing work (customer’s own coil)

```mermaid
flowchart TD
  Bring[Customer_brings_coil] --> Store[You_store_it]
  Store --> Deliver[You_deliver_finished_wire]
  Deliver --> Labour[Charge_labour_per_kg]
  Labour --> Profit[Shows_in_processing_profit]
```

---

## 9. How money records connect

```mermaid
flowchart LR
  Sale[Wire_sale] --> MoneyRec[Money_record]
  CoilBuy[Coil_purchase] --> MoneyRec
  Expense[Expense_or_worker_pay] --> MoneyRec
  MoneyRec --> CashView[Cash_Book_view]
  MoneyRec --> BankView[Bank_view]
  MoneyRec --> Reports[Reports]
```

---

## 10. Chatbot: Ask vs Agent

```mermaid
flowchart TD
  OpenChat[Open_chat_button]
  OpenChat --> Mode{Ask_or_Agent?}
  Mode -->|Ask_anyone| LookUp[Looks_up_live_data_and_answers]
  Mode -->|Agent_admin_only| Draft[Shows_preview_of_change]
  Draft --> Confirm{You_confirm?}
  Confirm -->|Yes| Save[Saves_like_a_normal_form]
  Confirm -->|No| Cancel[Nothing_saved]
  Save --> Undo[Optional_Undo]
```

**Remember:** Ask = answers only. Agent = can change data after you say yes.

---

## 11. Who talks to whom (simple map)

```mermaid
flowchart TB
  Users[People_using_the_app] --> Screens[Website_screens]
  Screens --> Server[Office_program]
  Server --> DB[(All_factory_records)]
  Chat[Chat_helper] --> Screens
  Server --> ChatCloud[Cloud_AI]
  AdminOnly[User_and_security_screens] --> Server
```

---

## 12. Reports at a glance

```mermaid
flowchart LR
  Data[Sales_stock_expenses_processing_cash] --> PL[Profit_and_Loss]
  Data --> CB[Cash_and_Bank]
  Data --> Inv[Inventory]
  Data --> CustR[Customer_report]
  PL --> Export[Excel_or_PDF_export]
  CB --> Export
  Inv --> Export
  CustR --> Export
```

---

## How to read these pictures

- Boxes are steps or screens.  
- Arrows mean “leads to” or “updates”.  
- Admin-only paths are called out in the login and chatbot diagrams.  
- Nothing here invents features — it mirrors the live WMS app.
