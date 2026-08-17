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
  sirket:      { label:'Şirket',              icon:'fa-building',        bg:'#e2e8f0', color:'#0f172a', children:['tuzel','org'] },
  tuzel:       { label:'Tüzel Kişilik',       icon:'fa-landmark',        bg:'#dbeafe', color:'#1e40af', children:['sube','uretim','anadepo','gm','org'] },
  org:         { label:'Organizasyon Dept.',  icon:'fa-sitemap',         bg:'#ede9fe', color:'#5b21b6', children:['org','sube','uretim','anadepo','gm'] },
  sube:        { label:'Şube',                icon:'fa-store',           bg:'#e0f2fe', color:'#0369a1', children:['depo','cloud_brand'] },
  cloud_brand: { label:'Sanal Marka',         icon:'fa-cloud-meatball',  bg:'#f3e8ff', color:'#7e22ce', children:['depo'] },
  anadepo:     { label:'Ana Depo',            icon:'fa-warehouse',       bg:'#d1fae5', color:'#065f46', children:['depo','org'] },
  uretim:      { label:'Üretim',              icon:'fa-industry',        bg:'#ffedd5', color:'#9a3412', children:['depo','org'] },
  gm:          { label:'GM',                  icon:'fa-user-tie',        bg:'#fef3c7', color:'#92400e', children:['org'] },
  depo:        { label:'Depo',                icon:'fa-boxes-stacking',  bg:'#f1f5f9', color:'#374151', children:[] },
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

