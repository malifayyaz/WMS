import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// Suppliers
export const suppliersAPI = {
  getAll: (params) => api.get('/suppliers', { params }),
  getById: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
  getPurchases: (id) => api.get(`/suppliers/${id}/purchases`),
  getLedger: (id, params) => api.get(`/suppliers/${id}/ledger`, { params }),
};

// Raw Materials
export const rawMaterialsAPI = {
  reconcilePending: () => api.post('/raw-materials/reconcile-pending'),
  getAll: (params) => api.get('/raw-materials', { params }),
  getStockSummary: () => api.get('/raw-materials/stock-summary'),
  getLowStock: () => api.get('/raw-materials/low-stock'),
  create: (data) => api.post('/raw-materials', data),
  createReturn: (data) => api.post('/raw-materials/return', data),
  update: (id, data) => api.put(`/raw-materials/${id}`, data),
  delete: (id) => api.delete(`/raw-materials/${id}`),
};

export const configAPI = {
  getWires: () => api.get('/config/wires'),
};

export const consumptionAPI = {
  getMaterials: (params) => api.get('/consumption/materials', { params }),
  createMaterial: (data) => api.post('/consumption/materials', data),
  updateMaterial: (id, data) => api.put(`/consumption/materials/${id}`, data),
  deleteMaterial: (id) => api.delete(`/consumption/materials/${id}`),
  getStock: () => api.get('/consumption/stock'),
  getUsage: (params) => api.get('/consumption/usage', { params }),
  recordUsage: (data) => api.post('/consumption/usage', data),
  getAnalysis: (params) => api.get('/consumption/analysis', { params }),
};

export const readyStockAPI = {
  getAll: (params) => api.get('/ready-stock', { params }),
  getSummary: () => api.get('/ready-stock/summary'),
  create: (data) => api.post('/ready-stock', data),
  delete: (id) => api.delete(`/ready-stock/${id}`),
};

// Customers
export const customersAPI = {
  getAll: (params) => api.get('/customers', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  getOrders: (id) => api.get(`/customers/${id}/orders`),
  getPaymentHistory: (id) => api.get(`/customers/${id}/payment-history`),
  addPayment: (id, data) => api.post(`/customers/${id}/add-payment`, data),
  getLedger: (id, params) => api.get(`/customers/${id}/ledger`, { params }),
};

// Orders
export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  getByStatus: (status) => api.get(`/orders/by-status/${status}`),
  checkStock: (params) => api.get('/orders/check-stock', { params }),
  create: (data) => api.post('/orders', data),
  createReturn: (data) => api.post('/orders/return', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  updateStatus: (id, status) => api.put(`/orders/${id}/status`, { status }),
  updateFinalWeight: (id, data) => api.put(`/orders/${id}/final-weight`, data),
  delete: (id) => api.delete(`/orders/${id}`),
};

// Transactions
export const transactionsAPI = {
  getAll: (params) => api.get('/transactions', { params }),
  getSummary: (params) => api.get('/transactions/summary', { params }),
  getDaily: (date) => api.get(`/transactions/daily/${date}`),
  getCashBook: (params) => api.get('/transactions/cashbook', { params }),
  setCashOpening: (data) => api.post('/transactions/cashbook/opening', data),
  setCashBreakdown: (data) => api.post('/transactions/cashbook/breakdown', data),
  getPreviousClosing: (params) => api.get('/transactions/cashbook/previous-closing', { params }),
  getBankBook: (params) => api.get('/transactions/bank-book', { params }),
  getBankPersons: () => api.get('/transactions/bank-persons'),
  getBankOpenings: () => api.get('/transactions/bank-book/opening'),
  setBankOpening: (data) => api.post('/transactions/bank-book/opening', data),
  getById: (id) => api.get(`/transactions/${id}`),
  create: (data) => api.post('/transactions', data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  delete: (id) => api.delete(`/transactions/${id}`),
  returnCheque: (id, data) => api.put(`/transactions/${id}/return-cheque`, data),
};

// Cheques
export const chequesAPI = {
  getAll: (params) => api.get('/cheques', { params }),
  getInHand: () => api.get('/cheques/in-hand'),
  getSummary: (params) => api.get('/cheques/summary', { params }),
  getById: (id) => api.get(`/cheques/${id}`),
  create: (data) => api.post('/cheques', data),
  endorse: (id, data) => api.post(`/cheques/${id}/endorse`, data),
  deposit: (id, data) => api.post(`/cheques/${id}/deposit`, data),
  updateStatus: (id, data) => api.patch(`/cheques/${id}/status`, data),
  update: (id, data) => api.put(`/cheques/${id}`, data),
  delete: (id) => api.delete(`/cheques/${id}`),
};

// Expenses
export const expensesAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  getSummary: (params) => api.get('/expenses/summary', { params }),
  getBreakdown: (params) => api.get('/expenses/breakdown', { params }),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  breakdown: (id, data) => api.post(`/expenses/${id}/breakdown`, data),
};

// Annealing
export const annealingAPI = {
  getAll: (params) => api.get('/annealing', { params }),
  getSummary: (params) => api.get('/annealing/summary', { params }),
  create: (data) => api.post('/annealing', data),
  createArrival: (data) => api.post('/annealing/arrival', data),
  update: (id, data) => api.put(`/annealing/${id}`, data),
  delete: (id) => api.delete(`/annealing/${id}`),
};

// Job Work (customer coil manufactured into wire, labour charged per kg)
export const jobWorkAPI = {
  getAll: (params) => api.get('/jobwork', { params }),
  getStock: () => api.get('/jobwork/stock'),
  getPools: (params) => api.get('/jobwork/pools', { params }),
  create: (data) => api.post('/jobwork', data),
  poolDeliver: (data) => api.post('/jobwork/pool-deliver', data),
  addDelivery: (id, data) => api.post(`/jobwork/${id}/delivery`, data),
  updateDelivery: (id, deliveryId, data) => api.put(`/jobwork/${id}/delivery/${deliveryId}`, data),
  deleteDelivery: (id, deliveryId) => api.delete(`/jobwork/${id}/delivery/${deliveryId}`),
  update: (id, data) => api.put(`/jobwork/${id}`, data),
  delete: (id) => api.delete(`/jobwork/${id}`),
};

// Dashboard
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getCharts: () => api.get('/dashboard/charts'),
  getActivity: (params) => api.get('/dashboard/activity', { params }),
};

