# Wire Manufacturing System (WMS) — Simple Guide

This guide explains how the software works in everyday language.  
It matches the real program used in the factory. No coding knowledge needed.

**Related files:**

| File | Who it is for |
|------|----------------|
| `PROJECT_DOCUMENTATION_SIMPLE.md` | This file — plain written guide |
| `PROJECT_DOCUMENTATION.md` | Engineers (technical terms) |
| `PROJECT_VISUAL_SIMPLE.md` | Pictures with plain labels |
| `PROJECT_VISUAL.md` | Pictures with technical labels |

---

## 1. What is this software?

WMS helps a **wire factory** keep track of:

- Buying **metal coils** from suppliers  
- Turning coils into **wire** and selling wire to customers  
- **Money** coming in and going out (cash and bank)  
- **Expenses**, workers’ pay, and factory costs  
- Extra work like **annealing** (heat treatment) and **processing** (customer’s own coil)  
- A **helper chatbot** that can answer questions and (for admins) enter data after you confirm  

Think of it as the factory’s digital notebook + calculator + stock room log, all in one website.

---

## 2. The three main pieces

| Piece | Plain meaning | Tech name (if curious) |
|-------|---------------|-------------------------|
| **Website screens** | What you see and click in the browser | Frontend (React) |
| **Office program** | The invisible server that saves and calculates | Backend (Express) |
| **Filing cabinet** | Where all records are stored | Database (MongoDB) |
| **Smart helper** | Chatbot brain in the cloud | Groq AI (optional key) |

You log into the website → it talks to the office program → the office program reads/writes the filing cabinet. The chatbot goes through the same office program (it does not have a separate “AI computer”).

---

## 3. Who can do what (roles)

There are two kinds of login:

| Role | Can look at data? | Can add/edit/delete? | Can use Agent chatbot? | Can manage users & security logs? |
|------|-------------------|----------------------|------------------------|-----------------------------------|
| **Admin** (boss / trusted staff) | Yes | Yes | Yes | Yes |
| **Viewer** (view-only) | Yes | No | No (Ask only) | No |

**Safety extras:**

- Wrong password **5 times** → account locked for **5 minutes**  
- If you leave the screen idle ~**2 hours**, you are logged out (you get a warning first)  
- Every important change can be recorded in a security log (admins)

---

## 4. Main screens (menu)

| Screen | What it is for |
|--------|----------------|
| **Dashboard** | Quick overview: sales, stock, charts, today’s snapshot |
| **Suppliers** | People/companies you buy coils from |
| **Coil Stock (Raw Materials)** | Coils you bought, how many kg left |
| **Low Stock** | Warning when a coil type is running low (under 1000 kg) |
| **Customers** | People/companies you sell to (Ledger, Daily, or Processing types) |
| **Orders** | Wire sales (and returns) |
| **Daily Book** | Today’s working notebook — cash, parties, annealing, processing |
| **Bank** | Bank balances and openings (MBL, UBL, Faisal, Other) |
| **Expenses** | Factory costs and “self” expenses; process chemicals |
| **Workers** | Labour people and pay/advance records |
| **Ready Stock** | Finished wire sitting ready to sell |
| **Reports** | Profit/loss, cash & bank, inventory, customer reports |
| **User Management** | Create logins (admins) |
| **Security & Logs** | Who did what (admins) |

A floating **chat button** is available on logged-in screens for the AI helper.

---

## 5. How work flows day to day

### 5.1 Buying coils

1. Add or pick a **supplier**.  
2. Record a coil **purchase** (Shiplet or Patri type, weight, rate).  
3. Stock goes up. Money owed to the supplier is updated.  
4. If you paid cash/bank, that payment is also recorded.  
5. If some customer orders were waiting for metal, the system tries to fill those gaps when new stock arrives.

### 5.2 Selling wire (orders)

1. Pick a **customer** and wire size/number.  
2. Enter weight and rate → total is calculated.  
3. The system takes coil stock using **oldest stock first** (fair warehouse order).  
4. If there is not enough coil, the sale still saves, but marks **pending stock** and may show a low-stock warning.  
5. Order stages: **Outer** → **In Process** (heating started) → **Done** (finished/delivered).  
6. After heating, you can enter a **final weight** and the amount updates.  
7. Special case: **annealed** sales use annealed material pools instead of normal coil stock.  
8. **Returns** put things back the right way (money and finished stock).

### 5.3 Daily Book (the heart of daily ops)

Open **Daily Book** and use the tabs:

1. **Cash Book** — opening cash, money in/out, closing, who is holding cash  
2. **Daily Customers** — quick day sales customers  
3. **Ledger Customers** — account customers  
4. **Suppliers** — supplier payments and activity  
5. **Annealing** — send metal out / get it back  
6. **Processing Work** — customer brought their own coil; you charge labour  

Bank work has its own **Bank** page. ATM withdrawals are recorded as money leaving the bank and arriving in cash.

### 5.4 Annealing (simple picture)

