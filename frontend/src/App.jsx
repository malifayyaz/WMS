import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Suppliers from './pages/Suppliers';
import RawMaterials from './pages/RawMaterials';
import LowStockAlerts from './pages/LowStockAlerts';
import Customers from './pages/Customers';
import Orders from './pages/Orders';
import DailyBook from './pages/DailyBook';
import BankAccounts from './pages/BankAccounts';
import Cheques from './pages/Cheques';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import ReadyStock from './pages/ReadyStock';
import Workers from './pages/Workers';
import UserManagement from './pages/UserManagement';
import SecuritySettings from './pages/SecuritySettings';
import Receivables from './pages/Receivables';
import Payables from './pages/Payables';
import PersonalPayments from './pages/PersonalPayments';
import BalanceSheet from './pages/BalanceSheet';
import PeriodClose from './pages/PeriodClose';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout title="Dashboard">
              <Dashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute>
            <AppLayout title="Suppliers">
              <Suppliers />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/raw-materials"
        element={
          <ProtectedRoute>
            <AppLayout title="Raw Materials">
              <RawMaterials />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/low-stock"
        element={
          <ProtectedRoute>
            <AppLayout title="Low Stock Alerts">
              <LowStockAlerts />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <AppLayout title="Customers">
              <Customers />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <AppLayout title="Orders">
              <Orders />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily-book"
        element={
          <ProtectedRoute>
            <AppLayout title="Daily Book">
              <DailyBook />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bank"
        element={
          <ProtectedRoute>
            <AppLayout title="Bank Account">
              <BankAccounts />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cheques"
        element={
          <ProtectedRoute>
            <AppLayout title="Cheque Management">
              <Cheques />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <AppLayout title="Expenses">
              <Expenses />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/workers"
        element={
          <ProtectedRoute>
            <AppLayout title="Workers">
              <Workers />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ready-stock"
        element={
          <ProtectedRoute>
            <AppLayout title="Ready Stock">
              <ReadyStock />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <AppLayout title="Reports">
              <Reports />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <AppLayout title="User Management">
              <UserManagement />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/receivables"
        element={
          <ProtectedRoute>
            <AppLayout title="Receivables">
              <Receivables />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payables"
        element={
          <ProtectedRoute>
            <AppLayout title="Payables">
              <Payables />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-payments"
        element={
          <ProtectedRoute>
            <AppLayout title="Personal Payments">
              <PersonalPayments />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/balance-sheet"
        element={
          <ProtectedRoute>
            <AppLayout title="Balance Sheet">
              <BalanceSheet />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/security"
        element={
          <ProtectedRoute>
            <AppLayout title="Security & Logs">
              <SecuritySettings />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/period-close"
        element={
          <ProtectedRoute>
            <AppLayout title="Period Close & Fresh Start">
              <PeriodClose />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