// Reports
export const reportsAPI = {
  getProfitLoss: (params) => api.get('/reports/profit-loss', { params }),
  getFinancial: (params) => api.get('/reports/financial', { params }),
  getCustomerReport: (id) => api.get(`/reports/customer/${id}`),
  getInventory: () => api.get('/reports/inventory'),
  getDailyBook: (params) => api.get('/reports/daily-book', { params }),
};

export const workersAPI = {
  getAll: (params) => api.get('/workers', { params }),
  getById: (id) => api.get(`/workers/${id}`),
  create: (data) => api.post('/workers', data),
  update: (id, data) => api.put(`/workers/${id}`, data),
  delete: (id) => api.delete(`/workers/${id}`),
  getLedger: (id) => api.get(`/workers/${id}/ledger`),
  createEntry: (id, data) => api.post(`/workers/${id}/entries`, data),
  updateEntry: (id, entryId, data) => api.put(`/workers/${id}/entries/${entryId}`, data),
  deleteEntry: (id, entryId) => api.delete(`/workers/${id}/entries/${entryId}`),
};

export const usersAPI = {
  getAll: () => api.get('/users'),
  getStats: () => api.get('/users/stats'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  resetPassword: (id, data) => api.put(`/users/${id}/reset-password`, data),
  deactivate: (id) => api.delete(`/users/${id}`),
};

export const activityAPI = {
  getLogs: (params) => api.get('/activity-logs', { params }),
  getStats: () => api.get('/activity-logs/stats'),
};

export const aiAPI = {
  chat: (data) => api.post("/ai/chat", data),
  agentChat: (data) => api.post("/ai/agent-chat", data),
  agentExecute: (data) => api.post("/ai/agent-execute", data),
  agentUndo: (data) => api.post("/ai/agent-undo", data),
  getDailySummary: (date) =>
    api.get("/ai/daily-summary", { params: date ? { date } : {} }),
  predictProfit: () => api.get("/ai/predict-profit"),
  parseOrder: (text) => api.post("/ai/parse-order", { text }),
};

// Receivables
export const receivablesAPI = {
  getSummary: (params) => api.get('/receivables/summary', { params }),
};

// Payables
export const payablesAPI = {
  getSummary: (params) => api.get('/payables/summary', { params }),
};

// Personal Payments
export const personalPaymentsAPI = {
  getAll: (params) => api.get('/personal-payments', { params }),
  create: (data) => api.post('/personal-payments', data),
  addPayment: (id, data) => api.post(`/personal-payments/${id}/payments`, data),
  update: (id, data) => api.put(`/personal-payments/${id}`, data),
  deletePayment: (id, paymentId) => api.delete(`/personal-payments/${id}/payments/${paymentId}`),
  delete: (id) => api.delete(`/personal-payments/${id}`),
};

// Balance Sheet
export const balanceSheetAPI = {
  get: (params) => api.get('/balance-sheet', { params }),
};



