import { useEffect, useMemo, useState } from 'react'
import TreeExplorer, { findTreeNode, getTreeExpandableIds } from '@/components/ui/TreeExplorer/TreeExplorer'

function findParentName(nodes, id, parentName = '') {
  for (const node of nodes || []) {
    if (node.id === id) return parentName
    const match = findParentName(node.children || [], id, node.name)
    if (match) return match
  }
  return ''
}

function hasMask(mask, appendType, appendLen) {
  return Boolean(mask || (appendType && appendLen))
}

function buildSkuState(node, systemMask, genSku, appendLabel) {
  const categoryMask = hasMask(node?.sku_mask, node?.append_type, node?.append_len)
  const systemHasMask = hasMask(systemMask?.mask, systemMask?.appendType, systemMask?.appendLen)

  if (categoryMask) {
    return {
      preview: genSku(node.sku_mask, node.append_type, node.append_len),
      rule: appendLabel(node.append_type, node.append_len),
      source: 'category',
    }
  }

  if (systemHasMask) {
    return {
      preview: genSku(systemMask.mask || '', systemMask.appendType || '', systemMask.appendLen || 4),
      rule: `Sistem varsayilani - ${appendLabel(systemMask.appendType, systemMask.appendLen)}`,
      source: 'system',
    }
  }

  return {
    preview: '-',
    rule: 'Tanimli degil',
    source: 'none',
  }
}

function shortId(value) {
  const text = String(value || '')
  if (text.length <= 10) return text.toUpperCase()
  return `${text.slice(0, 10).toUpperCase()}...`
}

