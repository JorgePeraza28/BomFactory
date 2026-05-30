import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useRole } from '../hooks/useRole'

interface Product { id: number; product_code: string; name: string }
interface BomLine {
  quantity: number
  processors?: { name: string; unit_cost: number }
  ram_modules?: { name: string; unit_cost: number }
  storage_units?: { name: string; unit_cost: number }
  motherboards?: { name: string; unit_cost: number }
  gpus?: { name: string; unit_cost: number }
  cases?: { name: string; unit_cost: number }
  power_supplies?: { name: string; unit_cost: number }
  coolers?: { name: string; unit_cost: number }
  laptop_cases?: { name: string; unit_cost: number }
  displays?: { name: string; unit_cost: number }
  keyboards?: { name: string; unit_cost: number }
  batteries?: { name: string; unit_cost: number }
  chargers?: { name: string; unit_cost: number }
  cables?: { name: string; unit_cost: number }
}
interface Order {
  id: number
  order_number: string
  status: string
  created_at: string
  finished_products?: { name: string }
}

interface OrderDetail {
  productId: number
  productName: string
  productCode: string
  quantity: number
  unitCost: number
  totalCost: number
  finishedStock: number
  lines: BomLine[]
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendiente',   color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)' },
  in_progress: { label: 'En proceso',  color: '#0071E3', bg: 'rgba(0,113,227,0.1)' },
  completed:   { label: 'Completado',  color: '#30D158', bg: 'rgba(48,209,88,0.1)' },
  cancelled:   { label: 'Cancelado',   color: '#FF3B30', bg: 'rgba(255,59,48,0.1)' },
}

function getComponentName(line: BomLine): string {
  const map = [
    line.processors, line.ram_modules, line.storage_units, line.motherboards,
    line.gpus, line.cases, line.power_supplies, line.coolers,
    line.laptop_cases, line.displays, line.keyboards, line.batteries,
    line.chargers, line.cables,
  ]
  return map.find(x => x)?.name ?? '—'
}

