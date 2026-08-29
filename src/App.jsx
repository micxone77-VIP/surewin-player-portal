// App.jsx ? Player Portal root
// Completely separate from CRM App.jsx. No shared context or routes.
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PlayerAuthProvider } from './context/PlayerAuthContext'
import PortalRequireAuth from './components/PortalRequireAuth'
import PortalLayout from './components/PortalLayout'

// Pages (shells in Step 1; implemented in Steps 4?9)
import Login          from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard    from './pages/Dashboard'
import Campaigns    from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import Rewards      from './pages/Rewards'
import Notifications from './pages/Notifications'
import Profile      from './pages/Profile'

export default function App() {
  return (
    <PlayerAuthProvider>
      <BrowserRouter>
        <Routes>
          {/* -- Public routes --------------------------------------- */}
          <Route path="/login"           element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* -- Protected routes (require player session) ----------- */}
          <Route element={
            <PortalRequireAuth>
              <PortalLayout />
            </PortalRequireAuth>
          }>
            <Route path="/dashboard"          element={<Dashboard />} />
            <Route path="/campaigns"          element={<Campaigns />} />
            <Route path="/campaigns/:id"      element={<CampaignDetail />} />
            <Route path="/rewards"            element={<Rewards />} />
            <Route path="/notifications"      element={<Notifications />} />
            <Route path="/profile"            element={<Profile />} />
          </Route>

          {/* -- Root redirect --------------------------------------- */}
          <Route path="/"  element={<Navigate to="/dashboard" replace />} />
          <Route path="*"  element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </PlayerAuthProvider>
  )
}
