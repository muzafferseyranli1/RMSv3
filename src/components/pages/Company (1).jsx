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
  tuzel:   { label:'Tüzel Kişilik',       icon:'fa-landmark',        bg:'#dbeafe', color:'#1e40af', children:['sube','uretim','anadepo','gm','org','depo'] },
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
    latitude: '', longitude: '',
    taxNumber: '',
    legalTitle: '',
    taxOffice: '',
    legalAddress: '',
    isLegalEntity: type === 'tuzel' || type === 'sirket',
    parentLegalEntityId: '',
    centerKind: 'franchise_center',
  }
}

function getLegalEntityNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  const list = []
  for (const n of nodes) {
    if (n.type === 'tuzel' || n.type === 'sirket' || n.isLegalEntity || n.is_legal_entity || n.taxNumber || n.tax_number) {
      list.push(n)
    }
    if (n.children && n.children.length) {
      list.push(...getLegalEntityNodes(n.children))
    }
  }
  return list
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

function getAnaDepoNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  const list = []
  for (const n of nodes) {
    if (n.type === 'anadepo') {
      list.push(n)
    }
    if (n.children && n.children.length) {
      list.push(...getAnaDepoNodes(n.children))
    }
  }
  return list
}

function getUretimNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  const list = []
  for (const n of nodes) {
    if (n.type === 'uretim') {
      list.push(n)
    }
    if (n.children && n.children.length) {
      list.push(...getUretimNodes(n.children))
    }
  }
  return list
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
  const legalEntityNodes = useMemo(() => getLegalEntityNodes(tree), [tree])

  async function saveTree(newTree) {
    await db.from('settings').upsert({ key: 'company_tree', value: newTree }, { onConflict: 'key' })
    setTree([...newTree])

    // Sync nodes to suppliers
    try {
      // 1. Sync anadepo nodes to suppliers
      const anadepoNodes = getAnaDepoNodes(newTree)
      const activeSyncKeys = anadepoNodes.map(n => `anadepo_${n.id}`)

      // Upsert current warehouse nodes
      for (const node of anadepoNodes) {
        const syncKey = `anadepo_${node.id}`
        const { error: upsertErr } = await db.from('suppliers').upsert({
          name: node.name,
          supplier_kind: 'internal_warehouse',
          source_workspace_scope: 'anadepo',
          source_branch_id: node.id,
          is_system_generated: true,
          sync_key: syncKey,
          active: true,
          deleted_at: null
        }, { onConflict: 'sync_key' })
        if (upsertErr) throw upsertErr
      }

      // Fetch all system-generated internal warehouses to deactivate deleted ones
      const { data: existingSuppliers, error: selectErr } = await db.from('suppliers')
        .select('id, sync_key')
        .eq('supplier_kind', 'internal_warehouse')
        .eq('is_system_generated', true)

      if (selectErr) throw selectErr

      if (existingSuppliers) {
        for (const s of existingSuppliers) {
          if (s.sync_key && !activeSyncKeys.includes(s.sync_key)) {
            // Soft delete/deactivate this warehouse since it was removed from the tree
            const { error: updateErr } = await db.from('suppliers').update({
              active: false,
              deleted_at: new Date().toISOString()
            }).eq('id', s.id)
            if (updateErr) throw updateErr
          }
        }
      }

      // 2. Sync uretim (Merkez Mutfak) nodes to suppliers
      const uretimNodes = getUretimNodes(newTree)
      const activeKitchenSyncKeys = uretimNodes.map(n => `uretim_${n.id}`)

      // Upsert current kitchen nodes
      for (const node of uretimNodes) {
        const syncKey = `uretim_${node.id}`
        const { error: upsertErr } = await db.from('suppliers').upsert({
          name: node.name,
          supplier_kind: 'internal_kitchen',
          source_workspace_scope: 'uretim',
          source_branch_id: node.id,
          is_system_generated: true,
          sync_key: syncKey,
          active: true,
          deleted_at: null
        }, { onConflict: 'sync_key' })
        if (upsertErr) throw upsertErr
      }

      // Fetch all system-generated internal kitchens to deactivate deleted ones
      const { data: existingKitchens, error: selectKitchenErr } = await db.from('suppliers')
        .select('id, sync_key')
        .eq('supplier_kind', 'internal_kitchen')
        .eq('is_system_generated', true)

      if (selectKitchenErr) throw selectKitchenErr

      if (existingKitchens) {
        for (const s of existingKitchens) {
          if (s.sync_key && !activeKitchenSyncKeys.includes(s.sync_key)) {
            // Soft delete/deactivate this kitchen since it was removed from the tree
            const { error: updateErr } = await db.from('suppliers').update({
              active: false,
              deleted_at: new Date().toISOString()
            }).eq('id', s.id)
            if (updateErr) throw updateErr
          }
        }
      }
    } catch (err) {
      console.error('Tedarikçi senkronizasyon hatası:', err)
      toast('Tedarikçi senkronizasyonunda hata oluştu: ' + err.message, 'error')
    }
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
      latitude: node.latitude !== undefined && node.latitude !== null ? String(node.latitude) : '',
      longitude: node.longitude !== undefined && node.longitude !== null ? String(node.longitude) : '',
      taxNumber: node.taxNumber || node.tax_number || '',
      legalTitle: node.legalTitle || node.legal_title || '',
      taxOffice: node.taxOffice || node.tax_office || '',
      legalAddress: node.legalAddress || node.legal_address || '',
      isLegalEntity: Boolean(node.isLegalEntity ?? node.is_legal_entity ?? (node.type === 'tuzel' || node.type === 'sirket')),
      parentLegalEntityId: node.parentLegalEntityId || node.parent_legal_entity_id || '',
      centerKind: node.centerKind || node.center_kind || (node.name?.includes('Muzaffer') ? 'headquarters' : 'franchise_center'),
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

    let extra = {
      taxNumber: form.taxNumber?.trim() || '',
      legalTitle: form.legalTitle?.trim() || '',
      taxOffice: form.taxOffice?.trim() || '',
      legalAddress: form.legalAddress?.trim() || '',
      isLegalEntity: Boolean(form.isLegalEntity || form.type === 'tuzel' || form.type === 'sirket'),
      parentLegalEntityId: form.parentLegalEntityId || null,
      centerKind: form.centerKind || 'franchise_center',
    }
    if (form.type === 'sirket') {
      Object.assign(extra, {
        logo: form.logo, currency: form.currency,
        showSymbol: form.showSymbol, symbolBefore: form.symbolBefore,
        showDecimal: form.showDecimal,
        decimalPlaces: parseInt(form.decimalPlaces) || 2,
        invDecimal: parseInt(form.invDecimal) || 4,
        salesTax: form.salesTax, purchaseTax: form.purchaseTax,
      })
    } else if (form.type === 'tuzel') {
      Object.assign(extra, {
        laborSettings: normalizeLaborSettings(form.laborSettings),
      })
    } else if (form.type === 'sube') {
      Object.assign(extra, {
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      })
    }

    const newTree = JSON.parse(JSON.stringify(tree))
    let activeTargetId = editId

    if (editId) {
      const node = findNode(newTree, editId)
      if (node) { node.name = form.name.trim(); Object.assign(node, extra) }
    } else if (!parentNode) {
      const newId = uid()
      activeTargetId = newId
      newTree.push({ id: newId, type: form.type, name: form.name.trim(), children: [], ...extra })
    } else {
      const parent = findNode(newTree, parentNode.id)
      if (parent) {
        if (!parent.children) parent.children = []
        const newId = uid()
        activeTargetId = newId
        parent.children.push({ id: newId, type: form.type, name: form.name.trim(), children: [], ...extra })
        setCollapsed(s => ({ ...s, [parent.id]: false }))
      }
    }

    // Enforce single headquarters constraint across the tree
    if (extra.centerKind === 'headquarters') {
      function clearOtherHeadquarters(nodes, targetId) {
        for (const n of nodes) {
          if (n.id !== targetId && (n.type === 'tuzel' || n.type === 'sirket' || n.isLegalEntity)) {
            n.centerKind = 'franchise_center'
          }
          if (n.children && n.children.length) {
            clearOtherHeadquarters(n.children, targetId)
          }
        }
      }
      clearOtherHeadquarters(newTree, activeTargetId)
    }

    await saveTree(newTree)
    if (activeTargetId) setSelectedNodeId(activeTargetId)
    toast(editId ? 'Düğüm güncellendi' : `"${form.name}" eklendi`, 'success')
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
                ...(selectedNode.type === 'sube' ? [
                  ['Enlem (Latitude)', selectedNode.latitude !== undefined && selectedNode.latitude !== null ? selectedNode.latitude : '-'],
                  ['Boylam (Longitude)', selectedNode.longitude !== undefined && selectedNode.longitude !== null ? selectedNode.longitude : '-'],
                ] : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <label className="f-label">{label}</label>
                  <div className="f-input" style={{ display:'flex', alignItems:'center', minHeight:44, color:value === '-' ? '#94a3b8' : '#475569', background:'#f8fbff' }}>{value}</div>
                </div>
              ))}

              {/* Tüzel Kişilik & E-Fatura Kartı */}
              <div style={{ border:'1px solid #dbeafe', borderRadius:14, padding:14, background:'#f0f7ff' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:'.77rem', fontWeight:800, color:'#1e40af', letterSpacing:'.05em', display:'flex', alignItems:'center', gap:6 }}>
                    <i className="fa-solid fa-landmark" /> TÜZEL KİŞİLİK & E-FATURA
                  </div>
                  <span className="badge" style={{ background: (selectedNode.isLegalEntity || selectedNode.type === 'tuzel' || selectedNode.type === 'sirket') ? '#dcfce7' : '#f1f5f9', color: (selectedNode.isLegalEntity || selectedNode.type === 'tuzel' || selectedNode.type === 'sirket') ? '#166534' : '#64748b', fontSize:'.7rem' }}>
                    {(selectedNode.isLegalEntity || selectedNode.type === 'tuzel' || selectedNode.type === 'sirket') ? 'Bağımsız Tüzel Kişilik' : 'Şube / Depo Düğümü'}
                  </span>
                </div>
                <div style={{ display:'grid', gap:8, fontSize:'.8rem' }}>
                  {(selectedNode.isLegalEntity || selectedNode.type === 'tuzel' || selectedNode.type === 'sirket') && (
                    <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #e2e8f0', paddingBottom:6 }}>
                      <span style={{ color:'#64748b', fontWeight:600 }}>Merkez Statüsü:</span>
                      {(selectedNode.centerKind === 'headquarters' || (!selectedNode.centerKind && selectedNode.name?.includes('Muzaffer'))) ? (
                        <span className="badge" style={{ background:'#0284c7', color:'#ffffff', fontWeight:800, padding:'3px 10px', fontSize:'.72rem' }}>
                          <i className="fa-solid fa-building-columns" style={{ marginRight:4 }} /> Genel Merkez
                        </span>
                      ) : (
                        <span className="badge" style={{ background:'#ffedd5', color:'#c2410c', fontWeight:800, padding:'3px 10px', fontSize:'.72rem' }}>
                          <i className="fa-solid fa-store" style={{ marginRight:4 }} /> Franchise Merkez
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #e2e8f0', paddingBottom:4 }}>
                    <span style={{ color:'#64748b' }}>VKN / TCKN:</span>
                    <strong style={{ fontFamily:'monospace', color:'#0f172a' }}>{selectedNode.taxNumber || selectedNode.tax_number || '-'}</strong>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #e2e8f0', paddingBottom:4 }}>
                    <span style={{ color:'#64748b' }}>Resmi Ünvan:</span>
                    <strong style={{ color:'#0f172a', textAlign:'right', maxWidth:'60%' }}>{selectedNode.legalTitle || selectedNode.legal_title || selectedNode.name || '-'}</strong>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #e2e8f0', paddingBottom:4 }}>
                    <span style={{ color:'#64748b' }}>Vergi Dairesi:</span>
                    <strong style={{ color:'#0f172a' }}>{selectedNode.taxOffice || selectedNode.tax_office || '-'}</strong>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:'#64748b' }}>Yasal Adres:</span>
                    <span style={{ color:'#334155', textAlign:'right', maxWidth:'60%', fontSize:'.75rem' }}>{selectedNode.legalAddress || selectedNode.legal_address || '-'}</span>
                  </div>
                </div>
              </div>
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

          {/* Tüzel Kişilik & E-Fatura Tanımları */}
          <div style={{ display:'grid', gap:12, border:'1px solid #cbd5e1', borderRadius:14, padding:16, background:'#f8fafc' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'#e0f2fe', color:'#0369a1', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="fa-solid fa-landmark"/>
                </div>
                <div>
                  <div style={{ fontWeight:800, color:'#0f172a', fontSize:'.9rem' }}>Tüzel Kişilik & E-Fatura / E-İrsaliye Bilgileri</div>
                  <div style={{ fontSize:'.75rem', color:'#64748b' }}>GİB e-Fatura ve şirketler arası transfer faturalandırması için kullanılır.</div>
                </div>
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.82rem', fontWeight:700, color:'#1e293b', cursor:'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.isLegalEntity}
                  onChange={e => set('isLegalEntity', e.target.checked)}
                  style={{ width:16, height:16, accentColor:'#0284c7' }}
                />
                Bu Düğüm Ayrı Bir Tüzel Kişiliktir
              </label>
            </div>

            {form.isLegalEntity ? (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
                {/* Genel Merkez / Franchise Merkez Toggle */}
                <div style={{ gridColumn: 'span 2', background: '#ffffff', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                  <label className="f-label" style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6, display: 'block' }}>
                    Merkez Statüsü Seçimi <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8, background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
                    <button
                      type="button"
                      onClick={() => set('centerKind', 'headquarters')}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: form.centerKind === 'headquarters' ? '#0284c7' : 'transparent',
                        color: form.centerKind === 'headquarters' ? '#ffffff' : '#64748b',
                        fontWeight: 800,
                        fontSize: '.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: form.centerKind === 'headquarters' ? '0 2px 8px rgba(2,132,199,0.3)' : 'none',
                        transition: 'all .15s',
                      }}
                    >
                      <i className="fa-solid fa-building-columns" />
                      Genel Merkez
                    </button>
                    <button
                      type="button"
                      onClick={() => set('centerKind', 'franchise_center')}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: form.centerKind === 'franchise_center' ? '#ea580c' : 'transparent',
                        color: form.centerKind === 'franchise_center' ? '#ffffff' : '#64748b',
                        fontWeight: 800,
                        fontSize: '.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: form.centerKind === 'franchise_center' ? '0 2px 8px rgba(234,88,12,0.3)' : 'none',
                        transition: 'all .15s',
                      }}
                    >
                      <i className="fa-solid fa-store" />
                      Franchise Merkez
                    </button>
                  </div>
                  <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fa-solid fa-circle-info" style={{ color: form.centerKind === 'headquarters' ? '#0284c7' : '#ea580c' }} />
                    {form.centerKind === 'headquarters'
                      ? '⭐ Genel Merkez tek bir tüzel kişilikte seçili olabilir. Başka bir tüzel kişilikte Genel Merkez seçilirse bu otomatik Genel Merkez olur.'
                      : '🏪 Franchise işletmelerinin bağlı olduğu merkez tüzel kişiliğidir. Yeni eklenen tüzel kişilikler varsayılan olarak bu statüdedir.'}
                  </div>
                </div>

                <div>
                  <label className="f-label">VKN / TCKN <span style={{ color:'#ef4444' }}>*</span></label>
                  <input
                    className="f-input"
                    maxLength={11}
                    value={form.taxNumber}
                    onChange={e => set('taxNumber', e.target.value.replace(/\D/g, ''))}
                    placeholder="10 veya 11 haneli vergi no"
                  />
                </div>
                <div>
                  <label className="f-label">Resmi Ticari Ünvan</label>
                  <input
                    className="f-input"
                    value={form.legalTitle}
                    onChange={e => set('legalTitle', e.target.value)}
                    placeholder="ör. ABC Gıda Restorancılık A.Ş."
                  />
                </div>
                <div>
                  <label className="f-label">Vergi Dairesi</label>
                  <input
                    className="f-input"
                    value={form.taxOffice}
                    onChange={e => set('taxOffice', e.target.value)}
                    placeholder="ör. Beşiktaş / Kadıköy"
                  />
                </div>
                <div>
                  <label className="f-label">Yasal Tebligat / Şirket Adresi</label>
                  <input
                    className="f-input"
                    value={form.legalAddress}
                    onChange={e => set('legalAddress', e.target.value)}
                    placeholder="ör. Nispetiye Cad. No:12 Beşiktaş / İstanbul"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="f-label">Bağlı Olduğu Tüzel Kişilik (Fatura Kesici)</label>
                <div className="sel-wrap">
                  <select
                    className="f-input"
                    value={form.parentLegalEntityId || ''}
                    onChange={e => set('parentLegalEntityId', e.target.value)}
                  >
                    <option value="">Üst Hiyerarşiden Otomatik Devral</option>
                    {legalEntityNodes.map(le => (
                      <option key={le.id} value={le.id}>
                        {le.name} {le.taxNumber ? `(VKN: ${le.taxNumber})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize:'.74rem', color:'#64748b', marginTop:4 }}>
                  Bu şube/depodan yapılacak transferlerde e-fatura seçilen veya üstteki ana tüzel kişilik adına kesilir.
                </div>
              </div>
            )}
          </div>

          {/* Şube Koordinatları */}
          {form.type === 'sube' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="f-label">Enlem (Latitude)</label>
                <input
                  type="number"
                  step="0.000001"
                  className="f-input"
                  value={form.latitude}
                  onChange={e => set('latitude', e.target.value)}
                  placeholder="örn. 41.028595"
                />
              </div>
              <div>
                <label className="f-label">Boylam (Longitude)</label>
                <input
                  type="number"
                  step="0.000001"
                  className="f-input"
                  value={form.longitude}
                  onChange={e => set('longitude', e.target.value)}
                  placeholder="örn. 29.177221"
                />
              </div>
            </div>
          )}

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
