import { useEffect, useState, useCallback } from 'react'
import TreeExplorer from '@/components/ui/TreeExplorer/TreeExplorer'
import { db } from '@/lib/db'
import { useMemo } from 'react'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { DEFAULT_LABOR_SETTINGS, LABOR_SETTING_FIELDS, normalizeLaborSettings } from '@/lib/personnelConfig'

// ── Node type definitions ────────────────────────────────────
const CT = {
  // helper for TreeExplorer node meta
  getMeta(node) {
    const t = this[node.type] || this.depo;
    return {
      label: node.name,
      icon: t.icon,
      color: t.color,
      bg: t.bg,
      deleted: false,
    };
  },
  sirket:  { label:'Şirket',              icon:'fa-building',        bg:'#e2e8f0', color:'#0f172a', children:['tuzel','org'] },
  tuzel:   { label:'Tüzel Kişilik',       icon:'fa-landmark',        bg:'#dbeafe', color:'#1e40af', children:['org','sube','uretim','anadepo','gm'] },
  org:     { label:'Organizasyon Dept.',  icon:'fa-sitemap',         bg:'#ede9fe', color:'#5b21b6', children:['org','sube','uretim','anadepo','gm'] },
  sube:    { label:'Şube',                icon:'fa-store',           bg:'#e0f2fe', color:'#0369a1', children:['depo'] },
  anadepo: { label:'Ana Depo',            icon:'fa-warehouse',       bg:'#d1fae5', color:'#065f46', children:['depo','org'] },
  uretim:  { label:'Üretim',              icon:'fa-industry',        bg:'#ffedd5', color:'#9a3412', children:['depo','org'] },
  gm:      { label:'GM',                  icon:'fa-user-tie',        bg:'#fef3c7', color:'#92400e', children:['org'] },
  depo:    { label:'Depo',                icon:'fa-boxes-stacking',  bg:'#f1f5f9', color:'#374151', children:[] },
}

// ── Tree helpers ─────────────────────────────────────────────
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n
    const f = findNode(n.children || [], id)
    if (f) return f
  }
  return null
}

function deleteNode(nodes, id) {
  const idx = nodes.findIndex(n => n.id === id)
  if (idx > -1) { nodes.splice(idx, 1); return true }
  for (const n of nodes) { if (deleteNode(n.children || [], id)) return true }
  return false
}

// Returns the siblings array that contains nodeId (root array or parent's children)
function findSiblings(nodes, id, rootArr) {
  if (!rootArr) rootArr = nodes
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return rootArr
    const found = findSiblings(nodes[i].children || [], id, nodes[i].children || [])
    if (found) return found
  }
  return null
}

