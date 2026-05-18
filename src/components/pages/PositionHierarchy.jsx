import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import TreeExplorer from '@/components/ui/TreeExplorer/TreeExplorer'
import { useToast } from '@/hooks/useToast'
import {
  PERSONNEL_SETTINGS_KEYS,
  normalizePositionRecord,
  readSettingArray,
  writeSettingArray,
} from '@/lib/personnelConfig'
import { buildPositionTree, createsHierarchyCycle, getDescendantIds } from '@/lib/taskHierarchy'

const POSITION_META = {
  icon: 'fa-briefcase',
  color: '#7c3aed',
  bg: '#f3e8ff',
}

function findNode(nodes, id) {
  for (const node of nodes || []) {
    if (String(node.id) === String(id)) return node
    const match = findNode(node.children || [], id)
    if (match) return match
  }
  return null
}

function getAllIds(nodes) {
  return (nodes || []).flatMap(node => [node.id, ...getAllIds(node.children || [])])
}

export default function PositionHierarchy() {
  const toast = useToast()
  const [positions, setPositions] = useState([])
  const [draft, setDraft] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [attachModalOpen, setAttachModalOpen] = useState(false)
  const [attachTargetId, setAttachTargetId] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      try {
        const records = await readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord)
        if (!mounted) return
        setPositions(records)
        setDraft(records)
      } catch (error) {
        if (mounted) toast(`Pozisyon hiyerarsisi yuklenemedi: ${error.message}`, 'error')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [toast])

  const activePositions = useMemo(
    () => draft.filter(position => !position.deletedAt),
    [draft],
  )

  const tree = useMemo(
    () => buildPositionTree(activePositions),
    [activePositions],
  )

  useEffect(() => {
    if (!tree.length) {
      setSelectedNodeId(null)
      return
    }
    if (!selectedNodeId || !findNode(tree, selectedNodeId)) {
      setSelectedNodeId(tree[0]?.id || null)
    }
  }, [tree, selectedNodeId])

  const selectedNode = useMemo(
    () => findNode(tree, selectedNodeId),
    [tree, selectedNodeId],
  )

  const selectedPosition = useMemo(
    () => activePositions.find(position => String(position.id) === String(selectedNodeId)) || null,
    [activePositions, selectedNodeId],
  )

  const orphanCount = useMemo(
    () => activePositions.filter(position => !position.parentId).length,
    [activePositions],
  )

  const selectedChildren = selectedNode?.children || []

  const attachableOptions = useMemo(() => {
    if (!selectedPosition) return []
    const blockedIds = getDescendantIds(selectedPosition.id, activePositions)
    blockedIds.add(String(selectedPosition.id))

    return activePositions
      .filter(position => !blockedIds.has(String(position.id)))
      .map(position => ({
        value: String(position.id),
        label: position.name,
        description: position.shortCode || (position.parentId ? 'Baska bir ust bagli' : 'Kok pozisyon'),
        searchText: [position.name, position.shortCode].filter(Boolean).join(' '),
      }))
  }, [activePositions, selectedPosition])

  const expandedIds = useMemo(
    () => new Set(getAllIds(tree).filter(id => collapsed[id] !== true)),
    [tree, collapsed],
  )

  function toggleNode(id) {
    setCollapsed(current => ({ ...current, [id]: !current[id] }))
  }

  function expandAll() {
    setCollapsed({})
  }

  function collapseAll() {
    setCollapsed(Object.fromEntries(getAllIds(tree).map(id => [id, true])))
  }

  function openAttachModal() {
    if (!selectedPosition) return
    setAttachTargetId('')
    setAttachModalOpen(true)
  }

  function setParent(positionId, parentId) {
    if (createsHierarchyCycle(positionId, parentId, draft)) {
      toast('Bu secim dongusel hiyerarsi olusturur.', 'error')
      return false
    }

    setDraft(current => current.map(position => (
      String(position.id) === String(positionId)
        ? { ...position, parentId: parentId || '', updatedAt: new Date().toISOString() }
        : position
    )))
    return true
  }

  function attachUnderSelected() {
    if (!selectedPosition || !attachTargetId) return
    const success = setParent(attachTargetId, selectedPosition.id)
    if (!success) return
    setCollapsed(current => ({ ...current, [selectedPosition.id]: false }))
    setSelectedNodeId(attachTargetId)
    setAttachModalOpen(false)
    toast('Pozisyon secili dugumun altina baglandi.', 'success')
  }

  function detachSelected() {
    if (!selectedPosition?.parentId) return
    const success = setParent(selectedPosition.id, '')
    if (!success) return
    toast('Pozisyon kok seviyeye alindi.', 'success')
  }

  async function save() {
    try {
      await writeSettingArray(PERSONNEL_SETTINGS_KEYS.positions, draft)
      setPositions(draft)
      toast('Pozisyon hiyerarsisi kaydedildi.', 'success')
    } catch (error) {
      toast(`Kaydedilemedi: ${error.message}`, 'error')
    }
  }

  function renderDetail(node) {
    const current = activePositions.find(position => String(position.id) === String(node.id)) || node
    const parent = current.parentId
      ? activePositions.find(position => String(position.id) === String(current.parentId))
      : null
    const children = node.children || []

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.73rem', fontWeight: 800, letterSpacing: '.08em', color: '#94a3b8' }}>
              POZISYON
            </div>
            <div style={{ fontSize: '1.28rem', fontWeight: 800, color: '#0f172a', marginTop: 6, lineHeight: 1.2 }}>
              {current.name}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-o" onClick={openAttachModal}>
              <i className="fa-solid fa-plus" /> Altina Ekle
            </button>
            <button type="button" className="btn-o" onClick={detachSelected} disabled={!current.parentId}>
              <i className="fa-solid fa-up-long" /> Koke Al
            </button>
          </div>
        </div>

        <div style={{
          background: '#fbf7ff',
          border: '1px solid #ede9fe',
          borderRadius: 16,
          padding: '14px 16px',
          display: 'grid',
          gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9', fontSize: '.68rem' }}>
              Pozisyon
            </span>
            {current.shortCode && (
              <span className="badge" style={{ background: '#fff', color: '#64748b', fontSize: '.68rem' }}>
                {current.shortCode}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {[
              ['Pozisyon Adi', current.name || '-'],
              ['Kisa Kod', current.shortCode || '-'],
              ['Bagli Oldugu Ust', parent?.name || '-'],
              ['Alt Pozisyon Sayisi', String(children.length)],
              ['Kok Seviyede Mi?', current.parentId ? 'Hayir' : 'Evet'],
            ].map(([label, value]) => (
              <div key={label}>
                <label className="f-label">{label}</label>
                <div className="f-input" style={{ display: 'flex', alignItems: 'center', minHeight: 44, color: value === '-' ? '#94a3b8' : '#475569', background: '#f8fbff' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e9d5ff', paddingTop: 12 }}>
            <div style={{ fontSize: '.77rem', fontWeight: 800, color: '#64748b', letterSpacing: '.05em', marginBottom: 10 }}>
              ALT POZISYONLAR ({children.length})
            </div>
            {children.length === 0 ? (
              <div className="empty" style={{ padding: 20, minHeight: 140 }}>
                <i className="fa-solid fa-diagram-project" />
                <div style={{ fontSize: '.95rem', fontWeight: 700, color: '#334155' }}>Alt pozisyon bulunmuyor</div>
                <p style={{ fontSize: '.8rem' }}>Sag ustteki butonla secili pozisyonun altina mevcut bir pozisyon baglayabilirsin.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {children.map(child => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedNodeId(child.id)}
                    style={{
                      textAlign: 'left',
                      border: '1px solid #e2e8f0',
                      borderRadius: 16,
                      background: '#fff',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      boxShadow: '0 8px 18px rgba(15,23,42,.04)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                        <span className="badge" style={{ background: '#f3e8ff', color: '#6d28d9', fontSize: '.68rem' }}>Alt Pozisyon</span>
                        <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{child.shortCode || child.id}</span>
                      </div>
                      <div style={{ fontSize: '.98rem', fontWeight: 700, color: '#0f172a' }}>{child.name}</div>
                    </div>
                    <i className="fa-solid fa-chevron-right" style={{ color: '#94a3b8' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="page-enter">
      <Header
        title="Pozisyon Hiyerarsisi"
        subtitle="Pozisyonlarin ust-alt iliskilerini company tree standardinda yonet."
        actions={<button type="button" className="btn-p" onClick={save}><i className="fa-solid fa-floppy-disk" /> Kaydet</button>}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Yukleniyor...</div>
      ) : tree.length === 0 ? (
        <div className="card" style={{ padding: 32 }}>
          <div className="empty" style={{ minHeight: 220 }}>
            <i className="fa-solid fa-briefcase" />
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>Pozisyon bulunamadi</div>
            <p style={{ fontSize: '.83rem' }}>Once personel pozisyonlarini tanimlayip sonra burada hiyerarsi kurabilirsiniz.</p>
          </div>
        </div>
      ) : (
        <TreeExplorer
          nodes={tree}
          loading={loading}
          sectionTitle="Hiyerarsi"
          sectionSubtitle={`Kok pozisyon sayisi: ${orphanCount}`}
          selectedId={selectedNodeId}
          onSelect={node => setSelectedNodeId(node.id)}
          expandedIds={expandedIds}
          onToggle={toggleNode}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          getNodeMeta={node => ({
            label: node.name,
            icon: POSITION_META.icon,
            color: POSITION_META.color,
            bg: POSITION_META.bg,
            deleted: false,
            badges: node.shortCode ? [{ label: node.shortCode, bg: '#ffffff', color: '#64748b' }] : [],
          })}
          renderDetail={renderDetail}
          detailEmptyTitle="Bir pozisyon secin"
          detailEmptyText="Soldaki hiyerarsiden sectiginiz pozisyonun bagliligi ve alt kayitlari burada gorunur."
        />
      )}

      <Modal
        open={attachModalOpen}
        onClose={() => setAttachModalOpen(false)}
        title={selectedPosition ? `Altina Ekle -> ${selectedPosition.name}` : 'Altina Ekle'}
        width={560}
        footer={(
          <>
            <button type="button" className="btn-o" onClick={() => setAttachModalOpen(false)}>Vazgec</button>
            <button type="button" className="btn-p" onClick={attachUnderSelected} disabled={!attachTargetId}>Ekle</button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: '.83rem', color: '#64748b', lineHeight: 1.6 }}>
            Buradan mevcut bir pozisyonu secili dugumun altina baglayabilirsin. Baska bir uste bagliysa yeni yere tasinir.
          </div>
          <div>
            <label className="f-label">Pozisyon</label>
            <SearchableSelect
              value={attachTargetId}
              onChange={setAttachTargetId}
              options={attachableOptions}
              placeholder="Pozisyon secin..."
              searchPlaceholder="Pozisyon ara..."
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