function getComponentCost(line: BomLine): number {
  const map = [
    line.processors, line.ram_modules, line.storage_units, line.motherboards,
    line.gpus, line.cases, line.power_supplies, line.coolers,
    line.laptop_cases, line.displays, line.keyboards, line.batteries,
    line.chargers, line.cables,
  ]
  return map.find(x => x)?.unit_cost ?? 0
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [qty, setQty] = useState(1)
  const [bomLines, setBomLines] = useState<BomLine[]>([])
  const [loadingBom, setLoadingBom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailCache, setDetailCache] = useState<Record<number, OrderDetail>>({})
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null)
  const perms = useRole()
  const [completing, setCompleting] = useState<number | null>(null)
  const [completeError, setCompleteError] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetchOrders()
    supabase.from('finished_products').select('id, product_code, name').then(({ data }) => {
      setProducts(data ?? [])
    })
  }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, status, created_at, order_lines(finished_products(name))')
      .order('created_at', { ascending: false })
    setOrders((data as any) ?? [])
  }

  async function loadBom(productId: string) {
    if (!productId) { setBomLines([]); return }
    setLoadingBom(true)
    const { data: bom } = await supabase
      .from('boms')
      .select('id')
      .eq('product_id', productId)
      .eq('status', 'active')
      .single()

    if (!bom) { setBomLines([]); setLoadingBom(false); return }

    const { data: lines } = await supabase
      .from('bom_lines')
      .select(`quantity,
        processors(name,unit_cost), ram_modules(name,unit_cost),
        storage_units(name,unit_cost), motherboards(name,unit_cost),
        gpus(name,unit_cost), cases(name,unit_cost),
        power_supplies(name,unit_cost), coolers(name,unit_cost),
        laptop_cases(name,unit_cost), displays(name,unit_cost),
        keyboards(name,unit_cost), batteries(name,unit_cost),
        chargers(name,unit_cost), cables(name,unit_cost)
      `)
      .eq('bom_id', bom.id)

    setBomLines((lines as any) ?? [])
    setLoadingBom(false)
  }

  const totalUnitCost = bomLines.reduce((sum, l) => sum + getComponentCost(l) * l.quantity, 0)
  const totalCost = totalUnitCost * qty

  async function createOrder() {
    if (!selectedProduct) return
    setSaving(true)

    const { data: bom } = await supabase
      .from('boms').select('id').eq('product_id', selectedProduct).eq('status', 'active').single()

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`
    const { data: order } = await supabase
      .from('orders')
      .insert({ order_number: orderNumber, status: 'pending' })
      .select().single()

    if (order && bom) {
      await supabase.from('order_lines').insert({
        order_id: order.id,
        product_id: parseInt(selectedProduct),
        bom_id: bom.id,
        quantity: qty,
        unit_cost: totalUnitCost,
        total_cost: totalCost,
      })
    }

    setSaving(false)
    setShowForm(false)
    setSelectedProduct('')
    setQty(1)
    setBomLines([])
    fetchOrders()
  }

  async function toggleExpand(orderId: number) {
    if (expandedId === orderId) { setExpandedId(null); return }
    setExpandedId(orderId)
    if (detailCache[orderId]) return

    setLoadingDetail(orderId)
    const { data: ol } = await supabase
      .from('order_lines')
      .select('product_id, quantity, unit_cost, total_cost, bom_id, finished_products(name, product_code)')
      .eq('order_id', orderId)
      .single()

    let lines: BomLine[] = []
    if (ol?.bom_id) {
      const { data: bomLines } = await supabase
        .from('bom_lines')
        .select(`quantity,
          processors(name,unit_cost), ram_modules(name,unit_cost),
          storage_units(name,unit_cost), motherboards(name,unit_cost),
          gpus(name,unit_cost), cases(name,unit_cost),
          power_supplies(name,unit_cost), coolers(name,unit_cost),
          laptop_cases(name,unit_cost), displays(name,unit_cost),
          keyboards(name,unit_cost), batteries(name,unit_cost),
          chargers(name,unit_cost), cables(name,unit_cost)
        `)
        .eq('bom_id', ol.bom_id)
      lines = (bomLines as any) ?? []
    }

    const fp = (ol as any)?.finished_products
    const productId = (ol as any)?.product_id ?? 0

    // Fetch finished inventory stock for this product
    const { data: fi } = await supabase
      .from('finished_inventory')
      .select('stock_qty')
      .eq('product_id', productId)
      .single()

    setDetailCache(prev => ({
      ...prev,
      [orderId]: {
        productId,
        productName: fp?.name ?? '—',
        productCode: fp?.product_code ?? '—',
        quantity: ol?.quantity ?? 0,
        unitCost: ol?.unit_cost ?? 0,
        totalCost: ol?.total_cost ?? 0,
        finishedStock: fi?.stock_qty ?? 0,
        lines,
      }
    }))
    setLoadingDetail(null)
  }

  async function changeStatus(orderId: number, status: string) {
    await supabase.from('orders').update({ status }).eq('id', orderId)
    fetchOrders()
  }

  async function completeOrder(orderId: number) {
    const detail = detailCache[orderId]
    if (!detail) return
    setCompleting(orderId)
    setCompleteError(prev => ({ ...prev, [orderId]: '' }))

    // Check finished_inventory
    const { data: fi } = await supabase
      .from('finished_inventory')
      .select('id, stock_qty')
      .eq('product_id', detail.productId)
      .single()

    const available = fi?.stock_qty ?? 0
    if (available < detail.quantity) {
      setCompleteError(prev => ({
        ...prev,
        [orderId]: `Stock insuficiente: tienes ${available} unidad${available !== 1 ? 'es' : ''} terminada${available !== 1 ? 's' : ''}, necesitas ${detail.quantity}.`,
      }))
      setCompleting(null)
      return
    }

    // Decrement finished_inventory
    await supabase.from('finished_inventory').update({
      stock_qty: available - detail.quantity,
      updated_at: new Date().toISOString(),
    }).eq('id', fi!.id)

    // Mark order completed
    await supabase.from('orders').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', orderId)

    // Update cached stock
    setDetailCache(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], finishedStock: available - detail.quantity },
    }))
    setCompleting(null)
    fetchOrders()
  }

  function generateInvoice(order: Order, detail: OrderDetail) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210
    const margin = 18

    // ── Header background band ──────────────────────────────────────────────
    doc.setFillColor(29, 29, 31)
    doc.roundedRect(margin, 12, W - margin * 2, 34, 4, 4, 'F')

    // Logo text
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(255, 255, 255)
    doc.text('BOM Factory', margin + 8, 27)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(174, 174, 178)
    doc.text('Manufactura de cómputo', margin + 8, 33)

    // Invoice label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(255, 255, 255)
    doc.text('FACTURA', W - margin - 8, 27, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(174, 174, 178)
    doc.text(`No. ${order.order_number}`, W - margin - 8, 33, { align: 'right' })

    // ── Meta row ─────────────────────────────────────────────────────────────
    const metaY = 54
    const s = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending

    const metas = [
      { label: 'Fecha', value: new Date(order.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) },
      { label: 'Producto', value: detail.productName },
      { label: 'Código', value: detail.productCode },
      { label: 'Cantidad', value: `${detail.quantity} unid.` },
      { label: 'Estado', value: s.label },
    ]
    const colW = (W - margin * 2) / metas.length
    metas.forEach((m, i) => {
      const x = margin + i * colW
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(110, 110, 115)
      doc.text(m.label.toUpperCase(), x, metaY)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(29, 29, 31)
      doc.text(m.value, x, metaY + 5)
    })

    // divider
    doc.setDrawColor(220, 220, 224)
    doc.setLineWidth(0.3)
    doc.line(margin, metaY + 9, W - margin, metaY + 9)

    // ── Components table ─────────────────────────────────────────────────────
    const tableHead = [['Componente', 'Cant. unit.', 'Total pzs', 'Costo unit.', 'Subtotal']]
    const tableBody = detail.lines.map(line => {
      const name = getComponentName(line)
      const cost = getComponentCost(line)
      return [
        name,
        String(line.quantity),
        String(line.quantity * detail.quantity),
        `$${cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
        `$${(cost * line.quantity * detail.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      ]
    })

    autoTable(doc, {
      startY: metaY + 13,
      head: tableHead,
      body: tableBody,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: [29, 29, 31] },
      headStyles: { fillColor: [245, 245, 247], textColor: [110, 110, 115], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 22 },
        3: { halign: 'right', cellWidth: 28 },
        4: { halign: 'right', cellWidth: 30 },
      },
      tableLineColor: [220, 220, 224],
      tableLineWidth: 0.2,
    })

    // ── Financial summary ────────────────────────────────────────────────────
    const finalY: number = (doc as any).lastAutoTable.finalY + 8
    const subtotal  = detail.totalCost
    const utilidad  = subtotal * 0.15
    const base      = subtotal + utilidad
    const iva       = base * 0.16
    const total     = base + iva

    const boxX = W - margin - 78
    const boxW = 78
    let rowY = finalY

    const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

    const summaryRows: [string, string, boolean, boolean][] = [
      ['Subtotal (costos)',      fmt(subtotal), false, false],
      ['Utilidad (15%)',         fmt(utilidad), false, false],
      ['IVA (16%)',              fmt(iva),       false, false],
    ]

    doc.setFontSize(8.5)
    summaryRows.forEach(([label, value, _bold, muted]) => {
      doc.setFont('helvetica', muted ? 'bold' : 'normal')
      doc.setTextColor(muted ? 29 : 110, muted ? 29 : 110, muted ? 31 : 115)
      doc.text(label, boxX, rowY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(29, 29, 31)
      doc.text(value, boxX + boxW, rowY, { align: 'right' })
      rowY += 6
    })

    // Divider before total
    doc.setDrawColor(29, 29, 31)
    doc.setLineWidth(0.4)
    doc.line(boxX, rowY - 1, boxX + boxW, rowY - 1)
    rowY += 4

    // TOTAL row
    doc.setFillColor(29, 29, 31)
    doc.roundedRect(boxX - 3, rowY - 5.5, boxW + 6, 10, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('TOTAL', boxX + 1, rowY + 1)
    doc.text(fmt(total), boxX + boxW - 1, rowY + 1, { align: 'right' })

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageH = 297
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(174, 174, 178)
    doc.text('BOM Factory · Manufactura de cómputo', margin, pageH - 12)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - margin, pageH - 12, { align: 'right' })
    doc.setDrawColor(220, 220, 224)
    doc.setLineWidth(0.25)
    doc.line(margin, pageH - 15, W - margin, pageH - 15)

    doc.save(`Factura-${order.order_number}.pdf`)
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Pedidos</h1>
          <p className="text-sm text-[#6E6E73] mt-1">Órdenes de producción</p>
        </div>
        {perms.canCreateOrder && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[#1D1D1F] hover:bg-[#3a3a3a] transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Nuevo pedido
          </button>
        )}
      </div>

      {/* New order panel */}
      {showForm && (
        <div
          className="mb-6 p-6 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 2px 30px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">Nuevo pedido</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Producto</label>
              <select
                value={selectedProduct}
                onChange={e => { setSelectedProduct(e.target.value); loadBom(e.target.value) }}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                <option value="">Seleccionar producto...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6E6E73] mb-1.5 uppercase tracking-wider">Cantidad</label>
              <input
                type="number" min={1} value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-[#1D1D1F] outline-none"
                style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
              />
            </div>
          </div>

          {/* BOM preview */}
          {loadingBom && <p className="text-sm text-[#AEAEB2] mb-4">Cargando componentes...</p>}
          {bomLines.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-[#6E6E73] uppercase tracking-wider mb-2">Componentes requeridos</p>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(118,118,128,0.06)' }}>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Componente</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Cant. unit.</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Total piezas</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Costo total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomLines.map((line, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                        <td className="px-4 py-2.5 text-[#1D1D1F]">{getComponentName(line)}</td>
                        <td className="px-4 py-2.5 text-right text-[#6E6E73]">{line.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-[#1D1D1F] font-medium">{line.quantity * qty}</td>
                        <td className="px-4 py-2.5 text-right text-[#1D1D1F]">
                          ${(getComponentCost(line) * line.quantity * qty).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t" style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(118,118,128,0.04)' }}>
                      <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-[#1D1D1F]">Costo total del pedido</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-[#1D1D1F]">
                        ${totalCost.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setBomLines([]); setSelectedProduct('') }}
              className="px-4 py-2 rounded-xl text-sm text-[#6E6E73] hover:bg-black/5 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={createOrder}
              disabled={!selectedProduct || saving}
              className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-all"
              style={{ background: !selectedProduct || saving ? '#AEAEB2' : '#1D1D1F' }}
            >
              {saving ? 'Guardando...' : 'Crear pedido'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="mb-5 p-4 rounded-2xl flex flex-wrap gap-3 items-end"
        style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', boxShadow: '0 2px 16px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)' }}
      >
        {/* Search */}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-medium text-[#6E6E73] uppercase tracking-wider mb-1.5">Número de orden</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AEAEB2]" width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ORD-100001..."
              className="w-full pl-8 pr-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none"
              style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
            />
          </div>
        </div>

        {/* Status filter */}
        <div className="min-w-[150px]">
          <label className="block text-[10px] font-medium text-[#6E6E73] uppercase tracking-wider mb-1.5">Estado</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none"
            style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En proceso</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>

        {/* Date from */}
        <div className="min-w-[145px]">
          <label className="block text-[10px] font-medium text-[#6E6E73] uppercase tracking-wider mb-1.5">Desde</label>
          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none"
            style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
          />
        </div>

        {/* Date to */}
        <div className="min-w-[145px]">
          <label className="block text-[10px] font-medium text-[#6E6E73] uppercase tracking-wider mb-1.5">Hasta</label>
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm text-[#1D1D1F] outline-none"
            style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)' }}
          />
        </div>

        {/* Clear */}
        {(search || filterStatus || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); setDateFrom(''); setDateTo('') }}
            className="px-4 py-2 rounded-xl text-sm text-[#6E6E73] hover:bg-black/5 transition-all self-end"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Orders list */}
      <div className="space-y-2">
        {(() => {
          const filtered = orders.filter(o => {
            if (search && !o.order_number.toLowerCase().includes(search.toLowerCase())) return false
            if (filterStatus && o.status !== filterStatus) return false
            if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false
            if (dateTo) {
              const to = new Date(dateTo); to.setHours(23,59,59,999)
              if (new Date(o.created_at) > to) return false
            }
            return true
          })
          if (filtered.length === 0) return (
            <div className="text-center py-16 text-[#AEAEB2] text-sm">
              {orders.length === 0 ? 'No hay pedidos aún' : 'No hay pedidos que coincidan con los filtros'}
            </div>
          )
          return filtered.map(order => {
          const s = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending
          const productName = (order as any).order_lines?.[0]?.finished_products?.name
          const isOpen = expandedId === order.id
          const detail = detailCache[order.id]
          const isLoadingThis = loadingDetail === order.id

          return (
            <div
              key={order.id}
              className="rounded-2xl overflow-hidden transition-all"
              style={{
                background: 'rgba(255,255,255,0.75)',
                backdropFilter: 'blur(12px)',
                boxShadow: isOpen
                  ? '0 4px 24px rgba(0,0,0,0.09), 0 0 0 1.5px rgba(29,29,31,0.12)'
                  : '0 2px 16px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >
              {/* Row header — clickable */}
              <button
                onClick={() => toggleExpand(order.id)}
                className="w-full p-4 flex items-center justify-between text-left transition-colors hover:bg-black/[0.02]"
              >
                <div className="flex items-center gap-3">
                  {/* Chevron */}
                  <span
                    className="text-[#AEAEB2] transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#1D1D1F]">{order.order_number}</p>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ color: s.color, background: s.bg }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#AEAEB2] mt-0.5">
                      {productName ?? 'Producto'} · {new Date(order.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Status selector — stop propagation so no toggle */}
                <div onClick={e => e.stopPropagation()}>
                  <select
                    value={order.status}
                    onChange={e => changeStatus(order.id, e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-lg outline-none cursor-pointer"
                    style={{ background: 'rgba(118,118,128,0.08)', border: '1px solid rgba(0,0,0,0.06)', color: '#6E6E73' }}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="in_progress">En proceso</option>
                    <option value="completed">Completado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </button>

              {/* Expandable detail */}
              {isOpen && (
                <div className="border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                  {isLoadingThis ? (
                    <div className="py-8 text-center text-sm text-[#AEAEB2]">Cargando especificaciones...</div>
                  ) : detail ? (
                    <div className="p-5">
                      {/* Summary pills */}
                      <div className="flex flex-wrap gap-3 mb-4">
                        {[
                          { label: 'Producto', value: detail.productName },
                          { label: 'Código', value: detail.productCode },
                          { label: 'Cantidad', value: `${detail.quantity} unid.` },
                          { label: 'Costo unitario', value: `$${detail.unitCost.toLocaleString()}` },
                          { label: 'Costo total', value: `$${detail.totalCost.toLocaleString()}` },
                        ].map(pill => (
                          <div
                            key={pill.label}
                            className="px-3 py-2 rounded-xl"
                            style={{ background: 'rgba(118,118,128,0.07)', border: '1px solid rgba(0,0,0,0.05)' }}
                          >
                            <p className="text-[10px] text-[#AEAEB2] uppercase tracking-wider">{pill.label}</p>
                            <p className="text-sm font-semibold text-[#1D1D1F] mt-0.5">{pill.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Components table */}
                      {detail.lines.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-[#6E6E73] uppercase tracking-wider mb-2">
                            Componentes del BOM
                          </p>
                          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                            <table className="w-full text-sm">
                              <thead>
                                <tr style={{ background: 'rgba(118,118,128,0.05)' }}>
                                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Componente</th>
                                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Cant. unit.</th>
                                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Total piezas</th>
                                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Costo unit.</th>
                                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[#6E6E73]">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.lines.map((line, i) => {
                                  const name = getComponentName(line)
                                  const cost = getComponentCost(line)
                                  return (
                                    <tr key={i} className="border-t" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                                      <td className="px-4 py-2.5 text-[#1D1D1F]">{name}</td>
                                      <td className="px-4 py-2.5 text-right text-[#6E6E73]">{line.quantity}</td>
                                      <td className="px-4 py-2.5 text-right font-medium text-[#1D1D1F]">{line.quantity * detail.quantity}</td>
                                      <td className="px-4 py-2.5 text-right text-[#6E6E73]">${cost.toLocaleString()}</td>
                                      <td className="px-4 py-2.5 text-right text-[#1D1D1F]">
                                        ${(cost * line.quantity * detail.quantity).toLocaleString()}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t" style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(118,118,128,0.04)' }}>
                                  <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-[#1D1D1F]">Total del pedido</td>
                                  <td className="px-4 py-3 text-right text-sm font-semibold text-[#1D1D1F]">
                                    ${detail.totalCost.toLocaleString()}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </>
                      )}

                      {/* ── PDF Button ── */}
                      {perms.canDownloadInvoice && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => generateInvoice(order, detail)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                          style={{ background: 'rgba(0,113,227,0.08)', color: '#0071E3', border: '1px solid rgba(0,113,227,0.15)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M7 1v8M4 6l3 3 3-3" stroke="#0071E3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 11h10" stroke="#0071E3" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          Descargar factura PDF
                        </button>
                      </div>
                      )}

                      {/* ── Complete order + stock ── */}
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => completeOrder(order.id)}
                              disabled={completing === order.id}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                              style={{ background: completing === order.id ? '#AEAEB2' : '#2a9d5c' }}
                            >
                              {completing === order.id ? (
                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <circle cx="7" cy="7" r="6" stroke="white" strokeWidth="1.5"/>
                                  <path d="M4.5 7l2 2L9.5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                              {completing === order.id ? 'Verificando...' : 'Completar pedido'}
                            </button>

                            {completeError[order.id] && (
                              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
                                style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30', border: '1px solid rgba(255,59,48,0.15)' }}>
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                  <path d="M6.5 1.5L12 11.5H1L6.5 1.5z" stroke="#FF3B30" strokeWidth="1.5" strokeLinejoin="round"/>
                                  <path d="M6.5 5.5v3M6.5 10v.5" stroke="#FF3B30" strokeWidth="1.3" strokeLinecap="round"/>
                                </svg>
                                {completeError[order.id]}
                              </div>
                            )}
                          </div>

                          {/* Stock badge */}
                          <div className="text-right">
                            <p className="text-[10px] text-[#AEAEB2] uppercase tracking-wider mb-0.5">Stock disponible</p>
                            <div className="flex items-center justify-end gap-1.5">
                              <span
                                className="text-lg font-semibold"
                                style={{ color: (detail.finishedStock ?? 0) >= detail.quantity ? '#2a9d5c' : '#FF3B30' }}
                              >
                                {detail.finishedStock ?? 0}
                              </span>
                              <span className="text-xs text-[#AEAEB2]">/ {detail.quantity} necesarios</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )
        })
        })()}
      </div>
    </div>
  )
}