function FieldList({ rows }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <label className="f-label">{label}</label>
          <div
            className="f-input"
            style={{
              display: 'flex',
              alignItems: 'center',
              minHeight: 44,
              color: value === '-' ? '#94a3b8' : '#475569',
              background: '#f8fbff',
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CategoryHierarchyView({
  tree,
  loading,
  emptyText,
  sectionTitle = 'Hiyerarsi',
  sectionSubtitle = 'Kategori baglari',
  collapsedMap,
  onToggle,
  onEdit,
  onAddChild,
  onDelete,
  onRestore,
  genSku,
  appendLabel,
  systemMask,
  accountLabel,
  accountChipLabel = 'Bagli hesap',
  getAccountName,
  loadingText = 'Yukleniyor...',
}) {
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activeTab, setActiveTab] = useState('general')

  useEffect(() => {
    if (!tree.length) {
      setSelectedNodeId(null)
      return
    }
    if (!selectedNodeId || !findTreeNode(tree, selectedNodeId)) {
      setSelectedNodeId(tree[0]?.id || null)
    }
  }, [tree, selectedNodeId])

  const expandedIds = useMemo(
    () => new Set(getTreeExpandableIds(tree).filter(id => collapsedMap?.[id] !== true)),
    [collapsedMap, tree],
  )

  function getNodeMeta(node) {
    const skuState = buildSkuState(node, systemMask, genSku, appendLabel)
    const accountName = getAccountName?.(node)
    const badges = [
      { label: shortId(node.id), bg: 'var(--surface-2)' },
      ...(skuState.preview !== '-' ? [{
        label: skuState.source === 'system' ? `${skuState.preview} sys` : skuState.preview,
        bg: skuState.source === 'system' ? '#fff7ed' : '#ede9fe',
        color: skuState.source === 'system' ? '#c2410c' : '#5b21b6',
      }] : []),
      ...(accountName ? [{ label: accountChipLabel, bg: '#e0f2fe', color: '#0369a1' }] : []),
    ]

    return {
      label: node.name,
      icon: (node.children || []).length > 0 ? 'fa-folder' : 'fa-tag',
      color: node.text_color || '#64748b',
      deleted: Boolean(node.deleted_at),
      badges,
    }
  }

  function renderDetail(selectedNode) {
    const parentName = findParentName(tree, selectedNode.id)
    const selectedChildren = selectedNode.children || []
    const selectedSkuState = buildSkuState(selectedNode, systemMask, genSku, appendLabel)
    const selectedAccountName = getAccountName?.(selectedNode) || ''
    const canAddChild = Boolean(selectedNode && !selectedNode.deleted_at)

    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.73rem', fontWeight: 800, letterSpacing: '.08em', color: '#94a3b8' }}>KATEGORI</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginTop: 6, lineHeight: 1.2 }}>
              {selectedNode.name}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!selectedNode.deleted_at && (
              <button className="btn-o" onClick={() => onEdit(selectedNode)} style={{ padding: '8px 14px', fontSize: '.82rem' }}>
                Duzenle
              </button>
            )}
            {canAddChild && (
              <button className="btn-p" onClick={() => onAddChild(selectedNode.id)} style={{ padding: '8px 14px', fontSize: '.82rem' }}>
                <i className="fa-solid fa-plus" /> Alt Kategori
              </button>
            )}
            <button
              className="btn-g"
              onClick={() => (selectedNode.deleted_at ? onRestore(selectedNode) : onDelete(selectedNode))}
              style={{ padding: '8px 12px', fontSize: '.82rem', color: selectedNode.deleted_at ? '#166534' : '#b91c1c' }}
            >
              <i className={`fa-solid fa-${selectedNode.deleted_at ? 'rotate-left' : 'trash'}`} />
            </button>
          </div>
        </div>

        <div
          style={{
            background: selectedNode.deleted_at ? '#fff7f7' : selectedNode.bg || '#f8fafc',
            border: `1px solid ${selectedNode.deleted_at ? '#fecaca' : `${selectedNode.text_color || '#94a3b8'}22`}`,
            borderRadius: 8,
            padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span className="badge" style={{ background: '#eef3fb', color: selectedNode.text_color || '#475569', fontSize: '.68rem' }}>
              Kategori
            </span>
            {selectedSkuState?.source === 'system' && (
              <span className="badge" style={{ background: '#fff7ed', color: '#c2410c', fontSize: '.68rem' }}>
                Sistem SKU
              </span>
            )}
            {selectedNode.deleted_at && (
              <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '.68rem' }}>
                Silinmis
              </span>
            )}
          </div>
          <div style={{ fontSize: '.86rem', color: '#47607f', fontWeight: 600 }}>
            Alt kategori eklenebilir, renk ve muhasebe baglari bu panelden takip edilir.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <button
            className={activeTab === 'general' ? 'btn-p' : 'btn-g'}
            onClick={() => setActiveTab('general')}
            style={{ flex: 1, padding: '9px 12px', fontSize: '.8rem', boxShadow: 'none' }}
          >
            Genel Bilgiler
          </button>
          <button
            className={activeTab === 'children' ? 'btn-p' : 'btn-g'}
            onClick={() => setActiveTab('children')}
            style={{ flex: 1, padding: '9px 12px', fontSize: '.8rem', boxShadow: 'none' }}
          >
            Alt Kategoriler ({selectedChildren.length})
          </button>
        </div>

        {activeTab === 'general' ? (
          <FieldList rows={[
            ['Ad', selectedNode.name],
            ['Ust Kategori', parentName || '-'],
            ['SKU Onizleme', selectedSkuState?.preview || '-'],
            ['SKU Kurali', selectedSkuState?.rule || '-'],
            ['Muhasebe Kategorisi', selectedNode.acc_cat || '-'],
            ['Muhasebe Hesap Kodu', selectedNode.acc_code || '-'],
            [accountLabel, selectedAccountName || '-'],
            ['Aciklama', selectedNode.description || '-'],
            ['Durum', selectedNode.deleted_at ? 'Silinmis' : 'Aktif'],
          ]} />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {selectedChildren.length === 0 ? (
              <div className="empty" style={{ padding: 24, minHeight: 180 }}>
                <i className="fa-solid fa-diagram-project" />
                <div style={{ fontSize: '.95rem', fontWeight: 700, color: '#334155' }}>Alt kategori bulunmuyor</div>
                <p style={{ fontSize: '.8rem' }}>Bu kayit icin istersen sag ustten yeni bir alt kategori ekleyebilirsin.</p>
              </div>
            ) : (
              selectedChildren.map(child => (
                <button
                  key={child.id}
                  onClick={() => {
                    setSelectedNodeId(child.id)
                    setActiveTab('general')
                  }}
                  style={{
                    textAlign: 'left',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#fff',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '.9rem', fontWeight: 700, color: child.deleted_at ? '#b91c1c' : '#0f172a' }}>{child.name}</span>
                  <i className="fa-solid fa-chevron-right" style={{ color: '#94a3b8' }} />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <TreeExplorer
      nodes={tree}
      loading={loading}
      emptyText={emptyText}
      loadingText={loadingText}
      sectionTitle={sectionTitle}
      sectionSubtitle={sectionSubtitle}
      selectedId={selectedNodeId}
      onSelect={node => {
        setSelectedNodeId(node.id)
        setActiveTab('general')
      }}
      expandedIds={expandedIds}
      onToggle={onToggle}
      getNodeMeta={getNodeMeta}
      renderDetail={renderDetail}
      detailEmptyTitle="Bir kategori secin"
      detailEmptyText="Soldaki hiyerarsiden sectiginiz kayit burada detaylariyla gorunur."
    />
  )
}