- **Send** — metal goes out for heat treatment  
- **Arrival** — metal comes back  
- **Sold** — annealed metal is sold  

These are pool tallies by party and material — not always a strict one-for-one “this batch = that batch” link.

### 5.5 Processing (job work)

Customer’s coil arrives → you store it → you deliver finished wire and charge **labour per kg**. That labour income shows up in the **processing** profit view in Reports.

### 5.6 Expenses and workers

- Record factory costs under groups like Labour, Rental, Operations, Manufacturing, Process Materials, or Self Expense.  
- Worker **payment** or **advance** can also create an expense so money and labour stay linked.  
- Process materials (Acid, Dye, Soap, Stationary) have their own stock and usage tracking.

### 5.7 Reports

- **Profit & Loss** — main business, processing labour, or both together  
- **Cash & Bank** — money position  
- **Inventory** — coils and finished wire  
- **Customer** — party-focused report  

You can export many views to Excel or PDF.

---

## 6. The AI chatbot (Ask and Agent)

### Ask mode (everyone logged in)

- Ask questions in English or Urdu-style phrasing.  
- The helper looks at **live factory data** and answers.  
- It does **not** change records in Ask mode.  
- Useful for “how much stock?”, “what did we sell?”, “who owes us?”.

### Agent mode (admins only)

1. You type what you want done (example: “add expense 5000 for electricity”).  
2. The helper shows a **preview** of what it will save.  
3. You **confirm**.  
4. It saves using the same rules as the normal screens.  
5. You can **Undo** many of those actions if you made a mistake.

Things the Agent can do (examples): create order, record payment, buy coils, add expense, cash entry, annealing send/arrive, processing delivery, add customer/supplier, ready stock, worker payment, ATM withdrawal, delete or shift date of an entry, or just answer a read question.

**Important:** Viewers never get Agent. Admins should still read the preview carefully before confirming.

Chat history stays on **your computer’s browser** (not permanently on the server).

---

## 7. How the pieces talk to each other

```
You (browser)
   → Website screens
      → Office program (API)
         → Filing cabinet (database)
         → (for AI) Groq cloud helper
```

Examples of automatic linking:

- A **sale** updates stock, customer balance, and money records.  
- A **coil purchase** updates stock and supplier balance.  
- An **expense** can create a matching money-out row.  
- **Daily Book** gathers today’s cash and party activity in one place.  
- **Reports** add everything up for owners.  
- **AI Agent** writes through the same doors as clicking Save on a form.

---

## 8. Stock ideas in plain words

| Idea | Meaning |
|------|---------|
| **Coil stock** | Raw metal rolls you bought (Shiplet / Patri) |
| **FIFO** | Use oldest coil first when selling |
| **Pending stock** | Sale recorded but not enough coil yet; filled when stock arrives |
| **Low stock** | Under 1000 kg left for that coil type |
| **Ready stock** | Finished wire ready to sell |
| **Customer’s coil (processing)** | Not your purchase — you only charge labour |

---

## 9. Money ideas in plain words

| Idea | Meaning |
|------|---------|
| **Money In / Money Out** | Cash book style entries |
| **Cash vs Bank vs Cheque** | How the money moved |
| **Opening balance** | What the cash drawer or bank started with |
| **Cash holders** | Who is physically holding today’s cash |
| **Party ledger** | Running account for one customer or supplier |
| **Opening balance on a party** | Old debt or credit when you first entered them |

---

## 10. Getting started (for operators)

1. Start the database and the office program (backend).  
2. Start the website (frontend).  
3. Log in (admins: accounts like `admin` / `dad` / `uncle`; view-only: `viewer` — passwords are set when the system is first set up; change them).  
4. Enter suppliers, customers, and opening cash/bank if needed.  
5. Record purchases and sales as work happens.  
6. Use Daily Book during the day; Reports at the end of a period.  
7. Use Ask anytime; use Agent only when you trust the preview.

---

## 11. Short glossary

| Term in the app | Plain meaning |
|-----------------|---------------|
| Order | A customer wire sale |
| Raw material / Coil stock | Metal coils you bought |
| Ready stock | Finished wire on hand |
| Daily Book | Today’s ops and cash notebook |
| Ledger customer | Customer with a running account |
| Daily customer | Customer usually settled same day |
| Processing customer | Customer who brings their own coil |
| Annealing | Sending/receiving metal for heat treatment |
| Job work / Processing Work | Labour on customer-owned coil |
| Transaction | A money in or money out record |
| Expense | A cost the factory (or owners) paid |
| Viewer | Look-only login |
| Admin | Full-control login |
| Ask | Chatbot answers only |
| Agent | Chatbot can change data after you confirm |
| JWT / token | The “pass” that proves you logged in (behind the scenes) |

---

## 12. What this guide does not invent

Everything above comes from how the real WMS program is built. If a button or report is not in the live app, it is not claimed here. For file names, API paths, and exact field lists, use the **technical** documentation instead.
