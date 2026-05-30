import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface FinishedRow {
  id: number
  product_id: number
  stock_qty: number
  updated_at: string
  name?: string
  product_code?: string
}

interface InvRow {
  id: number
  component_type: string
  component_id: number
  stock_qty: number
  min_stock: number
  name?: string
  sku?: string
  unit_cost?: number
}

const TYPE_LABELS: Record<string, string> = {
  processor: 'Procesador', ram: 'RAM', storage: 'Almacenamiento',
  motherboard: 'Tarjeta madre', gpu: 'GPU', case: 'Gabinete',
  psu: 'Fuente de poder', cooler: 'Cooler', laptop_case: 'Chassis laptop',
  display: 'Pantalla', keyboard: 'Teclado', battery: 'Batería',
  charger: 'Cargador', cable: 'Cables',
}

const COMPONENT_TABLES: Record<string, string> = {
  processor: 'processors', ram: 'ram_modules', storage: 'storage_units',
  motherboard: 'motherboards', gpu: 'gpus', case: 'cases',
  psu: 'power_supplies', cooler: 'coolers', laptop_case: 'laptop_cases',
  display: 'displays', keyboard: 'keyboards', battery: 'batteries',
  charger: 'chargers', cable: 'cables',
}

const PAGE_SIZE_OPTIONS = [10, 15, 20]

type SortKey = 'name' | 'stock_qty' | 'min_stock' | 'unit_cost' | 'total'

