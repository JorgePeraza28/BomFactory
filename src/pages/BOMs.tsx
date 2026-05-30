import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product { id: number; name: string; product_code: string }

interface Bom {
  id: number
  name: string
  version: string
  status: string
  finished_products: { name: string; product_code: string }
}

interface BomLine {
  id: number
  quantity: number
  // raw FK ids (for duplicate detection)
  processor_id?:   number; ram_id?:      number; storage_id?:    number
  motherboard_id?: number; gpu_id?:      number; case_id?:       number
  psu_id?:         number; cooler_id?:   number; laptop_case_id?: number
  display_id?:     number; keyboard_id?: number; battery_id?:    number
  charger_id?:     number; cable_id?:    number
  // joined data
  processors?:      { name: string; unit_cost: number }
  ram_modules?:     { name: string; unit_cost: number }
  storage_units?:   { name: string; unit_cost: number }
  motherboards?:    { name: string; unit_cost: number }
  gpus?:            { name: string; unit_cost: number }
  cases?:           { name: string; unit_cost: number }
  power_supplies?:  { name: string; unit_cost: number }
  coolers?:         { name: string; unit_cost: number }
  laptop_cases?:    { name: string; unit_cost: number }
  displays?:        { name: string; unit_cost: number }
  keyboards?:       { name: string; unit_cost: number }
  batteries?:       { name: string; unit_cost: number }
  chargers?:        { name: string; unit_cost: number }
  cables?:          { name: string; unit_cost: number }
}

interface ComponentOption { id: number; name: string; unit_cost: number }

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPONENT_MAP = [
  { field: 'processor_id',   type: 'processor',   table: 'processors',    label: 'Procesador',       join: 'processors' },
  { field: 'ram_id',         type: 'ram',          table: 'ram_modules',   label: 'RAM',              join: 'ram_modules' },
  { field: 'storage_id',     type: 'storage',      table: 'storage_units', label: 'Almacenamiento',   join: 'storage_units' },
  { field: 'motherboard_id', type: 'motherboard',  table: 'motherboards',  label: 'Tarjeta madre',    join: 'motherboards' },
  { field: 'gpu_id',         type: 'gpu',          table: 'gpus',          label: 'GPU',              join: 'gpus' },
  { field: 'case_id',        type: 'case',         table: 'cases',         label: 'Gabinete',         join: 'cases' },
  { field: 'psu_id',         type: 'psu',          table: 'power_supplies',label: 'Fuente de poder',  join: 'power_supplies' },
  { field: 'cooler_id',      type: 'cooler',       table: 'coolers',       label: 'Cooler',           join: 'coolers' },
  { field: 'laptop_case_id', type: 'laptop_case',  table: 'laptop_cases',  label: 'Chassis laptop',   join: 'laptop_cases' },
  { field: 'display_id',     type: 'display',      table: 'displays',      label: 'Pantalla',         join: 'displays' },
  { field: 'keyboard_id',    type: 'keyboard',     table: 'keyboards',     label: 'Teclado',          join: 'keyboards' },
  { field: 'battery_id',     type: 'battery',      table: 'batteries',     label: 'Batería',          join: 'batteries' },
  { field: 'charger_id',     type: 'charger',      table: 'chargers',      label: 'Cargador',         join: 'chargers' },
  { field: 'cable_id',       type: 'cable',        table: 'cables',        label: 'Cables',           join: 'cables' },
]

const BOM_LINE_SELECT = `id, quantity,
  processor_id, ram_id, storage_id, motherboard_id, gpu_id, case_id,
  psu_id, cooler_id, laptop_case_id, display_id, keyboard_id, battery_id, charger_id, cable_id,
  processors(name,unit_cost), ram_modules(name,unit_cost),
  storage_units(name,unit_cost), motherboards(name,unit_cost),
  gpus(name,unit_cost), cases(name,unit_cost),
  power_supplies(name,unit_cost), coolers(name,unit_cost),
  laptop_cases(name,unit_cost), displays(name,unit_cost),
  keyboards(name,unit_cost), batteries(name,unit_cost),
  chargers(name,unit_cost), cables(name,unit_cost)`

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  active:   { color: '#2a9d5c', bg: 'rgba(42,157,92,0.1)' },
  draft:    { color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)' },
  obsolete: { color: '#AEAEB2', bg: 'rgba(174,174,178,0.1)' },
}

