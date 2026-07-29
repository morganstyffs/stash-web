import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { HomePage } from './pages/HomePage'
import { HistoryPage } from './pages/HistoryPage'
import { AddPage } from './pages/AddPage'
import { StockPage } from './pages/StockPage'
import { StockIntakePage } from './pages/StockIntakePage'
import { StockQueuePage } from './pages/StockQueuePage'
import { BudgetPage } from './pages/BudgetPage'
import { SettingsPage } from './pages/SettingsPage'

/**
 * Routes for the 10 screens. Tabbed screens live under <AppLayout> (bottom nav
 * on mobile / nav rail on tablet). Full-screen flows (add, stock intake, queue)
 * render standalone with their own back affordance, matching the mockups.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Public auth-recovery routes — /reset-password must be reachable while the
  // recovery session is being established from the email link's URL fragment.
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/stock', element: <StockPage /> },
          { path: '/budget', element: <BudgetPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      // full-screen flows (no bottom nav)
      { path: '/add', element: <AddPage /> },
      { path: '/stock/intake', element: <StockIntakePage /> },
      { path: '/stock/queue', element: <StockQueuePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
