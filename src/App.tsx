import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import BOMs from './pages/BOMs'
import Inventory from './pages/Inventory'
import Restock from './pages/Restock'
import Production from './pages/Production'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'

const qc = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="/dashboard" element={
                <RoleRoute perm="canViewDashboard">
                  <Dashboard />
                </RoleRoute>
              } />
              <Route path="/orders" element={
                <RoleRoute perm="canViewOrders">
                  <Orders />
                </RoleRoute>
              } />
              <Route path="/boms" element={
                <RoleRoute perm="canViewBOMs">
                  <BOMs />
                </RoleRoute>
              } />
              <Route path="/inventory" element={
                <RoleRoute perm="canViewInventory">
                  <Inventory />
                </RoleRoute>
              } />
              <Route path="/restock" element={
                <RoleRoute perm="canViewRestock">
                  <Restock />
                </RoleRoute>
              } />
              <Route path="/production" element={
                <RoleRoute perm="canViewProduction">
                  <Production />
                </RoleRoute>
              } />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