const STATUS_LABELS: Record<string, string> = { active: 'Activo', draft: 'Borrador', obsolete: 'Obsoleto' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getComponent(line: BomLine) {
  for (const map of COMPONENT_MAP) {
    const data = (line as any)[map.join]
    if (data) return { name: data.name as string, type: map.label, cost: data.unit_cost as number }
  }
  return { name: '—', type: '—', cost: 0 }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BOMs() {
  const [boms, setBoms]               = useState<Bom[]>([])
  const [products, setProducts]       = useState<Product[]>([])
  const [selectedBom, setSelectedBom] = useState<Bom | null>(null)
  const [lines, setLines]             = useState<BomLine[]>([])
  const [loadingLines, setLoadingLines] = useState(false)

  // mode: 'view' | 'edit' | 'new'
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view')

  // Form fields
  const [formName, setFormName]           = useState('')
  const [formProduct, setFormProduct]     = useState('')
  const [formVersion, setFormVersion]     = useState('1.0')
  const [formStatus, setFormStatus]       = useState<'draft' | 'active' | 'obsolete'>('draft')
  const [saving, setSaving]               = useState(false)
  // New product inline creation
  const [newProduct, setNewProduct]       = useState(false)
  const [newProdName, setNewProdName]     = useState('')
  const [newProdCode, setNewProdCode]     = useState('')

  // Add-line mini-form
  const [newLineType, setNewLineType]         = useState('')
  const [componentOptions, setComponentOptions] = useState<ComponentOption[]>([])
  const [newLineCompId, setNewLineCompId]     = useState('')
  const [newLineQty, setNewLineQty]           = useState(1)
  const [addingLine, setAddingLine]           = useState(false)
  const [deletingLineId, setDeletingLineId]   = useState<number | null>(null)
  const [deletingBom, setDeletingBom]         = useState(false)
  const [editingQty, setEditingQty]           = useState<Record<number, number>>({})
  const [savingQtyId, setSavingQtyId]         = useState<number | null>(null)

  useEffect(() => {
    fetchBoms()
    supabase.from('finished_products').select('id, name, product_code').eq('is_active', true)
      .then(({ data }) => setProducts(data ?? []))
  }, [])

  async function fetchBoms() {
    const { data } = await supabase
      .from('boms')
      .select('id, name, version, status, finished_products(name, product_code)')
      .order('id')
    setBoms((data as any) ?? [])
  }

  async function selectBom(bom: Bom) {
    setSelectedBom(bom)
    setMode('view')
    setLoadingLines(true)
    await reloadLines(bom.id)
    setLoadingLines(false)
  }

  async function reloadLines(bomId: number) {
    const { data } = await supabase.from('bom_lines').select(BOM_LINE_SELECT).eq('bom_id', bomId)
    const loaded = (data as any) ?? []
    setLines(loaded)
    const qtyMap: Record<number, number> = {}
    loaded.forEach((l: BomLine) => { qtyMap[l.id] = l.quantity })
    setEditingQty(qtyMap)
  }

  // ── Enter edit mode ──
  function enterEdit() {
    if (!selectedBom) return
    setFormName(selectedBom.name)
    setFormVersion(selectedBom.version)
    setFormStatus(selectedBom.status as any)
    setNewLineType('')
    setNewLineCompId('')
    setNewLineQty(1)
    setComponentOptions([])
    setMode('edit')
  }

  // ── Enter new mode ──
  function enterNew() {
    setSelectedBom(null)
    setLines([])
    setFormName('')
    setFormProduct('')
    setFormVersion('1.0')
    setFormStatus('draft')
    setNewLineType('')
    setNewLineCompId('')
    setNewLineQty(1)
    setComponentOptions([])
    setNewProduct(false)
    setNewProdName('')
    setNewProdCode('')
    setMode('new')
  }

  // ── Load component options when type changes in the add-line form ──
  async function loadComponentOptions(type: string) {
    setNewLineType(type)
    setNewLineCompId('')
    if (!type) { setComponentOptions([]); return }
    const map = COMPONENT_MAP.find(m => m.type === type)
    if (!map) return
    const { data } = await supabase.from(map.table).select('id, name, unit_cost').eq('is_active', true)
    setComponentOptions(data ?? [])
  }

  // ── Save BOM (new) ──
  async function saveNewBom() {
    const hasProduct = newProduct ? (newProdName && newProdCode) : !!formProduct
    if (!hasProduct || !formName) return
    setSaving(true)

    let productId = parseInt(formProduct)

    // Create new product first if needed
    if (newProduct) {
      const { data: prod } = await supabase.from('finished_products').insert({
        name: newProdName,
        product_code: newProdCode,
        version: formVersion,
      }).select('id').single()
      if (!prod) { setSaving(false); return }
      productId = prod.id
      // Refresh product list
      const { data: prods } = await supabase.from('finished_products').select('id, name, product_code').eq('is_active', true)
      setProducts(prods ?? [])
    }

    const { data: bom } = await supabase.from('boms').insert({
      name: formName,
      product_id: productId,
      version: formVersion,
      status: formStatus,
    }).select('id, name, version, status, finished_products(name, product_code)').single()

    setSaving(false)
    if (bom) {
      await fetchBoms()
      setSelectedBom(bom as any)
      setMode('edit')
    }
  }

  // ── Save BOM edits (metadata only) ──
  async function saveBomEdits() {
    if (!selectedBom) return
    setSaving(true)
    await supabase.from('boms').update({
      name: formName,
      version: formVersion,
      status: formStatus,
    }).eq('id', selectedBom.id)

    await fetchBoms()
    const { data: updated } = await supabase
      .from('boms').select('id, name, version, status, finished_products(name, product_code)')
      .eq('id', selectedBom.id).single()
    if (updated) setSelectedBom(updated as any)
    setSaving(false)
    setMode('view')
  }

  // ── Update line quantity inline ──
  async function saveLineQty(lineId: number) {
    const newQty = editingQty[lineId]
    if (!newQty || newQty < 1 || !selectedBom) return
    const orig = lines.find(l => l.id === lineId)
    if (orig && orig.quantity === newQty) return // unchanged
    setSavingQtyId(lineId)
    await supabase.from('bom_lines').update({ quantity: newQty }).eq('id', lineId)
    await reloadLines(selectedBom.id)
    setSavingQtyId(null)
  }

  // ── Add a line to the current BOM (sum if duplicate) ──
  async function addLine() {
    const bomId = selectedBom?.id
    if (!bomId || !newLineType || !newLineCompId) return
    setAddingLine(true)
    const map = COMPONENT_MAP.find(m => m.type === newLineType)!
    const compId = parseInt(newLineCompId)

    // Check if this component already exists in lines
    const existing = lines.find(l => (l as any)[map.field] === compId)
    if (existing) {
      // Sum quantities
      await supabase.from('bom_lines')
        .update({ quantity: Number(existing.quantity) + newLineQty })
        .eq('id', existing.id)
    } else {
      await supabase.from('bom_lines').insert({
        bom_id: bomId, level: 1, quantity: newLineQty, [map.field]: compId,
      })
    }

    setNewLineType('')
    setNewLineCompId('')
    setNewLineQty(1)
    setComponentOptions([])
    await reloadLines(bomId)
    setAddingLine(false)
  }

  // ── Delete entire BOM ──
  async function deleteBom() {
    if (!selectedBom || !confirm(`¿Eliminar el BOM "${selectedBom.name}"? Esta acción no se puede deshacer.`)) return
    setDeletingBom(true)
    await supabase.from('bom_lines').delete().eq('bom_id', selectedBom.id)
    await supabase.from('boms').delete().eq('id', selectedBom.id)
    setSelectedBom(null)
    setLines([])
    setMode('view')
    setDeletingBom(false)
    await fetchBoms()
  }

  // ── Delete a line ──
  async function deleteLine(lineId: number) {
    if (!selectedBom) return
    setDeletingLineId(lineId)
    await supabase.from('bom_lines').delete().eq('id', lineId)
    await reloadLines(selectedBom.id)
    setDeletingLineId(null)
  }

  const totalCost = lines.reduce((s, l) => {
    const { cost } = getComponent(l)
    return s + cost * l.quantity
  }, 0)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">BOMs</h1>
          <p className="text-sm text-[#6E6E73] mt-1">Lista de materiales por producto</p>
        </div>
        <button
          onClick={enterNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[#1D1D1F] hover:bg-[#3a3a3a] transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Nuevo BOM
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* ── BOM list ── */}
        <div className="space-y-2">
          {boms.map(bom => {
            const s = STATUS_COLORS[bom.status] ?? STATUS_COLORS.draft
            const isSelected = selectedBom?.id === bom.id
            return (
              <button
                key={bom.id}
                onClick={() => selectBom(bom)}
                className="w-full text-left p-4 rounded-2xl transition-all"
                style={{
                  background: isSelected ? 'rgba(29,29,31,0.06)' : 'rgba(255,255,255,0.75)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: isSelected
                    ? '0 2px 16px rgba(0,0,0,0.06), 0 0 0 1.5px rgba(29,29,31,0.2)'
                    : '0 2px 16px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-medium text-[#1D1D1F] leading-tight">{bom.finished_products.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-2 flex-shrink-0"
                    style={{ color: s.color, background: s.bg }}>
                    {STATUS_LABELS[bom.status] ?? bom.status}
                  </span>
                </div>
                <p className="text-xs text-[#AEAEB2]">{bom.finished_products.product_code} · v{bom.version}</p>
              </button>
            )
          })}
        </div>

        {/* ── Right panel ── */}
        <div className="col-span-2">

          {/* Nothing selected and not creating new */}
          {!selectedBom && mode !== 'new' && (
            <div className="h-full min-h-64 rounded-2xl flex items-center justify-center text-[#AEAEB2] text-sm"
              style={{ background: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(0,0,0,0.1)' }}>
              Selecciona un BOM o crea uno nuevo
            </div>
          )}

          {/* ── NEW BOM form ── */}
          {mode === 'new' && (
            <div className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                <h2 className="text-base font-semibold text-[#1D1D1F]">Nuevo BOM</h2>
              </div>
              <div className="p-6 space-y-4">

                {/* Product toggle */}
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-[#6E6E73] uppercase tracking-wider">Producto</label>
                  <button
                    onClick={() => { setNewProduct(p => !p); setFormProduct(''); setNewProdName(''); setNewProdCode('') }}
                    className="text-xs font-medium transition-colors"
                    style={{ color: newProduct ? '#FF3B30' : '#0071E3' }}
                  >
                    {newProduct ? '← Seleccionar existente' : '+ Crear producto nuevo'}
                  </button>
                </div>

                {newProduct ? (
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl" style={{ background: 'rgba(0,113,227,0.05)', border: '1px solid rgba(0,113,227,0.12)' }}>
                    <div>
                      <label className="block text-[10px] text-[#6E6E73] mb-1 uppercase tracking-wider">Nombre del producto</label>
                      <input value={newProdName} onChange={e => setNewProdName(e.target.value)}
                        placeholder="ej. PC Gamer Pro"
                        className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none placeholder-[#AEAEB2]"
                        style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#6E6E73] mb-1 uppercase tracking-wider">Código</label>
                      <input value={newProdCode} onChange={e => setNewProdCode(e.target.value.toUpperCase())}
                        placeholder="ej. PC-010"
                        className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none placeholder-[#AEAEB2] font-mono"
                        style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}
                      />
                    </div>
                  </div>
                ) : (
                  <select value={formProduct} onChange={e => setFormProduct(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                    style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <option value="">Seleccionar producto existente...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} — {p.product_code}</option>)}
                  </select>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Nombre del BOM</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="ej. BOM Laptop v2.0"
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none placeholder-[#AEAEB2]"
                      style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Versión</label>
                    <input value={formVersion} onChange={e => setFormVersion(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                      style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Estado</label>
                    <select value={formStatus} onChange={e => setFormStatus(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                      style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>
                      <option value="draft">Borrador</option>
                      <option value="active">Activo</option>
                      <option value="obsolete">Obsoleto</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setMode('view')}
                    className="px-4 py-2 rounded-xl text-sm text-[#6E6E73] hover:bg-black/5 transition-all">
                    Cancelar
                  </button>
                  <button
                    onClick={saveNewBom}
                    disabled={!formName || (newProduct ? (!newProdName || !newProdCode) : !formProduct) || saving}
                    className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-all"
                    style={{ background: !formName || (newProduct ? (!newProdName || !newProdCode) : !formProduct) || saving ? '#AEAEB2' : '#1D1D1F' }}
                  >
                    {saving ? 'Guardando...' : 'Crear BOM'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW mode ── */}
          {selectedBom && mode === 'view' && (
            <div className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                <div>
                  <h2 className="text-base font-semibold text-[#1D1D1F]">{selectedBom.finished_products.name}</h2>
                  <p className="text-xs text-[#AEAEB2] mt-0.5">{selectedBom.name} · v{selectedBom.version}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={deleteBom} disabled={deletingBom}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:bg-red-50"
                    style={{ color: deletingBom ? '#AEAEB2' : '#FF3B30', border: '1px solid rgba(255,59,48,0.15)' }}>
                    {deletingBom ? (
                      <span className="w-3 h-3 border-2 border-[#AEAEB2]/30 border-t-[#AEAEB2] rounded-full animate-spin" />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 3h9M5 3V2h3v1M4 3l.5 8h4L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    Eliminar
                  </button>
                  <button onClick={enterEdit}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:bg-black/5"
                    style={{ color: '#1D1D1F', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M9 2l2 2-7 7H2V9l7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                    Editar
                  </button>
                </div>
              </div>

              {loadingLines ? (
                <div className="py-12 text-center text-sm text-[#AEAEB2]">Cargando...</div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                        <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">Tipo</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">Componente</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-[#6E6E73]">Cantidad</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-[#6E6E73]">Costo unit.</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-[#6E6E73]">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, i) => {
                        const { name, type, cost } = getComponent(line)
                        return (
                          <tr key={i} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                            <td className="px-6 py-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[#6E6E73]">{type}</span>
                            </td>
                            <td className="px-6 py-3 text-[#1D1D1F]">{name}</td>
                            <td className="px-6 py-3 text-right text-[#6E6E73]">{line.quantity}</td>
                            <td className="px-6 py-3 text-right text-[#6E6E73]">${cost.toLocaleString()}</td>
                            <td className="px-6 py-3 text-right font-medium text-[#1D1D1F]">
                              ${(cost * line.quantity).toLocaleString()}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t" style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(118,118,128,0.04)' }}>
                        <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-[#1D1D1F]">Costo total de manufactura</td>
                        <td className="px-6 py-3 text-right text-sm font-semibold text-[#1D1D1F]">
                          ${totalCost.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
          )}

          {/* ── EDIT mode ── */}
          {selectedBom && mode === 'edit' && (
            <div className="space-y-4">
              {/* Metadata form */}
              <div className="rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
                }}
              >
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                  <h2 className="text-base font-semibold text-[#1D1D1F]">Editando BOM</h2>
                  <button onClick={() => setMode('view')}
                    className="text-xs text-[#6E6E73] hover:text-[#1D1D1F] transition-colors">
                    ✕ Cancelar edición
                  </button>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="col-span-1">
                      <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Nombre</label>
                      <input value={formName} onChange={e => setFormName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                        style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Versión</label>
                      <input value={formVersion} onChange={e => setFormVersion(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                        style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Estado</label>
                      <select value={formStatus} onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                        style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <option value="draft">Borrador</option>
                        <option value="active">Activo</option>
                        <option value="obsolete">Obsoleto</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={saveBomEdits} disabled={saving}
                      className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-all"
                      style={{ background: saving ? '#AEAEB2' : '#1D1D1F' }}>
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Lines table with delete */}
              <div className="rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 2px 30px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
                }}
              >
                <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                  <p className="text-sm font-semibold text-[#1D1D1F]">Componentes</p>
                </div>

                {loadingLines ? (
                  <div className="py-8 text-center text-sm text-[#AEAEB2]">Cargando...</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                        <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">Tipo</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-[#6E6E73]">Componente</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-[#6E6E73]">Cantidad</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-[#6E6E73]">Subtotal</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-[#AEAEB2]">Sin componentes aún</td></tr>
                      )}
                      {lines.map(line => {
                        const { name, type, cost } = getComponent(line)
                        return (
                          <tr key={line.id} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                            <td className="px-6 py-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[#6E6E73]">{type}</span>
                            </td>
                            <td className="px-6 py-3 text-[#1D1D1F]">{name}</td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number" min={1}
                                value={editingQty[line.id] ?? line.quantity}
                                onChange={e => setEditingQty(prev => ({ ...prev, [line.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                                onBlur={() => saveLineQty(line.id)}
                                onKeyDown={e => e.key === 'Enter' && saveLineQty(line.id)}
                                className="w-16 px-2 py-1 rounded-lg text-sm text-center text-[#1D1D1F] outline-none"
                                style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                              />
                              {savingQtyId === line.id && <span className="text-[10px] text-[#AEAEB2] ml-1">...</span>}
                            </td>
                            <td className="px-6 py-3 text-right font-medium text-[#1D1D1F]">
                              ${(cost * (editingQty[line.id] ?? line.quantity)).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => deleteLine(line.id)}
                                disabled={deletingLineId === line.id}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-50"
                                style={{ color: deletingLineId === line.id ? '#AEAEB2' : '#FF3B30' }}
                              >
                                {deletingLineId === line.id ? (
                                  <span className="w-3 h-3 border-2 border-[#AEAEB2]/30 border-t-[#AEAEB2] rounded-full animate-spin" />
                                ) : (
                                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                    <path d="M2 3h9M5 3V2h3v1M4 3l.5 8h4L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {lines.length > 0 && (
                      <tfoot>
                        <tr className="border-t" style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(118,118,128,0.04)' }}>
                          <td colSpan={3} className="px-6 py-3 text-xs font-semibold text-[#1D1D1F]">Total manufactura</td>
                          <td className="px-6 py-3 text-right text-sm font-semibold text-[#1D1D1F]">
                            ${totalCost.toLocaleString()}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}

                {/* Add line form */}
                <div className="px-6 py-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(118,118,128,0.02)' }}>
                  <p className="text-xs font-medium text-[#6E6E73] uppercase tracking-wider mb-3">Agregar componente</p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[10px] text-[#AEAEB2] mb-1 uppercase tracking-wider">Tipo</label>
                      <select value={newLineType} onChange={e => loadComponentOptions(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none"
                        style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <option value="">Seleccionar tipo...</option>
                        {COMPONENT_MAP.map(m => <option key={m.type} value={m.type}>{m.label}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-[#AEAEB2] mb-1 uppercase tracking-wider">Componente</label>
                      <select value={newLineCompId} onChange={e => setNewLineCompId(e.target.value)}
                        disabled={!componentOptions.length}
                        className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none disabled:opacity-40"
                        style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <option value="">Seleccionar...</option>
                        {componentOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                    <div style={{ width: 80 }}>
                      <label className="block text-[10px] text-[#AEAEB2] mb-1 uppercase tracking-wider">Cant.</label>
                      <input type="number" min={1} value={newLineQty}
                        onChange={e => setNewLineQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none text-center"
                        style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
                      />
                    </div>
                    <button
                      onClick={addLine}
                      disabled={!newLineType || !newLineCompId || addingLine}
                      className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all flex-shrink-0"
                      style={{ background: !newLineType || !newLineCompId || addingLine ? '#AEAEB2' : '#1D1D1F' }}
                    >
                      {addingLine ? '...' : '+ Agregar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
