import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ComponentOption { id: number; name: string; sku: string; unit_cost: number; stock_qty: number }

const COMPONENT_TABLES: Record<string, string> = {
  processor: 'processors', ram: 'ram_modules', storage: 'storage_units',
  motherboard: 'motherboards', gpu: 'gpus', case: 'cases',
  psu: 'power_supplies', cooler: 'coolers', laptop_case: 'laptop_cases',
  display: 'displays', keyboard: 'keyboards', battery: 'batteries',
  charger: 'chargers', cable: 'cables',
}

const TYPE_LABELS: Record<string, string> = {
  processor: 'Procesador', ram: 'RAM', storage: 'Almacenamiento',
  motherboard: 'Tarjeta madre', gpu: 'GPU', case: 'Gabinete',
  psu: 'Fuente de poder', cooler: 'Cooler', laptop_case: 'Chassis laptop',
  display: 'Pantalla', keyboard: 'Teclado', battery: 'Batería',
  charger: 'Cargador', cable: 'Cables',
}

interface RestockLog {
  id: number
  component_type: string
  component_id: number
  qty_added: number
  unit_cost: number
  created_at: string
  notes: string
  component_name?: string
}

export default function Restock() {
  const [type, setType] = useState('')
  const [options, setOptions] = useState<ComponentOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<RestockLog[]>([])
  const [success, setSuccess] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    const { data } = await supabase
      .from('restock_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    const raw: RestockLog[] = (data as any) ?? []
    if (raw.length === 0) { setLogs([]); return }

    // group by type to batch-fetch names
    const byType: Record<string, number[]> = {}
    raw.forEach(r => {
      if (!byType[r.component_type]) byType[r.component_type] = []
      byType[r.component_type].push(r.component_id)
    })

    const nameMap: Record<string, Record<number, string>> = {}
    await Promise.all(
      Object.entries(byType).map(async ([t, ids]) => {
        const table = COMPONENT_TABLES[t]
        if (!table) return
        const { data: comps } = await supabase.from(table).select('id, name').in('id', ids)
        nameMap[t] = {}
        ;(comps ?? []).forEach((c: any) => { nameMap[t][c.id] = c.name })
      })
    )

    setLogs(raw.map(r => ({ ...r, component_name: nameMap[r.component_type]?.[r.component_id] })))
  }

  async function loadOptions(t: string) {
    setType(t)
    setSelectedId('')
    if (!t) { setOptions([]); return }

    const table = COMPONENT_TABLES[t]
    const { data: comps } = await supabase.from(table).select('id, name, sku, unit_cost').eq('is_active', true)
    const { data: inv } = await supabase.from('inventory').select('component_id, stock_qty').eq('component_type', t)

    const stockMap: Record<number, number> = {}
    ;(inv ?? []).forEach((r: any) => { stockMap[r.component_id] = r.stock_qty })

    setOptions(
      (comps ?? []).map((c: any) => ({ ...c, stock_qty: stockMap[c.id] ?? 0 }))
    )
  }

  async function handleRestock() {
    if (!type || !selectedId) return
    setSaving(true)

    const comp = options.find(o => o.id === parseInt(selectedId))

    // Update inventory
    const { data: existing } = await supabase
      .from('inventory')
      .select('id, stock_qty')
      .eq('component_type', type)
      .eq('component_id', selectedId)
      .single()

    if (existing) {
      await supabase
        .from('inventory')
        .update({ stock_qty: existing.stock_qty + qty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }

    // Log
    await supabase.from('restock_logs').insert({
      component_type: type,
      component_id: parseInt(selectedId),
      qty_added: qty,
      unit_cost: comp?.unit_cost ?? 0,
      notes: notes || null,
    })

    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
    setSelectedId('')
    setQty(1)
    setNotes('')
    fetchLogs()
  }

  const selectedComp = options.find(o => o.id === parseInt(selectedId))

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Restock</h1>
        <p className="text-sm text-[#6E6E73] mt-1">Agregar componentes al inventario</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Form */}
        <div className="col-span-2">
          <div
            className="p-6 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            <h2 className="text-base font-semibold text-[#1D1D1F] mb-5">Agregar stock</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">
                  Tipo de componente
                </label>
                <select
                  value={type}
                  onChange={e => loadOptions(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                  style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <option value="">Seleccionar tipo...</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {options.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">
                    Componente
                  </label>
                  <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                    style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <option value="">Seleccionar...</option>
                    {options.map(o => (
                      <option key={o.id} value={o.id}>{o.name} (stock: {o.stock_qty})</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedComp && (
                <div
                  className="p-3 rounded-xl text-xs"
                  style={{ background: 'rgba(0,113,227,0.06)', border: '1px solid rgba(0,113,227,0.12)' }}
                >
                  <p className="text-[#0071E3] font-medium">{selectedComp.name}</p>
                  <p className="text-[#6E6E73] mt-0.5">
                    SKU: {selectedComp.sku} · Costo: ${selectedComp.unit_cost.toLocaleString()} · Stock actual: {selectedComp.stock_qty}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">
                  Cantidad a agregar
                </label>
                <input
                  type="number" min={1} value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                  style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">
                  Notas (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Proveedor, número de factura..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none resize-none placeholder-[#AEAEB2]"
                  style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                />
              </div>

              {success && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium"
                  style={{ background: 'rgba(48,209,88,0.1)', color: '#30D158', border: '1px solid rgba(48,209,88,0.2)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="#30D158" strokeWidth="1.5"/>
                    <path d="M4.5 7l2 2L9.5 5" stroke="#30D158" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Stock actualizado correctamente
                </div>
              )}

              <button
                onClick={handleRestock}
                disabled={!type || !selectedId || saving}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: !type || !selectedId || saving ? '#AEAEB2' : '#1D1D1F' }}
              >
                {saving ? 'Guardando...' : `Agregar ${qty} unidad${qty !== 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>

        {/* Log */}
        <div className="col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#6E6E73] uppercase tracking-wider">Historial reciente</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Buscar componente..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs text-[#1D1D1F] placeholder-[#AEAEB2] outline-none w-44"
                style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
              />
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs text-[#6E6E73] outline-none cursor-pointer"
                style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                <option value="">Todos los tipos</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            {(() => {
              const filtered = logs.filter(l =>
                (!filterType || l.component_type === filterType) &&
                (!filterSearch || (l.component_name ?? '').toLowerCase().includes(filterSearch.toLowerCase()))
              )
              return filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#AEAEB2]">Sin movimientos aún</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#6E6E73]">Tipo</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#6E6E73]">Componente</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-[#6E6E73]">Cantidad</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-[#6E6E73]">Costo unit.</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-[#6E6E73]">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(log => (
                      <tr key={log.id} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                        <td className="px-5 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[#6E6E73]">
                            {TYPE_LABELS[log.component_type] ?? log.component_type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[#1D1D1F] font-medium">
                          {log.component_name ?? `#${log.component_id}`}
                        </td>
                        <td className="px-5 py-3 text-center font-semibold" style={{ color: '#2a9d5c' }}>
                          +{log.qty_added}
                        </td>
                        <td className="px-5 py-3 text-right text-[#6E6E73]">${log.unit_cost.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right text-[#AEAEB2] text-xs">
                          {new Date(log.created_at).toLocaleDateString('es-MX')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
