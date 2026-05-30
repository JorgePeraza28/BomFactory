import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'

interface Stats {
  pendingOrders: number
  inProgressOrders: number
  completedOrders: number
  lowStockItems: number
  totalComponents: number
}

interface InvRow { component_type: string; stock_qty: number; min_stock: number }
interface OrderRow { status: string; created_at: string }

const TYPE_LABELS: Record<string, string> = {
  processor: 'Procesador', ram: 'RAM', storage: 'Almacenamiento',
  motherboard: 'T. madre', gpu: 'GPU', case: 'Gabinete',
  psu: 'Fuente', cooler: 'Cooler', laptop_case: 'Chassis',
  display: 'Pantalla', keyboard: 'Teclado', battery: 'Batería',
  charger: 'Cargador', cable: 'Cables',
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    pendingOrders: 0,
    inProgressOrders: 0,
    completedOrders: 0,
    lowStockItems: 0,
    totalComponents: 0,
  })
  const [ordersByStatus, setOrdersByStatus] = useState<{ name: string; value: number; color: string }[]>([])
  const [lowStockByType, setLowStockByType] = useState<{ type: string; stock: number; min: number }[]>([])
  const [ordersPerDay, setOrdersPerDay] = useState<{ day: string; pedidos: number }[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchStats() {
      const [ordersRes, inventoryRes] = await Promise.all([
        supabase.from('orders').select('status, created_at'),
        supabase.from('inventory').select('component_type, stock_qty, min_stock'),
      ])

      const o: OrderRow[] = ordersRes.data ?? []
      const inv: InvRow[] = inventoryRes.data ?? []

      // KPIs
      setStats({
        pendingOrders: o.filter(x => x.status === 'pending').length,
        inProgressOrders: o.filter(x => x.status === 'in_progress').length,
        completedOrders: o.filter(x => x.status === 'completed').length,
        lowStockItems: inv.filter(x => x.stock_qty <= x.min_stock).length,
        totalComponents: inv.length,
      })

      // Chart 1: orders by status
      const statusMap = [
        { key: 'pending',     name: 'Pendiente',  color: '#FF9F0A' },
        { key: 'in_progress', name: 'En proceso', color: '#0071E3' },
        { key: 'completed',   name: 'Completado', color: '#30D158' },
        { key: 'cancelled',   name: 'Cancelado',  color: '#FF3B30' },
      ]
      setOrdersByStatus(
        statusMap
          .map(s => ({ name: s.name, value: o.filter(x => x.status === s.key).length, color: s.color }))
          .filter(s => s.value > 0)
      )

      // Chart 2: low-stock components grouped by type
      const byType: Record<string, { stock: number; min: number; count: number }> = {}
      inv.filter(r => r.stock_qty <= r.min_stock).forEach(r => {
        if (!byType[r.component_type]) byType[r.component_type] = { stock: 0, min: 0, count: 0 }
        byType[r.component_type].stock += r.stock_qty
        byType[r.component_type].min += r.min_stock
        byType[r.component_type].count++
      })
      setLowStockByType(
        Object.entries(byType)
          .map(([type, v]) => ({ type: TYPE_LABELS[type] ?? type, stock: v.stock, min: v.min }))
          .sort((a, b) => a.stock - b.stock)
          .slice(0, 6)
      )

      // Chart 3: orders per day — last 7 days
      const days: { day: string; pedidos: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const label = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })
        const dateStr = d.toISOString().slice(0, 10)
        const count = o.filter(x => x.created_at?.slice(0, 10) === dateStr).length
        days.push({ day: label, pedidos: count })
      }
      setOrdersPerDay(days)

      setLoading(false)
    }
    fetchStats()
  }, [])

  const cards = [
    {
      label: 'Pedidos pendientes',
      value: stats.pendingOrders,
      sub: 'Esperando producción',
      color: '#FF9F0A',
      bg: 'rgba(255,159,10,0.08)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="#FF9F0A" strokeWidth="1.5"/>
          <path d="M10 6v4l2.5 2.5" stroke="#FF9F0A" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      action: () => navigate('/orders'),
    },
    {
      label: 'En producción',
      value: stats.inProgressOrders,
      sub: 'Órdenes activas',
      color: '#0071E3',
      bg: 'rgba(0,113,227,0.08)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 10h12M10 4l6 6-6 6" stroke="#0071E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      action: () => navigate('/orders'),
    },
    {
      label: 'Completados',
      value: stats.completedOrders,
      sub: 'Órdenes terminadas',
      color: '#30D158',
      bg: 'rgba(48,209,88,0.08)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="#30D158" strokeWidth="1.5"/>
          <path d="M6.5 10l2.5 2.5L13.5 7.5" stroke="#30D158" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      action: () => navigate('/orders'),
    },
    {
      label: 'Stock bajo',
      value: stats.lowStockItems,
      sub: `de ${stats.totalComponents} componentes`,
      color: '#FF3B30',
      bg: 'rgba(255,59,48,0.08)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3L18 17H2L10 3z" stroke="#FF3B30" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M10 8v4M10 14.5v.5" stroke="#FF3B30" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      action: () => navigate('/inventory'),
    },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Dashboard</h1>
        <p className="text-sm text-[#6E6E73] mt-1">Resumen general del sistema</p>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-white/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(card => (
            <button
              key={card.label}
              onClick={card.action}
              className="text-left p-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 2px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                  {card.icon}
                </div>
              </div>
              <p className="text-3xl font-semibold text-[#1D1D1F] tracking-tight">{card.value}</p>
              <p className="text-xs font-medium text-[#1D1D1F] mt-1">{card.label}</p>
              <p className="text-xs text-[#AEAEB2] mt-0.5">{card.sub}</p>
            </button>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">Acciones rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Nuevo pedido', desc: 'Crear orden de producción', to: '/orders', color: '#1D1D1F' },
            { label: 'Ver inventario', desc: 'Consultar stock de piezas', to: '/inventory', color: '#1D1D1F' },
            { label: 'Hacer restock', desc: 'Agregar componentes', to: '/restock', color: '#1D1D1F' },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.to)}
              className="flex items-center justify-between p-4 rounded-2xl text-left transition-all hover:scale-[1.01] group"
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 2px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <p className="text-sm font-medium text-[#1D1D1F]">{a.label}</p>
                <p className="text-xs text-[#AEAEB2] mt-0.5">{a.desc}</p>
              </div>
              <svg className="text-[#AEAEB2] group-hover:text-[#1D1D1F] transition-colors" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      {!loading && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Chart 1: Orders by status — Donut */}
          <div
            className="p-6 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.75)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            <p className="text-sm font-semibold text-[#1D1D1F] mb-1">Estado de pedidos</p>
            <p className="text-xs text-[#AEAEB2] mb-4">Distribución actual</p>
            {ordersByStatus.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-[#AEAEB2]">Sin pedidos aún</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={ordersByStatus}
                      cx="50%" cy="50%"
                      innerRadius={45} outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {ordersByStatus.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [v, 'Pedidos']}
                      contentStyle={{
                        background: 'rgba(255,255,255,0.95)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        borderRadius: 12,
                        fontSize: 12,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                  {ordersByStatus.map(s => (
                    <div key={s.name} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-[#6E6E73]">{s.name}</span>
                      <span className="text-xs font-semibold text-[#1D1D1F]">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Chart 2: Low stock by component type — Horizontal bars */}
          <div
            className="p-6 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.75)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            <p className="text-sm font-semibold text-[#1D1D1F] mb-1">Stock bajo por tipo</p>
            <p className="text-xs text-[#AEAEB2] mb-4">Stock actual vs mínimo requerido</p>
            {lowStockByType.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-[#30D158]">Todo el inventario está OK</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={lowStockByType}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid horizontal={false} stroke="rgba(0,0,0,0.04)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#AEAEB2' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: '#6E6E73' }} axisLine={false} tickLine={false} width={62} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(255,255,255,0.95)',
                      border: '1px solid rgba(0,0,0,0.06)',
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Bar dataKey="min" name="Mínimo" fill="rgba(255,59,48,0.15)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="stock" name="Stock actual" fill="#FF3B30" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 3: Orders per day — Line */}
          <div
            className="p-6 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.75)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            <p className="text-sm font-semibold text-[#1D1D1F] mb-1">Pedidos por día</p>
            <p className="text-xs text-[#AEAEB2] mb-4">Últimos 7 días</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ordersPerDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.04)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#AEAEB2' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#AEAEB2' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number) => [v, 'Pedidos']}
                  contentStyle={{
                    background: 'rgba(255,255,255,0.95)',
                    border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="pedidos"
                  stroke="#0071E3"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0071E3', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#0071E3', strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

        </div>
      )}
    </div>
  )
}