// ── Bulut Mutfak Şube Çocuk Düğümleri Oluşturucu ────────────────
function buildSubeChildren(branchName, selectedBrands = [], existingChildren = [], separateWarehouses = false) {
  // Korunacak mevcut normal çocuk düğümler (varsa)
  const existingNonBrandChildren = (existingChildren || []).filter(c => c.type !== 'cloud_brand' && !c.isCloudBrand)

  // Ana Depo var mı kontrol et, yoksa varsayılan Ana Depoyu ekle
  const hasAnaDepo = existingNonBrandChildren.some(c => c.type === 'depo' || c.name?.includes('Ana Deposu'))
  const mainDepotNode = hasAnaDepo ? null : {
    id: uid(),
    type: 'depo',
    name: `${branchName} Ana Deposu`,
    children: []
  }

  const result = [...existingNonBrandChildren]
  if (mainDepotNode) {
    result.unshift(mainDepotNode)
  }

  // Seçilen her Bulut Mutfak Sanal Markası için çocuk düğüm oluştur
  for (const brandName of selectedBrands) {
    if (separateWarehouses) {
      // Formül: düğüm adı + marka adı + deposu (ör. Antalya Lara Şubesi Burger Lab (Virtual) Deposu)
      const brandDepotName = `${branchName} ${brandName} Deposu`
      result.push({
        id: uid(),
        type: 'cloud_brand',
        name: brandName,
        isCloudBrand: true,
        children: [
          {
            id: uid(),
            type: 'depo',
            name: brandDepotName,
            isAutoBrandDepot: true,
            children: []
          }
        ]
      })
    } else {
      // Tek Depo / Ortak Depo kullanılacak: markaları alt alta şubenin altına yaz
      result.push({
        id: uid(),
        type: 'cloud_brand',
        name: brandName,
        isCloudBrand: true,
        children: []
      })
    }
  }

  return result
}

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
    selectedCloudBrands: [],
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
  const [cloudBrandsList, setCloudBrandsList] = useState([])
  const [ckSeparateWarehouses, setCkSeparateWarehouses] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(createEmptyForm())
  const [editId, setEditId]   = useState(null)
  const [parentNode, setParentNode] = useState(null)  // null = root
  const [allowedTypes, setAllowedTypes] = useState(['sirket'])
  const [confirm, setConfirm] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activePanelTab, setActivePanelTab] = useState('general')

  const loadCloudKitchenData = useCallback(async () => {
    try {
      const [{ data: brandsData }, { data: settingsData }] = await Promise.all([
        db.from('cloud_kitchen_brands').select('*').order('created_at', { ascending: true }),
        db.from('cloud_kitchen_settings').select('*').limit(1),
      ])
      if (brandsData) {
        setCloudBrandsList(brandsData.filter(b => b.active !== false))
      }
      if (settingsData && settingsData.length > 0) {
        setCkSeparateWarehouses(Boolean(settingsData[0].separate_warehouses))
      }
    } catch (err) {
      console.error('Bulut Mutfak verileri yüklenirken hata:', err)
    }
  }, [])

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

  useEffect(() => {
    load()
    loadCloudKitchenData()
  }, [load, loadCloudKitchenData])

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
      const uretimNodes = getUretimNodes(newTree)

      // Get existing system suppliers (to check if they need sync)
      const { data: existingSuppliers } = await db.from('suppliers').select('id, name, is_system')

      // Sync AnaDepo
      for (const node of anadepoNodes) {
        const supplierName = `${node.name} (Ana Depo)`
        const match = existingSuppliers?.find(s => s.name === supplierName)
        if (!match) {
          await db.from('suppliers').insert({
            name: supplierName,
            contact_person: 'Sistem Otomatik',
            is_system: true,
            notes: 'Şirket Ağacı Ana Depo senkronizasyonu',
          })
        }
      }

      // Sync Uretim
      for (const node of uretimNodes) {
        const supplierName = `${node.name} (Üretim)`
        const match = existingSuppliers?.find(s => s.name === supplierName)
        if (!match) {
          await db.from('suppliers').insert({
            name: supplierName,
            contact_person: 'Sistem Otomatik',
            is_system: true,
            notes: 'Şirket Ağacı Üretim Tesisi senkronizasyonu',
          })
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
      selectedCloudBrands: Array.isArray(node.selectedCloudBrands) ? node.selectedCloudBrands : [],
    })
    setEditId(node.id); setParentNode(null)
    setAllowedTypes([node.type])
    setModal(true)
  }

  function closeModal() { setModal(false); setForm(createEmptyForm()); setEditId(null); setParentNode(null) }

  function toggleCloudBrand(brandName) {
    setForm(prev => {
      const current = prev.selectedCloudBrands || []
      const next = current.includes(brandName)
        ? current.filter(b => b !== brandName)
        : [...current, brandName]
      return { ...prev, selectedCloudBrands: next }
    })
  }

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

  // ── Form helpers ────────────────────────────────────────────
  function set(k, v) { setForm(s => ({ ...s, [k]: v })) }
  function setLabor(k, v) {
    setForm(s => ({
      ...s,
      laborSettings: {
        ...s.laborSettings,
        [k]: v,
      },
    }))
  }

  async function save() {
    if (!form.name.trim()) { toast('İsim girmelisiniz', 'error'); return }
    if (form.type === 'sirket' && !form.currency) { toast('Para birimi seçmelisiniz', 'error'); return }

    let extra = {
      taxNumber: form.taxNumber?.trim() || '',
      legalTitle: form.legalTitle?.trim() || '',
      taxOffice: form.taxOffice?.trim() || '',
      legalAddress: form.legalAddress?.trim() || '',
      isLegalEntity: Boolean(form.isLegalEntity || form.type === 'tuzel' || form.type === 'sirket'),
      parentLegalEntityId: form.parentLegalEntityId || null,
      centerKind: form.centerKind || 'franchise_center',
      selectedCloudBrands: Array.isArray(form.selectedCloudBrands) ? form.selectedCloudBrands : [],
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
    const unitTypesAutoWarehouse = ['sube', 'uretim', 'anadepo', 'gm', 'org']

    if (editId) {
      const node = findNode(newTree, editId)
      if (node) {
        node.name = form.name.trim()
        Object.assign(node, extra)
        if (node.type === 'sube') {
          node.children = buildSubeChildren(
            node.name,
            extra.selectedCloudBrands,
            node.children || [],
            ckSeparateWarehouses
          )
        }
      }
    } else if (!parentNode) {
      const newId = uid()
      activeTargetId = newId
      const autoChildren = form.type === 'sube'
        ? buildSubeChildren(form.name.trim(), extra.selectedCloudBrands, [], ckSeparateWarehouses)
        : unitTypesAutoWarehouse.includes(form.type) ? [
          { id: uid(), type: 'depo', name: `${form.name.trim()} Ana Deposu`, children: [] }
        ] : []
      newTree.push({ id: newId, type: form.type, name: form.name.trim(), children: autoChildren, ...extra })
    } else {
      const parent = findNode(newTree, parentNode.id)
      if (parent) {
        if (!parent.children) parent.children = []
        const newId = uid()
        activeTargetId = newId
        const autoChildren = form.type === 'sube'
          ? buildSubeChildren(form.name.trim(), extra.selectedCloudBrands, [], ckSeparateWarehouses)
          : unitTypesAutoWarehouse.includes(form.type) ? [
            { id: uid(), type: 'depo', name: `${form.name.trim()} Ana Deposu`, children: [] }
          ] : []
        parent.children.push({ id: newId, type: form.type, name: form.name.trim(), children: autoChildren, ...extra })
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
  function confirmDelete(node) { setConfirm(node) }
  async function handleConfirmDelete() {
    if (!confirm) return
    const id = confirm.id
    const newTree = JSON.parse(JSON.stringify(tree))
    deleteNode(newTree, id)
    await saveTree(newTree)

    if (selectedNodeId === id) {
      setSelectedNodeId(newTree[0]?.id || null)
    }

    toast('Düğüm silindi', 'info')
    setConfirm(null)
  }

  // ── Move Up / Move Down ────────────────────────────────────
  async function moveNode(nodeId, dir) {
    const newTree = JSON.parse(JSON.stringify(tree))
    const siblings = findSiblings(newTree, nodeId)
    if (!siblings) return
    const ok = moveNodeInArr(siblings, nodeId, dir)
    if (!ok) return
    await saveTree(newTree)
  }

  function renderDetail() {
    if (!selectedNode) return null

    const typeObj = CT[selectedNode.type] || CT.depo
    const nodeSalesTax = taxes.find(t => t.id === selectedNode.salesTax)
    const nodePurchaseTax = taxes.find(t => t.id === selectedNode.purchaseTax)

    return (
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Card Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: typeObj.bg, color: typeObj.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              <i className={`fa-solid ${typeObj.icon}`} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a' }}>{selectedNode.name}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{typeObj.label}</span>
                {selectedParentName && <span>• Bağlı: {selectedParentName}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-g" onClick={() => openEdit(selectedNode)} style={{ padding: '6px 12px', fontSize: '.82rem' }}>
              <i className="fa-solid fa-pen" /> Düzenle
            </button>
            {typeObj.children.length > 0 && (
              <button className="btn-p" onClick={() => openAddChild(selectedNode)} style={{ padding: '6px 12px', fontSize: '.82rem' }}>
                <i className="fa-solid fa-plus" /> Alt Düğüm
              </button>
            )}
          </div>
        </div>

        {/* Panel Tabs */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0' }}>
          <button
            onClick={() => setActivePanelTab('general')}
            style={{
              padding: '8px 16px', border: 'none', background: 'none',
              borderBottom: activePanelTab === 'general' ? '2px solid #0284c7' : '2px solid transparent',
              color: activePanelTab === 'general' ? '#0284c7' : '#64748b',
              fontWeight: 700, fontSize: '.85rem', cursor: 'pointer'
            }}
          >
            Genel Bilgiler
          </button>
          <button
            onClick={() => setActivePanelTab('children')}
            style={{
              padding: '8px 16px', border: 'none', background: 'none',
              borderBottom: activePanelTab === 'children' ? '2px solid #0284c7' : '2px solid transparent',
              color: activePanelTab === 'children' ? '#0284c7' : '#64748b',
              fontWeight: 700, fontSize: '.85rem', cursor: 'pointer'
            }}
          >
            Alt Düğümler ({selectedChildren.length})
          </button>
        </div>

        {activePanelTab === 'general' && (
          <div style={{ display: 'grid', gap: 14 }}>
            {selectedNode.type === 'sube' && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.88rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-cloud-meatball" style={{ color: '#8b5cf6' }} /> Bulut Mutfak Sanal Markaları
                </div>
                {Array.isArray(selectedNode.selectedCloudBrands) && selectedNode.selectedCloudBrands.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selectedNode.selectedCloudBrands.map(b => (
                      <span key={b} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 8, fontSize: '.8rem', fontWeight: 700, color: '#6b21a8' }}>
                        <i className="fa-solid fa-tag" style={{ color: '#8b5cf6', marginRight: 4 }} /> {b}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '.82rem', color: '#94a3b8', fontStyle: 'italic' }}>Atanmış Bulut Mutfak markası bulunmuyor.</div>
                )}
              </div>
            )}

            {selectedNode.isLegalEntity && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.88rem', marginBottom: 8 }}>E-Fatura & GİB Resmi Bilgileri</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '.82rem' }}>
                  <div><span style={{ color: '#64748b' }}>VKN/TCKN:</span> <strong>{selectedNode.taxNumber || '—'}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Vergi Dairesi:</span> <strong>{selectedNode.taxOffice || '—'}</strong></div>
                  <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b' }}>Ticari Ünvan:</span> <strong>{selectedNode.legalTitle || '—'}</strong></div>
                  <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b' }}>Adres:</span> <strong>{selectedNode.legalAddress || '—'}</strong></div>
                </div>
              </div>
            )}

            {selectedNode.type === 'sube' && (selectedNode.latitude || selectedNode.longitude) && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.88rem', marginBottom: 8 }}>Şube Konum Koordinatları</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '.82rem' }}>
                  <div><span style={{ color: '#64748b' }}>Enlem (Lat):</span> <strong>{selectedNode.latitude}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Boylam (Lng):</span> <strong>{selectedNode.longitude}</strong></div>
                </div>
              </div>
            )}
          </div>
        )}

        {activePanelTab === 'children' && (
          <div>
            {selectedChildren.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: '.88rem' }}>
                Bu düğümün altında henüz kayıtlı alt eleman bulunmuyor.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {selectedChildren.map(child => {
                  const ct = CT[child.type] || CT.depo
                  return (
                    <div
                      key={child.id}
                      onClick={() => selectNode(child)}
                      style={{
                        padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: ct.bg, color: ct.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem' }}>
                          <i className={`fa-solid ${ct.icon}`} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#0f172a' }}>{child.name}</div>
                          <div style={{ fontSize: '.75rem', color: '#64748b' }}>{ct.label}</div>
                        </div>
                      </div>
                      <i className="fa-solid fa-chevron-right" style={{ fontSize: '.8rem', color: '#cbd5e1' }} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-enter" style={{ paddingBottom: 40 }}>
      <Header
        title="Şirket Ağacı & Organizasyon Hiyerarşisi"
        subtitle="Şirketler, tüzel kişilikler, şubeler, depolar ve Bulut Mutfak yapılanmasını yönetin."
        actions={(
          <AddButton onClick={openAddRoot} label="Şirket Ekle" />
        )}
      />

      <div className="card" style={{ padding: 20 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" /> Organizasyon ağacı yükleniyor...
          </div>
        ) : (
          <TreeExplorer
            nodes={tree}
            tree={tree}
            sectionTitle="Hiyerarşi"
            sectionSubtitle="Şirket, yönetim, depo ve şube bağları"
            selectedId={selectedNodeId}
            onSelect={selectNode}
            expandedIds={collapsed}
            onToggle={toggleNode}
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
            getNodeMeta={node => CT.getMeta(node)}
            renderDetail={renderDetail}
            detailEmptyTitle="Bir düğüm seçin"
            detailEmptyText="Soldaki hiyerarşiden seçtiğiniz kayıt burada detaylarıyla görünür."
          />
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={closeModal} width={760}
        title={editId ? 'Düğümü Düzenle' : parentNode ? `Alt Düğüm Ekle → ${parentNode.name}` : 'Şirket Ekle'}
        footer={<>
          <button className="btn-g" onClick={closeModal}>İptal</button>
          <button className="btn-p" onClick={save}><i className="fa-solid fa-check"/> Kaydet</button>
        </>}>
        <div style={{ display:'grid', gap:14 }}>

          {/* Düğüm Tipi Seçimi (Yalnızca yeni düğüm eklerken) */}
          {!editId && allowedTypes.length > 1 && (
            <div>
              <label className="f-label">Düğüm Tipi <span style={{ color:'#ef4444' }}>*</span></label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {allowedTypes.map(key => {
                  const t = CT[key] || CT.depo
                  const sel = form.type === key
                  return (
                    <button type="button" key={key} onClick={() => set('type', key)} style={{
                      padding:'8px 14px', borderRadius:10, fontSize:'.85rem', fontWeight:700,
                      border: sel ? `2px solid ${t.color}` : '1px solid #cbd5e1',
                      background: sel ? t.bg : '#fff', color: sel ? t.color : '#64748b',
                      cursor:'pointer', display:'flex', alignItems:'center', gap:8
                    }}>
                      <i className={`fa-solid ${t.icon}`}/> {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="f-label">Ad <span style={{ color:'#ef4444' }}>*</span></label>
            <input className="f-input" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="ör. Ana Şirket, İstanbul Şubesi…"/>
          </div>

          {/* Merkez Statüsü Seçimi */}
          {(form.isLegalEntity || form.type === 'tuzel' || form.type === 'sirket') && (
            <div style={{ background: '#ffffff', padding: 14, borderRadius: 14, border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(15,23,42,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-sitemap" style={{ color: form.centerKind === 'headquarters' ? '#0284c7' : '#ea580c' }} />
                  Merkez Statüsü Seçimi <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <span style={{ fontSize: '.73rem', padding: '2px 8px', borderRadius: 10, background: form.centerKind === 'headquarters' ? '#e0f2fe' : '#ffedd5', color: form.centerKind === 'headquarters' ? '#0369a1' : '#c2410c', fontWeight: 800 }}>
                  {form.centerKind === 'headquarters' ? '⭐ Ana Sistem Genel Merkezi' : '🏪 Franchise Şirket Merkezi'}
                </span>
              </div>
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
                    justify: 'center',
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
                    justify: 'center',
                    gap: 8,
                    boxShadow: form.centerKind === 'franchise_center' ? '0 2px 8px rgba(234,88,12,0.3)' : 'none',
                    transition: 'all .15s',
                  }}
                >
                  <i className="fa-solid fa-store" />
                  Franchise Merkez
                </button>
              </div>
            </div>
          )}

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

          {/* Bulut Mutfak Markaları Seçim Alanı (Sadece Şube Düğümlerinde Gösterilir) */}
          {form.type === 'sube' && (
            <div style={{ display: 'grid', gap: 10, border: '1px solid #cbd5e1', borderRadius: 14, padding: 16, background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-cloud-meatball" style={{ color: '#8b5cf6' }} />
                  Bulut Mutfak Markaları Seçimi
                </div>
                <span
                  style={{
                    fontSize: '.72rem',
                    padding: '3px 10px',
                    borderRadius: 8,
                    background: ckSeparateWarehouses ? 'rgba(139, 92, 246, 0.15)' : '#e0f2fe',
                    color: ckSeparateWarehouses ? '#8b5cf6' : '#0369a1',
                    fontWeight: 800,
                  }}
                >
                  {ckSeparateWarehouses ? '📦 Ayrı Depo Modu Aktif' : '🏢 Ortak Depo Modu Aktif'}
                </span>
              </div>

              <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                Bu şube altında faaliyet gösterecek Bulut Mutfak sanal markalarını seçin (1 veya daha fazla seçilebilir):
              </div>

              {cloudBrandsList.length === 0 ? (
                <div style={{ fontSize: '.82rem', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                  Sistemde tanımlı aktif sanal marka bulunmuyor. (Bulut Mutfak sayfasından yeni marka ekleyebilirsiniz)
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {cloudBrandsList.map(brand => {
                    const selected = (form.selectedCloudBrands || []).includes(brand.name)
                    return (
                      <button
                        type="button"
                        key={brand.id || brand.name}
                        onClick={() => toggleCloudBrand(brand.name)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 10,
                          fontSize: '.82rem',
                          fontWeight: 700,
                          border: selected ? '1px solid #8b5cf6' : '1px solid #cbd5e1',
                          background: selected ? 'rgba(139, 92, 246, 0.15)' : '#ffffff',
                          color: selected ? '#8b5cf6' : '#64748b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all .15s',
                        }}
                      >
                        <i className={`fa-solid ${selected ? 'fa-square-check' : 'fa-plus'}`} />
                        {brand.name}
                      </button>
                    )
                  })}
                </div>
              )}

              <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fa-solid fa-circle-info" style={{ color: '#8b5cf6' }} />
                {ckSeparateWarehouses
                  ? 'Ayrı Depo Modu: Seçilen her marka şubenin altına eklenir ve her birinin altına "[Düğüm Adı] [Marka Adı] Deposu" otomatik oluşturulur.'
                  : 'Ortak Depo Modu: Seçilen markalar alt alta şubenin altına eklenir.'}
              </div>
            </div>
          )}

          {/* E-Fatura & Yasal Ünvan Tanımları */}
          {(form.isLegalEntity || form.type === 'tuzel' || form.type === 'sirket') && (
            <div style={{ display:'grid', gap:12, border:'1px solid #cbd5e1', borderRadius:14, padding:16, background:'#f8fafc' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'#e0f2fe', color:'#0369a1', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="fa-solid fa-landmark"/>
                </div>
                <div>
                  <div style={{ fontWeight:800, color:'#0f172a', fontSize:'.9rem' }}>E-Fatura / E-İrsaliye & Yasal Bilgiler (GİB)</div>
                  <div style={{ fontSize:'.75rem', color:'#64748b' }}>Tüzel kişilik adına kesilecek e-Fatura, e-İrsaliye ve vergi bildirimleri için kullanılır.</div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
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
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm?.name}" düğümü silinsin mi?`}
        text="Bu işlem seçilen düğümü ve varsa tüm alt elemanlarını kalıcı olarak silecektir."
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