function SortTh({ label, sortKey, current, dir, onSort, align }: {
  label: string
  sortKey: SortKey
  current: SortKey | null
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  align: 'left' | 'right'
}) {
  const active = current === sortKey
  return (
    <th
      className={`px-6 py-3 text-xs font-medium text-[#6E6E73] cursor-pointer select-none whitespace-nowrap text-${align}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {label}
        <span style={{ color: active ? '#1D1D1F' : '#AEAEB2' }}>
          {active && dir === 'desc' ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </span>
      </span>
    </th>
  )
}

export default function Inventory() {
  const [rows, setRows] = useState<InvRow[]>([])
  const [loading, setLoading] = useState(true)

  // Main section toggle
  const [section, setSection] = useState<'components' | 'finished'>('components')
  const [finishedRows, setFinishedRows] = useState<FinishedRow[]>([])
  const [loadingFinished, setLoadingFinished] = useState(false)

  useEffect(() => {
    if (section === 'finished' && finishedRows.length === 0) loadFinished()
  }, [section])

  async function loadFinished() {
    setLoadingFinished(true)
    const { data } = await supabase
      .from('finished_inventory')
      .select('id, product_id, stock_qty, updated_at, finished_products(name, product_code)')
      .order('product_id')
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      product_id: r.product_id,
      stock_qty: r.stock_qty,
      updated_at: r.updated_at,
      name: r.finished_products?.name,
      product_code: r.finished_products?.product_code,
    }))
    setFinishedRows(rows)
    setLoadingFinished(false)
  }

  // Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'low'>('all')
  const [filterType, setFilterType] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  useEffect(() => {
    async function load() {
      const { data: inv } = await supabase.from('inventory').select('*').order('component_type')
      if (!inv) { setLoading(false); return }

      const byType: Record<string, number[]> = {}
      inv.forEach(row => {
        if (!byType[row.component_type]) byType[row.component_type] = []
        byType[row.component_type].push(row.component_id)
      })

      const nameMap: Record<string, Record<number, { name: string; sku: string; unit_cost: number }>> = {}
      await Promise.all(
        Object.entries(byType).map(async ([type, ids]) => {
          const table = COMPONENT_TABLES[type]
          if (!table) return
          const { data } = await supabase.from(table).select('id, name, sku, unit_cost').in('id', ids)
          nameMap[type] = {}
          ;(data ?? []).forEach((d: any) => { nameMap[type][d.id] = d })
        })
      )

      const enriched = inv.map(row => ({
        ...row,
        name: nameMap[row.component_type]?.[row.component_id]?.name,
        sku: nameMap[row.component_type]?.[row.component_id]?.sku,
        unit_cost: nameMap[row.component_type]?.[row.component_id]?.unit_cost,
      }))

      setRows(enriched)
      setLoading(false)
    }
    load()
  }, [])

  // Reset to page 1 when filters/sort change
  useEffect(() => { setPage(1) }, [filterStatus, filterType, filterSearch, pageSize, sortKey, sortDir])

  function stockStatus(row: InvRow) {
    if (row.stock_qty === 0) return { label: 'Sin stock', color: '#FF3B30', bg: 'rgba(255,59,48,0.1)' }
    if (row.stock_qty <= row.min_stock) return { label: 'Stock bajo', color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)' }
    return { label: 'OK', color: '#2a9d5c', bg: 'rgba(42,157,92,0.1)' }
  }

  const lowCount = rows.filter(r => r.stock_qty <= r.min_stock).length
  const totalValue = rows.reduce((sum, r) => sum + (r.stock_qty ?? 0) * (r.unit_cost ?? 0), 0)

  const filtered = rows
    .filter(r => {
      if (filterStatus === 'low' && r.stock_qty > r.min_stock) return false
      if (filterType && r.component_type !== filterType) return false
      if (filterSearch && !(r.name ?? '').toLowerCase().includes(filterSearch.toLowerCase()) &&
          !(r.sku ?? '').toLowerCase().includes(filterSearch.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      if (!sortKey) return 0
      let va: number | string, vb: number | string
      if (sortKey === 'name')      { va = a.name ?? ''; vb = b.name ?? '' }
      else if (sortKey === 'total'){ va = (a.stock_qty ?? 0) * (a.unit_cost ?? 0); vb = (b.stock_qty ?? 0) * (b.unit_cost ?? 0) }
      else                         { va = (a[sortKey] ?? 0) as number; vb = (b[sortKey] ?? 0) as number }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Inventario</h1>
          <p className="text-sm text-[#6E6E73] mt-1">
            {rows.length} componentes · <span style={{ color: '#FF3B30' }}>{lowCount} con stock bajo</span>
          </p>
        </div>

        {/* Valor total en mercancía */}
        <div
          className="px-5 py-3 rounded-2xl text-right"
          style={{
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <p className="text-xs text-[#AEAEB2] mb-0.5">Valor total en mercancía</p>
          {loading ? (
            <div className="h-6 w-28 rounded bg-black/5 animate-pulse" />
          ) : (
            <p className="text-xl font-semibold text-[#1D1D1F] tracking-tight">
              ${totalValue.toLocaleString('es-MX')}
            </p>
          )}
        </div>
      </div>

      {/* Section toggle */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 w-fit" style={{ background: 'rgba(118,118,128,0.1)' }}>
        {([['components', 'Componentes'], ['finished', 'Productos terminados']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: section === key ? 'white' : 'transparent',
              color: section === key ? '#1D1D1F' : '#6E6E73',
              boxShadow: section === key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Productos terminados ── */}
      {section === 'finished' && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          {loadingFinished ? (
            <div className="py-16 text-center text-sm text-[#AEAEB2]">Cargando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">Código</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">Producto</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-[#6E6E73]">Stock disponible</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-[#6E6E73]">Última actualización</th>
                </tr>
              </thead>
              <tbody>
                {finishedRows.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-[#AEAEB2]">Sin productos terminados</td></tr>
                ) : finishedRows.map(row => (
                  <tr key={row.id} className="border-t hover:bg-black/[0.02] transition-colors" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                    <td className="px-6 py-3 font-mono text-xs text-[#AEAEB2]">{row.product_code ?? '—'}</td>
                    <td className="px-6 py-3 font-medium text-[#1D1D1F]">{row.name ?? `#${row.product_id}`}</td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className="inline-block text-sm font-semibold px-3 py-0.5 rounded-full"
                        style={
                          row.stock_qty === 0
                            ? { color: '#FF3B30', background: 'rgba(255,59,48,0.08)' }
                            : { color: '#2a9d5c', background: 'rgba(42,157,92,0.08)' }
                        }
                      >
                        {row.stock_qty}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-xs text-[#AEAEB2]">
                      {new Date(row.updated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Componentes (existing) ── */}
      {section === 'components' && (<>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status toggle */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(118,118,128,0.1)' }}>
          {(['all', 'low'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: filterStatus === f ? 'white' : 'transparent',
                color: filterStatus === f ? '#1D1D1F' : '#6E6E73',
                boxShadow: filterStatus === f ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {f === 'all' ? 'Todos' : `Stock bajo (${lowCount})`}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm text-[#6E6E73] outline-none cursor-pointer"
          style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Search */}
        <input
          type="text"
          placeholder="Buscar por nombre o SKU..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm text-[#1D1D1F] placeholder-[#AEAEB2] outline-none flex-1 min-w-48"
          style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
        />

        {/* Page size */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-[#AEAEB2]">Mostrar</span>
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(118,118,128,0.1)' }}>
            {PAGE_SIZE_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setPageSize(n)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: pageSize === n ? 'white' : 'transparent',
                  color: pageSize === n ? '#1D1D1F' : '#6E6E73',
                  boxShadow: pageSize === n ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
        }}
      >
        {loading ? (
          <div className="py-16 text-center text-sm text-[#AEAEB2]">Cargando inventario...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">SKU</th>
                <SortTh label="Componente" sortKey="name"      current={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">Tipo</th>
                <SortTh label="Stock"       sortKey="stock_qty" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="Mínimo"      sortKey="min_stock" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="Costo unit." sortKey="unit_cost" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <SortTh label="Total mercancía" sortKey="total" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <th className="text-center px-6 py-3 text-xs font-medium text-[#6E6E73]">Estado</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-[#AEAEB2]">
                    Sin resultados
                  </td>
                </tr>
              ) : paginated.map(row => {
                const s = stockStatus(row)
                return (
                  <tr key={row.id} className="border-t transition-colors hover:bg-black/[0.02]" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                    <td className="px-6 py-3 font-mono text-xs text-[#AEAEB2]">{row.sku ?? '—'}</td>
                    <td className="px-6 py-3 text-[#1D1D1F] font-medium">{row.name ?? `ID ${row.component_id}`}</td>
                    <td className="px-6 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[#6E6E73]">
                        {TYPE_LABELS[row.component_type] ?? row.component_type}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-[#1D1D1F]">{row.stock_qty}</td>
                    <td className="px-6 py-3 text-right text-[#AEAEB2]">{row.min_stock}</td>
                    <td className="px-6 py-3 text-right text-[#6E6E73]">
                      {row.unit_cost !== undefined ? `$${row.unit_cost.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-[#1D1D1F]">
                      {row.unit_cost !== undefined ? `$${(row.stock_qty * row.unit_cost).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                        style={{ color: s.color, background: s.bg }}
                      >
                        {s.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-[#AEAEB2]">
            Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} componentes
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all"
              style={{
                background: page === 1 ? 'transparent' : 'rgba(255,255,255,0.75)',
                color: page === 1 ? '#AEAEB2' : '#1D1D1F',
                boxShadow: page === 1 ? 'none' : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce<(number | '...')[]>((acc, n, i, arr) => {
                if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push('...')
                acc.push(n)
                return acc
              }, [])
              .map((n, i) =>
                n === '...' ? (
                  <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-[#AEAEB2]">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n as number)}
                    className="w-8 h-8 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: page === n ? '#1D1D1F' : 'rgba(255,255,255,0.75)',
                      color: page === n ? 'white' : '#1D1D1F',
                      boxShadow: page === n ? 'none' : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
                    }}
                  >
                    {n}
                  </button>
                )
              )
            }

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all"
              style={{
                background: page === totalPages ? 'transparent' : 'rgba(255,255,255,0.75)',
                color: page === totalPages ? '#AEAEB2' : '#1D1D1F',
                boxShadow: page === totalPages ? 'none' : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}
