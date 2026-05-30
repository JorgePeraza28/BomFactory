import { useAuth } from './useAuth'

export type Role = 'admin' | 'produccion'

// Map emails → roles. Add more entries as needed.
const ROLE_MAP: Record<string, Role> = {
  'produccion@bomfactory.com': 'produccion',
}

export interface Permissions {
  role: Role
  canViewDashboard: boolean
  canViewOrders: boolean
  canViewBOMs: boolean
  canViewInventory: boolean
  canViewRestock: boolean
  canViewProduction: boolean
  canDownloadInvoice: boolean
  canCreateOrder: boolean
}

const ADMIN_PERMS: Permissions = {
  role: 'admin',
  canViewDashboard: true,
  canViewOrders: true,
  canViewBOMs: true,
  canViewInventory: true,
  canViewRestock: true,
  canViewProduction: true,
  canDownloadInvoice: true,
  canCreateOrder: true,
}

const PRODUCCION_PERMS: Permissions = {
  role: 'produccion',
  canViewDashboard: false,
  canViewOrders: true,
  canViewBOMs: false,
  canViewInventory: true,
  canViewRestock: false,
  canViewProduction: true,
  canDownloadInvoice: false,
  canCreateOrder: false,
}

export function useRole(): Permissions {
  const { user } = useAuth()
  const role = user?.email ? (ROLE_MAP[user.email] ?? 'admin') : 'admin'
  return role === 'produccion' ? PRODUCCION_PERMS : ADMIN_PERMS
}
