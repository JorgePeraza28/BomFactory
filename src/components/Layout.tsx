import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'

const nav = [
  {
    to: '/dashboard', label: 'Dashboard', perm: 'canViewDashboard' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    )
  },
  {
    to: '/orders', label: 'Pedidos', perm: 'canViewOrders' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 3h12l-1.5 9H4.5L3 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx="6.5" cy="15.5" r="1" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12.5" cy="15.5" r="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M1 1h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    to: '/boms', label: 'BOMs', perm: 'canViewBOMs' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 6h8M5 9h6M5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    to: '/inventory', label: 'Inventario', perm: 'canViewInventory' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L16 5.5v7L9 16 2 12.5v-7L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 2v7M2 5.5l7 3.5 7-3.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    )
  },
  {
    to: '/restock', label: 'Restock', perm: 'canViewRestock' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 14V4M4 9l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    to: '/production', label: 'Producción', perm: 'canViewProduction' as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="10" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="6.5" y="6" width="5" height="11" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="12" y="2" width="5" height="15" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    )
  },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const perms = useRole()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // Redirect produccion role away from forbidden pages
  const firstAllowed = nav.find(n => perms[n.perm])?.to ?? '/orders'

  return (
    <div className="h-screen bg-[#F5F5F7] flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col py-6 px-3 overflow-y-auto"
        style={{
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-3 mb-8">
          <div className="w-8 h-8 rounded-xl bg-[#1D1D1F] flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="white"/>
              <rect x="9" y="1" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
              <rect x="1" y="9" width="6" height="6" rx="1" fill="white" opacity="0.4"/>
              <rect x="9" y="9" width="6" height="6" rx="1" fill="white"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F] leading-none">BOM Factory</p>
            <p className="text-[10px] text-[#AEAEB2] mt-0.5">Manufactura</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {nav.filter(item => perms[item.perm]).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? 'bg-[#1D1D1F] text-white font-medium'
                    : 'text-[#6E6E73] hover:bg-black/5 hover:text-[#1D1D1F]'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-black/5 pt-4 mt-4">
          <div className="px-3 mb-3">
            <p className="text-xs font-medium text-[#1D1D1F] truncate">{user?.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                style={
                  perms.role === 'produccion'
                    ? { background: 'rgba(42,157,92,0.12)', color: '#2a9d5c' }
                    : { background: 'rgba(0,113,227,0.1)', color: '#0071E3' }
                }
              >
                {perms.role === 'produccion' ? 'Producción' : 'Admin'}
              </span>
              <p className="text-[10px] text-[#AEAEB2]">Sesión activa</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-[#FF3B30] hover:bg-red-50 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
