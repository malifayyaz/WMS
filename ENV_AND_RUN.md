# WMS – Environment Variables & How to Run

## Do you need .env for both frontend and backend?

| App      | .env required? | When to use it |
|----------|-----------------|----------------|
| **Backend** | **Yes**        | Always. The server needs MongoDB URI and JWT secret. |
| **Frontend** | **No** (optional) | Only if your API is not at `http://localhost:5000/api` (e.g. different port or deployed URL). |

**Summary:** Create **one .env in the backend** (required). Create **frontend .env only if** you need to point the app to a different API URL.

---

## 1. Backend .env (required)

**Location:** `WMS/backend/.env`

**Steps:**

1. Copy the example file:
   ```bash
   cd WMS/backend
   copy .env.example .env
   ```
   (On macOS/Linux use: `cp .env.example .env`)

2. Edit `backend/.env` and set these values:

```env
# Port the API server will listen on (default 5000)
PORT=5000

# MongoDB connection. Use your local or cloud MongoDB URL.
# Local example:
MONGODB_URI=mongodb://localhost:27017/wire-manufacturing

# Secret used to sign JWT tokens. Use a long random string (at least 32 characters).
JWT_SECRET=your_very_long_super_secret_key_here_min_32_chars

# How long the login token is valid (optional, default 7d)
JWT_EXPIRES_IN=7d

# development or production (optional)
NODE_ENV=development
```

**What to put:**

- **PORT** – Leave `5000` unless you want another port.
- **MONGODB_URI** – Your MongoDB URL. Examples:
  - Local: `mongodb://localhost:27017/wire-manufacturing`
  - Atlas: `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/wire-manufacturing`
- **JWT_SECRET** – Any long secret string (e.g. 32+ random characters). Never commit this to git.

---

## 2. Frontend .env (optional)

**Location:** `WMS/frontend/.env`

**When to use:** Only if the API is **not** at `http://localhost:5000/api` (e.g. different machine, port, or production URL).

**What to put:**

```env
# Full base URL of your API (including /api)
REACT_APP_API_URL=http://localhost:5000/api
```

Examples:

- Same machine, different port: `REACT_APP_API_URL=http://localhost:4000/api`
- Production: `REACT_APP_API_URL=https://your-api.com/api`

If you **don’t** create `frontend/.env`, the app already uses `http://localhost:5000/api` by default.

---

## How to run

### Run backend

1. Ensure MongoDB is running (local or reachable at `MONGODB_URI`).
2. First time only – seed users:
   ```bash
   cd WMS/backend
   node seed.js
   ```
   This creates users: **dad**, **uncle**, **admin** (password: **factory123**).
3. Start the API server:
   ```bash
   cd WMS/backend
   npm run dev
   ```
   You should see: `Server running on port 5000` and `MongoDB Connected: ...`.

### Run frontend

1. From project root:
   ```bash
   cd WMS/frontend
   npm start
   ```
2. Browser should open to `http://localhost:3000`.
3. Log in with e.g. **admin** / **factory123**.

### Order to run

1. Start **backend** first (`npm run dev` in `backend`).
2. Then start **frontend** (`npm start` in `frontend`).

---

## File and path check (all linked correctly)

- **Backend:** All routes, controllers, models, middleware, and `config/db.js` are required from correct paths in `server.js`. No broken paths.
- **Frontend:** All pages and components are imported in `App.jsx`; `DashboardCharts` uses `formatters`; `api.js` is used by pages. No broken paths.
- **Env:** Backend uses `dotenv` and reads from `backend/.env` when you run from `backend/`. Frontend only reads `REACT_APP_*` from `frontend/.env` when present.
