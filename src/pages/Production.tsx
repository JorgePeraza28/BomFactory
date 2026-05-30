import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Product { id: number; name: string; product_code: string }

interface CheckedLine {
  name: string
  typeLabel: string
  componentType: string
  componentId: number
  unitCost: number
  qtyPerUnit: number
  totalNeeded: number
  inStock: number
  ok: boolean
}

interface ProductionLog {
  id: number
  product_id: number
  quantity_produced: number
  notes: string
  created_at: string
  productName?: string
}

const TYPE_LABELS: Record<string, string> = {
  processor: 'Procesador', ram: 'RAM', storage: 'Almacenamiento',
  motherboard: 'Tarjeta madre', gpu: 'GPU', case: 'Gabinete',
  psu: 'Fuente de poder', cooler: 'Cooler', laptop_case: 'Chassis laptop',
  display: 'Pantalla', keyboard: 'Teclado', battery: 'Batería',
  charger: 'Cargador', cable: 'Cables',
}

const COMPONENT_MAP = [
  { field: 'processor_id',   type: 'processor',   join: 'processors' },
  { field: 'ram_id',         type: 'ram',          join: 'ram_modules' },
  { field: 'storage_id',     type: 'storage',      join: 'storage_units' },
  { field: 'motherboard_id', type: 'motherboard',  join: 'motherboards' },
  { field: 'gpu_id',         type: 'gpu',          join: 'gpus' },
  { field: 'case_id',        type: 'case',         join: 'cases' },
  { field: 'psu_id',         type: 'psu',          join: 'power_supplies' },
  { field: 'cooler_id',      type: 'cooler',       join: 'coolers' },
  { field: 'laptop_case_id', type: 'laptop_case',  join: 'laptop_cases' },
  { field: 'display_id',     type: 'display',      join: 'displays' },
  { field: 'keyboard_id',    type: 'keyboard',     join: 'keyboards' },
  { field: 'battery_id',     type: 'battery',      join: 'batteries' },
  { field: 'charger_id',     type: 'charger',      join: 'chargers' },
  { field: 'cable_id',       type: 'cable',        join: 'cables' },
]