function moveNodeInArr(arr, id, dir) {
  const idx = arr.findIndex(n => n.id === id)
  if (idx === -1) return false
  const swapIdx = idx + dir
  if (swapIdx < 0 || swapIdx >= arr.length) return false
  ;[arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]
  return true
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

function buildNodeMeta(node, tree) {
  const items = []
  if (node.id) items.push(node.id.toUpperCase())
  const parentName = findParentName(tree, node.id)
  if (parentName) items.push(parentName)
  if (node.currency) items.push(node.currency)
  if (node.type === 'sirket' && node.salesTax) items.push('% KDV tanımlı')
  return items
}

// ── CTRow removed — renderDetail is defined inside Company() ────

// ── Main component ───────────────────────────────────────────
function createEmptyForm(type = 'sirket') {
  return {
    name:'', type,
    logo:'', currency:'',
    showSymbol:true, symbolBefore:true,
    showDecimal:true, decimalPlaces:2, invDecimal:4,
    salesTax:'', purchaseTax:'',
    laborSettings: { ...DEFAULT_LABOR_SETTINGS },
  }
}

function findParentName(nodes, childId, parentName = '') {
  for (const n of nodes) {
    if (n.id === childId) return parentName
    const found = findParentName(n.children || [], childId, n.name)
    if (found) return found
  }
  return ''
}

function getAllowedChildLabels(type) {
  const children = CT[type]?.children || []
  if (!children.length) return 'Yaprak düğüm'
  return children.map(key => CT[key]?.label || key).join(', ')
}

export default function Company() {
  const toast = useToast()
  const [tree, setTree]       = useState([])
  const [loading, setLoading] = useState(true)
  const [taxes, setTaxes]     = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(createEmptyForm())
  const [editId, setEditId]   = useState(null)
  const [parentNode, setParentNode] = useState(null)  // null = root
  const [allowedTypes, setAllowedTypes] = useState(['sirket'])
  const [confirm, setConfirm] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activePanelTab, setActivePanelTab] = useState('general')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cData }, { data: tData }] = await Promise.all([
      db.from('settings').select('value').eq('key', 'company_tree').single(),
      db.from('taxes').select('id, name, rate').order('rate'),
    ])
    setTree(cData?.value || [])
    setTaxes(tData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!tree.length) {
      setSelectedNodeId(null)
      return
    }
    if (!selectedNodeId || !findNode(tree, selectedNodeId)) {
      setSelectedNodeId(tree[0]?.id || null)
    }
  }, [tree, selectedNodeId])

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return findNode(tree, selectedNodeId)
  }, [tree, selectedNodeId])

  const selectedType = selectedNode ? (CT[selectedNode.type] || CT.depo) : null
  const selectedChildren = selectedNode?.children || []
  const selectedParentName = selectedNode ? findParentName(tree, selectedNode.id) : ''
  const selectedSalesTax = taxes.find(tax => tax.id === selectedNode?.salesTax)
  const selectedPurchaseTax = taxes.find(tax => tax.id === selectedNode?.purchaseTax)

  async function saveTree(newTree) {
    await db.from('settings').upsert({ key: 'company_tree', value: newTree }, { onConflict: 'key' })
    setTree([...newTree])
  }

  // ── Open modals ─────────────────────────────────────────────
  function openAddRoot() {
    setForm(createEmptyForm('sirket'))
    setEditId(null); setParentNode(null)
    setAllowedTypes(['sirket'])
    setModal(true)
  }

  function openAddChild(parent) {
    const t = CT[parent.type] || CT.depo
    if (!t.children.length) return
    setSelectedNodeId(parent.id)
    setActivePanelTab('children')
    setForm(createEmptyForm(t.children[0]))
    setEditId(null); setParentNode(parent)
    setAllowedTypes(t.children)
    setModal(true)
  }

  function openEdit(node) {
    setSelectedNodeId(node.id)
    setActivePanelTab('general')
    setForm({
      ...createEmptyForm(node.type),
      name: node.name, type: node.type,
      logo: node.logo || '', currency: node.currency || '',
      showSymbol: node.showSymbol !== false,
      symbolBefore: node.symbolBefore !== false,
      showDecimal: node.showDecimal !== false,
      decimalPlaces: node.decimalPlaces || 2,
      invDecimal: node.invDecimal || 4,
      salesTax: node.salesTax || '',
      purchaseTax: node.purchaseTax || '',
      laborSettings: normalizeLaborSettings(node.laborSettings),
    })
    setEditId(node.id); setParentNode(null)
    setAllowedTypes([node.type])
    setModal(true)
  }

  function closeModal() { setModal(false); setForm(createEmptyForm()); setEditId(null); setParentNode(null) }

  function toggleNode(id) { setCollapsed(s => ({ ...s, [id]: !s[id] })) }
  function selectNode(node) {
    setSelectedNodeId(node.id)
    setActivePanelTab('general')
  }
  function getAllIds(nodes) { return nodes.flatMap(n => [n.id, ...getAllIds(n.children || [])]) }
  function getCollapsibleIds(nodes) {
    return nodes.flatMap(n => [
      ...(n.type === 'sirket' ? [] : [n.id]),
      ...getCollapsibleIds(n.children || []),
    ])
  }
  function collapseAll() { setCollapsed(Object.fromEntries(getCollapsibleIds(tree).map(id => [id, true]))) }
  function expandAll() { setCollapsed({}) }

  const expandedIds = useMemo(
    () => new Set(getAllIds(tree).filter(id => collapsed[id] !== true)),
    [tree, collapsed]
  )

  // ── Save ────────────────────────────────────────────────────
  async function save() {
    if (!form.name.trim()) { toast('Ad zorunludur', 'error'); return }
    if (form.type === 'sirket' && !form.currency) { toast('Para birimi seçmelisiniz', 'error'); return }

    let extra = {}
    if (form.type === 'sirket') {
      extra = {
        logo: form.logo, currency: form.currency,
        showSymbol: form.showSymbol, symbolBefore: form.symbolBefore,
        showDecimal: form.showDecimal,
        decimalPlaces: parseInt(form.decimalPlaces) || 2,
        invDecimal: parseInt(form.invDecimal) || 4,
        salesTax: form.salesTax, purchaseTax: form.purchaseTax,
      }
    } else if (form.type === 'tuzel') {
      extra = {
        laborSettings: normalizeLaborSettings(form.laborSettings),
      }
    }

    const newTree = JSON.parse(JSON.stringify(tree))

    if (editId) {
      const node = findNode(newTree, editId)
      if (node) { node.name = form.name.trim(); Object.assign(node, extra) }
      await saveTree(newTree)
      setSelectedNodeId(editId)
      toast('Düğüm güncellendi', 'success')
    } else if (!parentNode) {
      const newId = uid()
      newTree.push({ id: newId, type: form.type, name: form.name.trim(), children: [], ...extra })
      await saveTree(newTree)
      setSelectedNodeId(newId)
      toast(`"${form.name}" eklendi`, 'success')
    } else {
      const parent = findNode(newTree, parentNode.id)
      if (parent) {
        if (!parent.children) parent.children = []
        const newId = uid()
        parent.children.push({ id: newId, type: form.type, name: form.name.trim(), children: [], ...extra })
        await saveTree(newTree)
        setCollapsed(s => ({ ...s, [parent.id]: false }))
        setSelectedNodeId(newId)
        setActivePanelTab('children')
        toast(`"${form.name}" eklendi`, 'success')
      }
    }
    closeModal()
  }

  // ── Delete ──────────────────────────────────────────────────
  async function remove(node) {
    const newTree = JSON.parse(JSON.stringify(tree))
    deleteNode(newTree, node.id)
    await saveTree(newTree)
    if (selectedNodeId === node.id) {
      setSelectedNodeId(newTree[0]?.id || null)
      setActivePanelTab('general')
    }
    toast(`"${node.name}" silindi`, 'info')
    setConfirm(null)
  }

  // ── Reorder: move selected node up (-1) or down (+1) ────────
  async function moveSelected(dir) {
    if (!selectedNodeId) return
    const newTree = JSON.parse(JSON.stringify(tree))
    const siblings = findSiblings(newTree, selectedNodeId)
    if (!siblings) return
    const moved = moveNodeInArr(siblings, selectedNodeId, dir)
    if (!moved) return
    await saveTree(newTree)
    toast(dir === -1 ? 'Yukarı taşındı' : 'Aşağı taşındı', 'success')
  }

  // Is selected node first/last among siblings?
  const selectedSiblings = useMemo(() => {
    if (!selectedNodeId) return []
    return findSiblings(tree, selectedNodeId) || []
  }, [tree, selectedNodeId])
  const selectedSiblingIdx = selectedSiblings.findIndex(n => n.id === selectedNodeId)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setLaborField = (key, value) => setForm(f => ({
    ...f,
    laborSettings: {
      ...f.laborSettings,
      [key]: value,
    },
  }))
  const t = CT[form.type] || CT.depo

  // Render detail panel for TreeExplorer
  const renderDetail = (node) => {
    const selectedNode = node;
    const selectedType = CT[selectedNode.type] || CT.depo;
    const selectedChildren = selectedNode.children || [];
    const selectedParentName = findParentName(tree, selectedNode.id);
    const selectedSalesTax = taxes.find(t => t.id === selectedNode.salesTax);
    const selectedPurchaseTax = taxes.find(t => t.id === selectedNode.purchaseTax);
    return (
      <>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:6 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:'.73rem', fontWeight:800, letterSpacing:'.08em', color:'#94a3b8' }}>
              {selectedType?.label?.toUpperCase() || 'DÜĞÜM'}
            </div>
            <div style={{ fontSize:'1.3rem', fontWeight:800, color:'#0f172a', marginTop:6, lineHeight:1.2 }}>
              {selectedNode.name}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
            {/* Sıralama butonları */}
            <div style={{ display:'flex', gap:2, background:'#f1f5f9', borderRadius:8, padding:2 }}>
              <button
                className="btn-g"
                disabled={selectedSiblingIdx <= 0}
                onClick={() => moveSelected(-1)}
                title="Yukarı taşı"
                style={{ padding:'6px 10px', fontSize:'.78rem', opacity: selectedSiblingIdx <= 0 ? 0.35 : 1 }}
              >
                <i className="fa-solid fa-arrow-up"/>
              </button>
              <button
                className="btn-g"
                disabled={selectedSiblingIdx < 0 || selectedSiblingIdx >= selectedSiblings.length - 1}
                onClick={() => moveSelected(1)}
                title="Aşağı taşı"
                style={{ padding:'6px 10px', fontSize:'.78rem', opacity: selectedSiblingIdx >= selectedSiblings.length - 1 ? 0.35 : 1 }}
              >
                <i className="fa-solid fa-arrow-down"/>
              </button>
            </div>
            <button className="btn-o" onClick={() => openEdit(selectedNode)} style={{ padding:'8px 14px', fontSize:'.82rem' }}>Düzenle</button>
            {(selectedType?.children || []).length > 0 && (
              <button className="btn-p" onClick={() => openAddChild(selectedNode)} style={{ padding:'8px 14px', fontSize:'.82rem' }}><i className="fa-solid fa-plus"/> Alt Düğüm</button>
            )}
          </div>
        </div>

        <div style={{
          background:selectedNode.type === 'depo' ? '#f8fafc' : selectedType?.bg || '#f8fafc',
          border:`1px solid ${selectedNode.type === 'depo' ? '#dbe3ef' : `${selectedType?.color || '#94a3b8'}22`}`,
          borderRadius:16,
          padding:'14px 16px',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
            <span className="badge" style={{ background:'#eef3fb', color:selectedType?.color || '#475569', fontSize:'.68rem' }}>
              {selectedType?.label || 'Düğüm'}
            </span>
            {selectedNode.currency && (
              <span className="badge" style={{ background:'#ffffffcc', color:'#64748b', fontSize:'.68rem' }}>{selectedNode.currency}</span>
            )}
          </div>
          <div style={{ fontSize:'.86rem', color:'#47607f', fontWeight:600 }}>
            Alt eklenebilir: {getAllowedChildLabels(selectedNode.type)}
          </div>
          <div style={{ display:'flex', gap:8, padding:4, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:14 }}>
            <button className={activePanelTab === 'general' ? 'btn-p' : 'btn-g'} onClick={() => setActivePanelTab('general')} style={{ flex:1, padding:'9px 12px', fontSize:'.8rem', boxShadow:'none' }}>Genel Bilgiler</button>
            <button className={activePanelTab === 'children' ? 'btn-p' : 'btn-g'} onClick={() => setActivePanelTab('children')} style={{ flex:1, padding:'9px 12px', fontSize:'.8rem', boxShadow:'none' }}>Alt Düğümler ({selectedChildren.length})</button>
          </div>
          {activePanelTab === 'general' ? (
            <div style={{ display:'grid', gap:12 }}>
              {[
                ['ID', selectedNode.id],
                ['Ad', selectedNode.name],
                ['Tür', selectedType?.label || '-'],
                ['Bağlı Olduğu', selectedParentName || '-'],
                ['Para Birimi', selectedNode.currency || '-'],
                ['Vergi Özeti', selectedSalesTax ? `${selectedSalesTax.name} (%${selectedSalesTax.rate})` : selectedNode.salesTax ? 'Tanımlı' : '-'],
                ['Alış Vergisi', selectedPurchaseTax ? `${selectedPurchaseTax.name} (%${selectedPurchaseTax.rate})` : selectedNode.purchaseTax ? 'Tanımlı' : '-'],
              ].map(([label, value]) => (
                <div key={label}>
                  <label className="f-label">{label}</label>
                  <div className="f-input" style={{ display:'flex', alignItems:'center', minHeight:44, color:value === '-' ? '#94a3b8' : '#475569', background:'#f8fbff' }}>{value}</div>
                </div>
              ))}
              {selectedNode.type === 'tuzel' && (
                <div style={{ border:'1px solid #e2e8f0', borderRadius:14, padding:14, background:'#fbfdff' }}>
                  <div style={{ fontSize:'.77rem', fontWeight:800, color:'#64748b', letterSpacing:'.05em', marginBottom:10 }}>İŞÇİLİK PARAMETRELERİ</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {LABOR_SETTING_FIELDS.slice(0,4).map(field => (
                      <div key={field.key}>
                        <div style={{ fontSize:'.72rem', color:'#94a3b8', marginBottom:5 }}>{field.label}</div>
                        <div className="f-input" style={{ display:'flex', alignItems:'center', minHeight:42, color:'#475569', background:'#f8fbff' }}>{selectedNode.laborSettings?.[field.key] ?? DEFAULT_LABOR_SETTINGS[field.key]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display:'grid', gap:10 }}>
              {selectedChildren.length === 0 ? (
                <div className="empty" style={{ padding:24, minHeight:180 }}>
                  <i className="fa-solid fa-diagram-project"/>
                  <div style={{ fontSize:'.95rem', fontWeight:700, color:'#334155' }}>Alt düğüm bulunmuyor</div>
                  <p style={{ fontSize:'.8rem' }}>Bu düğüm için istersen sağ üstten yeni bir alt düğüm ekleyebilirsin.</p>
                </div>
              ) : (
                selectedChildren.map(child => {
                  const childType = CT[child.type] || CT.depo;
                  return (
                    <button key={child.id} onClick={() => selectNode(child)} style={{
                      textAlign:'left',
                      border:'1px solid #e2e8f0',
                      borderRadius:16,
                      background:'#fff',
                      padding:'12px 14px',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'space-between',
                      gap:12,
                      boxShadow:'0 8px 18px rgba(15,23,42,.04)',
                      cursor:'pointer',
                    }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:6 }}>
                          <span className="badge" style={{ background:'#eef3fb', color:childType.color, fontSize:'.68rem' }}>{childType.label}</span>
                          <span style={{ fontSize:'.72rem', color:'#94a3b8' }}>{child.id}</span>
                        </div>
                        <div style={{ fontSize:'.98rem', fontWeight:700, color:'#0f172a' }}>{child.name}</div>
                      </div>
                      <i className="fa-solid fa-chevron-right" style={{ color:'#94a3b8' }}/>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </>
    );
  };


  // Logo upload
  function handleLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => set('logo', ev.target.result)
    reader.readAsDataURL(file)
  }

  // Common currencies
  const CURRENCIES = ['TRY','USD','EUR','GBP','CHF','JPY','SAR','AED','RUB','CNY']

  return (
    <div className="page-enter">
      <Header
        title="Şirket Kuruluşu"
        subtitle="Hiyerarşik şirket & şube yapısı"
        actions={<AddButton onClick={openAddRoot} label="Şirket Ekle" />}
      />

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1.8fr) minmax(320px, .82fr)', gap:18, alignItems:'start' }}>
        <div className="card" style={{ overflow:'hidden', padding:0, minHeight:300 }}>
          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>
              <i className="fa-solid fa-spinner fa-spin"/> Yükleniyor…
            </div>
          ) : tree.length === 0 ? (
            <div className="empty" style={{ padding:48 }}>
              <i className="fa-solid fa-sitemap"/>
              <div style={{ fontSize:'1rem', fontWeight:700, color:'#334155' }}>Henüz şirket eklenmedi</div>
              <p style={{ fontSize:'.83rem' }}>Sağ üstteki "Şirket Ekle" butonuna tıklayın</p>
            </div>
          ) : (
            <TreeExplorer
              nodes={tree}
              loading={loading}
              sectionTitle="Hiyerarşi"
              sectionSubtitle="Şirket, yönetim, depo ve şube bağları"
              selectedId={selectedNodeId}
              onSelect={selectNode}
              expandedIds={expandedIds}
              onToggle={toggleNode}
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
              getNodeMeta={node => {
                const t = CT[node.type] || CT.depo
                return { label: node.name, icon: t.icon, color: t.color, bg: t.bg, deleted: false }
              }}
              renderDetail={renderDetail}
              detailEmptyTitle="Bir düğüm seçin"
              detailEmptyText="Soldaki hiyerarşiden seçtiğiniz kayıt burada detaylarıyla görünür."
            />
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={closeModal} width={760}
        title={editId ? 'Düğümü Düzenle' : parentNode ? `Alt Düğüm Ekle → ${parentNode.name}` : 'Şirket Ekle'}
        footer={<>
          <button className="btn-g" onClick={closeModal}>İptal</button>
          <button className="btn-p" onClick={save}><i className="fa-solid fa-check"/> Kaydet</button>
        </>}>
        <div style={{ display:'grid', gap:14 }}>

          {/* Yazılımcı Notu */}
          <div style={{background:'#fff5f5',border:'1.5px dashed #fca5a5',borderRadius:8,
            padding:'8px 12px',display:'flex',alignItems:'flex-start',gap:8}}>
            <i className="fa-solid fa-triangle-exclamation" style={{color:'#dc2626',fontSize:'.8rem',marginTop:2,flexShrink:0}}/>
            <span style={{fontSize:'.75rem',color:'#dc2626',lineHeight:1.6}}>
              <strong>Yazılımcıya Not:</strong> Şirket kuruluşu için tüm ilk ayarlar için eksik kalanlar tamamlanmalıdır.
            </span>
          </div>

          {/* Type */}
          <div>
            <label className="f-label">Tür</label>
            <div className="sel-wrap">
              <select className="f-input" value={form.type}
                onChange={e => set('type', e.target.value)} disabled={!!editId}>
                {allowedTypes.map(k => (
                  <option key={k} value={k}>{CT[k]?.label || k}</option>
                ))}
              </select>
            </div>
            {/* Type preview badge */}
            <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8,
              padding:'8px 12px', borderRadius:8, background:t.bg, color:t.color,
              fontSize:'.8rem', fontWeight:600 }}>
              <i className={`fa-solid ${t.icon}`}/>
              <span>{t.label}</span>
              {t.children.length > 0
                ? <span style={{ opacity:.7 }}>— Alt eklenebilir: {t.children.map(k => CT[k]?.label || k).join(', ')}</span>
                : <span style={{ opacity:.7 }}>— Yaprak düğüm</span>}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="f-label">Ad <span style={{ color:'#ef4444' }}>*</span></label>
            <input className="f-input" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="ör. Ana Şirket, İstanbul Şubesi…"/>
          </div>

          {/* Şirket-only fields */}
          {form.type === 'tuzel' && (
            <div style={{ display:'grid', gap:12, border:'1px solid #dbeafe', borderRadius:14, padding:16, background:'#f8fbff' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'#dbeafe', color:'#1d4ed8', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="fa-solid fa-business-time"/>
                </div>
                <div>
                  <div style={{ fontWeight:800, color:'#0f172a' }}>İşçilik Parametreleri</div>
                  <div style={{ fontSize:'.8rem', color:'#64748b' }}>Bu tanımlar seçilen tüzel kişiliğe bağlı personel hesaplamalarında kullanılır.</div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:12 }}>
                {LABOR_SETTING_FIELDS.map(field => (
                  <div key={field.key}>
                    <label className="f-label">{field.label}</label>
                    <input
                      className="f-input"
                      type={field.type}
                      min={field.min}
                      step={field.step}
                      value={form.laborSettings?.[field.key] ?? ''}
                      onChange={e => setLaborField(field.key, e.target.value)}
                    />
                    {field.hint && <div className="f-hint">{field.hint}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {form.type === 'sirket' && <>
            {/* Logo */}
            <div>
              <label className="f-label">Logo <span style={{ fontSize:'.7rem', color:'#94a3b8', fontWeight:400 }}>(opsiyonel)</span></label>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <label style={{ cursor:'pointer' }}>
                  <span className="btn-o" style={{ fontSize:'.8rem', padding:'7px 14px' }}>
                    <i className="fa-solid fa-upload"/> Dosya Seç
                  </span>
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogo}/>
                </label>
                {form.logo && <img src={form.logo} style={{ height:32, borderRadius:6, border:'1.5px solid #e2e8f0' }} alt="logo"/>}
                {form.logo && <button className="btn-g" onClick={() => set('logo', '')} style={{ fontSize:'.75rem' }}>Kaldır</button>}
              </div>
            </div>

            {/* Currency */}
            <div>
              <label className="f-label">Para Birimi <span style={{ color:'#ef4444' }}>*</span></label>
              <div className="sel-wrap">
                <select className="f-input" value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <option value="">Para birimi seçin…</option>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Symbol settings */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.855rem', cursor:'pointer' }}>
                <input type="checkbox" checked={form.showSymbol} onChange={e => set('showSymbol', e.target.checked)}
                  style={{ width:16, height:16, accentColor:'#fbbf24' }}/>
                Para birimi sembolü göster
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.855rem', cursor:'pointer' }}>
                <input type="checkbox" checked={form.showDecimal} onChange={e => set('showDecimal', e.target.checked)}
                  style={{ width:16, height:16, accentColor:'#fbbf24' }}/>
                Ondalık göster
              </label>
            </div>

            {/* Decimal places */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="f-label">Satış Ondalık</label>
                <input className="f-input" type="number" min="0" max="6" value={form.decimalPlaces}
                  onChange={e => set('decimalPlaces', e.target.value)}/>
              </div>
              <div>
                <label className="f-label">Fatura Ondalık</label>
                <input className="f-input" type="number" min="0" max="6" value={form.invDecimal}
                  onChange={e => set('invDecimal', e.target.value)}/>
              </div>
            </div>

            {/* Tax */}
            <div style={{ borderTop:'1px dashed #e2e8f0', paddingTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="f-label">Satış Varsayılan Vergi <span style={{ fontSize:'.68rem', color:'#94a3b8' }}>(KDV)</span></label>
                <div className="sel-wrap">
                  <select className="f-input" value={form.salesTax} onChange={e => set('salesTax', e.target.value)}>
                    <option value="">Seçin…</option>
                    {taxes.map(t => <option key={t.id} value={t.id}>{t.name} (%{t.rate})</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="f-label">Satın Alma Varsayılan Vergi <span style={{ fontSize:'.68rem', color:'#94a3b8' }}>(KDV)</span></label>
                <div className="sel-wrap">
                  <select className="f-input" value={form.purchaseTax} onChange={e => set('purchaseTax', e.target.value)}>
                    <option value="">Seçin…</option>
                    {taxes.map(t => <option key={t.id} value={t.id}>{t.name} (%{t.rate})</option>)}
                  </select>
                </div>
              </div>
            </div>
          </>}

        </div>
      </Modal>

      <ConfirmDialog open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        desc="Tüm alt düğümler de silinecektir. Bu işlem geri alınamaz."
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}/>
    </div>
  )
}
