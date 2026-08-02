# Wire Manufacturing Management System (WMS)

Full-stack web application for a wire manufacturing business: suppliers, raw materials, customers, orders, daily book, expenses, and reports. Built with **React + MUI**, **Node.js + Express**, **MongoDB**, and **JWT** authentication.

## Tech Stack

- **Frontend:** React 18, Material UI (MUI), React Router, Axios, Recharts, xlsx, jspdf, date-fns, dayjs
- **Backend:** Node.js, Express, Mongoose, JWT, bcryptjs, dotenv, cors
- **Database:** MongoDB

## Prerequisites

- Node.js (v16+)
- MongoDB running locally or connection URI

## Setup

### 1. Backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and set:

- `MONGODB_URI` – e.g. `mongodb://localhost:27017/wire-manufacturing`
- `JWT_SECRET` – at least 32 characters

```bash
# Seed initial users (dad, uncle, admin / password: factory123)
node seed.js

# Start API server (default port 5000)
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
```

Optional: create `frontend/.env` and set `REACT_APP_API_URL=http://localhost:5000/api` if the API is not on the same host.

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). Log in with e.g. **admin** / **factory123**.

## Features

- **Auth:** JWT login, protected routes, logout
- **Suppliers:** CRUD, view purchases
- **Raw Materials:** Record purchases, stock summary, low stock (&lt; 1000 kg) alerts
- **Customers:** CRUD, order history, payment history, add payment
- **Orders:** Create order (Outer → In Process → Done), set final weight after heating, amount auto-calculation
- **Daily Book:** Money In/Out transactions, date range, summary
- **Expenses:** CRUD by type (Salary, Bills, Maintenance, etc.)
- **Dashboard:** Revenue, expenses, pending, active orders, low stock count, charts (revenue vs expenses, orders by status, top customers)
- **Reports:** Profit & Loss, Financial, Inventory; PDF and Excel export

## Default Users (after seed)

| Name   | Username | Password     |
|--------|----------|--------------|
| Dad    | dad      | factory123   |
| Uncle  | uncle    | factory123   |
| Admin  | admin    | factory123   |

## API Base URL

Backend runs at `http://localhost:5000`. All routes except `POST /api/auth/login` require `Authorization: Bearer <token>`.

## License

Private / project use.