export default function Production() {
  const [products, setProducts]               = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [qty, setQty]                         = useState(1)
  const [notes, setNotes]                     = useState('')
  const [checking, setChecking]               = useState(false)
  const [checkedLines, setCheckedLines]       = useState<CheckedLine[]>([])
  const [canProduce, setCanProduce]           = useState(false)
  const [producing, setProducing]             = useState(false)
  const [success, setSuccess]                 = useState(false)
  const [logs, setLogs]                       = useState<ProductionLog[]>([])
  const [activeBomId, setActiveBomId]         = useState<number | null>(null)

  useEffect(() => {
    supabase.from('finished_products').select('id, name, product_code').eq('is_active', true)
      .then(({ data }) => setProducts(data ?? []))
    fetchLogs()
  }, [])

  async function fetchLogs() {
    const { data } = await supabase
      .from('production_logs').select('*')
      .order('created_at', { ascending: false }).limit(20)
    const raw: any[] = data ?? []
    if (!raw.length) { setLogs([]); return }

    const ids = [...new Set(raw.map(r => r.product_id))]
    const { data: prods } = await supabase.from('finished_products').select('id, name').in('id', ids)
    const map: Record<number, string> = {}
    ;(prods ?? []).forEach((p: any) => { map[p.id] = p.name })
    setLogs(raw.map(r => ({ ...r, productName: map[r.product_id] })))
  }

  async function checkInventory(productId: string, quantity: number) {
    setCheckedLines([])
    setCanProduce(false)
    setActiveBomId(null)
    if (!productId) return

    setChecking(true)

    const { data: bom } = await supabase
      .from('boms').select('id')
      .eq('product_id', productId).eq('status', 'active').single()

    if (!bom) { setChecking(false); return }
    setActiveBomId(bom.id)

    const joinSelect = COMPONENT_MAP.map(c => `${c.field}, ${c.join}(name, unit_cost)`).join(', ')
    const { data: lines } = await supabase
      .from('bom_lines').select(`quantity, ${joinSelect}`)
      .eq('bom_id', bom.id)

    if (!lines?.length) { setChecking(false); return }

    // Build component list from lines
    type ComponentItem = { type: string; id: number; name: string; qty: number; unitCost: number }
    const items: ComponentItem[] = []
    for (const line of lines as any[]) {
      for (const map of COMPONENT_MAP) {
        if (line[map.field] != null) {
          items.push({ type: map.type, id: line[map.field], name: line[map.join]?.name ?? '—', qty: line.quantity, unitCost: line[map.join]?.unit_cost ?? 0 })
          break
        }
      }
    }

    // Fetch inventory for all needed types/ids
    const { data: inv } = await supabase.from('inventory').select('component_type, component_id, stock_qty')
    const stockMap: Record<string, number> = {}
    ;(inv ?? []).forEach((r: any) => { stockMap[`${r.component_type}_${r.component_id}`] = Number(r.stock_qty) })

    const checked: CheckedLine[] = items.map(c => {
      const inStock     = stockMap[`${c.type}_${c.id}`] ?? 0
      const totalNeeded = c.qty * quantity
      return {
        name: c.name,
        typeLabel: TYPE_LABELS[c.type] ?? c.type,
        componentType: c.type,
        componentId: c.id,
        unitCost: c.unitCost,
        qtyPerUnit: c.qty,
        totalNeeded,
        inStock,
        ok: inStock >= totalNeeded,
      }
    })

    setCheckedLines(checked)
    setCanProduce(checked.length > 0 && checked.every(c => c.ok))
    setChecking(false)
  }

  async function handleProduce() {
    if (!canProduce || !selectedProduct || !activeBomId) return
    setProducing(true)

    // 1. Deduct each component from inventory
    for (const line of checkedLines) {
      const { data: inv } = await supabase
        .from('inventory').select('id, stock_qty')
        .eq('component_type', line.componentType)
        .eq('component_id', line.componentId).single()
      if (inv) {
        await supabase.from('inventory').update({
          stock_qty: Number(inv.stock_qty) - line.totalNeeded,
          updated_at: new Date().toISOString(),
        }).eq('id', inv.id)
      }
    }

    // 2. Add to finished_inventory
    const { data: fi } = await supabase
      .from('finished_inventory').select('id, stock_qty')
      .eq('product_id', selectedProduct).single()
    if (fi) {
      await supabase.from('finished_inventory').update({
        stock_qty: fi.stock_qty + qty,
        updated_at: new Date().toISOString(),
      }).eq('id', fi.id)
    } else {
      await supabase.from('finished_inventory').insert({ product_id: parseInt(selectedProduct), stock_qty: qty })
    }

    // 3. Log production
    await supabase.from('production_logs').insert({
      product_id: parseInt(selectedProduct),
      quantity_produced: qty,
      notes: notes || null,
    })

    setProducing(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
    setSelectedProduct('')
    setQty(1)
    setNotes('')
    setCheckedLines([])
    setCanProduce(false)
    fetchLogs()
  }

  const shortageCount = checkedLines.filter(c => !c.ok).length

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Producción</h1>
        <p className="text-sm text-[#6E6E73] mt-1">Ensambla productos y descuenta componentes del inventario automáticamente</p>
      </div>

      <div className="grid grid-cols-5 gap-6">

        {/* ── Form ── */}
        <div className="col-span-2">
          <div
            className="p-6 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            <h2 className="text-base font-semibold text-[#1D1D1F] mb-5">Nueva producción</h2>
            <div className="space-y-4">

              <div>
                <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Producto</label>
                <select
                  value={selectedProduct}
                  onChange={e => { setSelectedProduct(e.target.value); checkInventory(e.target.value, qty) }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                  style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <option value="">Seleccionar producto...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Cantidad a producir</label>
                <input
                  type="number" min={1} value={qty}
                  onChange={e => {
                    const v = Math.max(1, parseInt(e.target.value) || 1)
                    setQty(v)
                    if (selectedProduct) checkInventory(selectedProduct, v)
                  }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                  style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Notas (opcional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Lote, turno, observaciones..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none resize-none placeholder-[#AEAEB2]"
                  style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                />
              </div>

              {success && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium"
                  style={{ background: 'rgba(42,157,92,0.1)', color: '#2a9d5c', border: '1px solid rgba(42,157,92,0.2)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="#2a9d5c" strokeWidth="1.5"/>
                    <path d="M4.5 7l2 2L9.5 5" stroke="#2a9d5c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Producción registrada correctamente
                </div>
              )}

              <button
                onClick={handleProduce}
                disabled={!canProduce || producing}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                style={{
                  background: !canProduce || producing ? '#AEAEB2' : '#1D1D1F',
                  cursor: !canProduce || producing ? 'not-allowed' : 'pointer',
                }}
              >
                {producing ? 'Procesando...' : `Producir ${qty} unidad${qty !== 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>

        {/* Cost summary card */}
        {checkedLines.length > 0 && (() => {
          const unitCost  = checkedLines.reduce((s, l) => s + l.unitCost * l.qtyPerUnit, 0)
          const totalCost = unitCost * qty
          return (
            <div
              className="mt-4 p-5 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <p className="text-xs font-medium text-[#6E6E73] uppercase tracking-wider mb-3">Costo estimado</p>
              <div className="space-y-2">
                {checkedLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-xs text-[#6E6E73] truncate pr-2">{l.name}</p>
                    <p className="text-xs text-[#1D1D1F] font-medium whitespace-nowrap">
                      ${(l.unitCost * l.qtyPerUnit * qty).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                <div>
                  <p className="text-xs text-[#AEAEB2]">Costo por unidad</p>
                  <p className="text-sm font-semibold text-[#1D1D1F]">${unitCost.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#AEAEB2]">Total ({qty} unid.)</p>
                  <p className="text-lg font-semibold text-[#1D1D1F]">${totalCost.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )
        })()}
        </div>

        {/* ── Availability panel ── */}
        <div className="col-span-3 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">
              Verificación de componentes
            </h2>
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              {checking ? (
                <div className="py-12 text-center text-sm text-[#AEAEB2]">Verificando inventario...</div>
              ) : checkedLines.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#AEAEB2]">
                  Selecciona un producto para ver la disponibilidad de componentes
                </div>
              ) : (
                <>
                  {/* Banner */}
                  <div
                    className="px-6 py-3 flex items-center gap-2.5 border-b"
                    style={{
                      borderColor: 'rgba(0,0,0,0.06)',
                      background: canProduce ? 'rgba(42,157,92,0.07)' : 'rgba(255,59,48,0.06)',
                    }}
                  >
                    {canProduce ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="7" stroke="#2a9d5c" strokeWidth="1.5"/>
                          <path d="M5 8l2.5 2.5L11 6" stroke="#2a9d5c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <p className="text-sm font-medium" style={{ color: '#2a9d5c' }}>
                          Stock suficiente — listo para producir {qty} unidad{qty !== 1 ? 'es' : ''}
                        </p>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 2L15 14H1L8 2z" stroke="#FF3B30" strokeWidth="1.5" strokeLinejoin="round"/>
                          <path d="M8 6v4M8 12v.5" stroke="#FF3B30" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <p className="text-sm font-medium text-[#FF3B30]">
                          {shortageCount} componente{shortageCount !== 1 ? 's' : ''} con stock insuficiente
                        </p>
                      </>
                    )}
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                        <th className="text-left px-5 py-3 text-xs font-medium text-[#6E6E73] whitespace-nowrap">Componente</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-[#6E6E73] whitespace-nowrap">Tipo</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-[#6E6E73] whitespace-nowrap">Cant. unit.</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-[#6E6E73] whitespace-nowrap">Necesario</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-[#6E6E73] whitespace-nowrap">En stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkedLines.map((line, i) => (
                        <tr
                          key={i}
                          className="border-t"
                          style={{
                            borderColor: 'rgba(0,0,0,0.04)',
                            background: line.ok ? 'transparent' : 'rgba(255,59,48,0.025)',
                          }}
                        >
                          <td className="px-5 py-3 font-medium text-[#1D1D1F]">{line.name}</td>
                          <td className="px-5 py-3 text-center">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[#6E6E73]">{line.typeLabel}</span>
                          </td>
                          <td className="px-5 py-3 text-center text-[#6E6E73]">{line.qtyPerUnit}</td>
                          <td className="px-5 py-3 text-center font-medium text-[#1D1D1F]">{line.totalNeeded}</td>
                          <td className="px-5 py-3 text-center font-semibold" style={{ color: line.ok ? '#2a9d5c' : '#FF3B30' }}>
                            {line.inStock}
                            {!line.ok && (
                              <div className="text-[10px] font-normal text-[#FF3B30]">
                                faltan {line.totalNeeded - line.inStock}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>

          {/* ── Production log ── */}
          {logs.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[#6E6E73] uppercase tracking-wider mb-3">Historial de producción</h2>
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
                }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#6E6E73]">Producto</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-[#6E6E73]">Cantidad</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#6E6E73]">Notas</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-[#6E6E73]">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                        <td className="px-5 py-3 font-medium text-[#1D1D1F]">{log.productName ?? `#${log.product_id}`}</td>
                        <td className="px-5 py-3 text-center font-semibold" style={{ color: '#2a9d5c' }}>+{log.quantity_produced}</td>
                        <td className="px-5 py-3 text-xs text-[#6E6E73]">{log.notes || '—'}</td>
                        <td className="px-5 py-3 text-right text-xs text-[#AEAEB2]">
                          {new Date(log.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
