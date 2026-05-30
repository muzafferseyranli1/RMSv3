import { useEffect, useMemo, useRef, useState } from 'react'
import { db, resolveImageUrl } from '@/lib/db'
import { findPreferredBranchContext, loadBranchContextsFromDb } from '@/lib/branchContexts'
import { ensureComboMenuCategory } from '@/lib/comboMenuCategory'

function normalizeComboGroups(rawGroups, saleItems = []) {
  const safeGroups = Array.isArray(rawGroups) && rawGroups.length > 0 ? rawGroups : [];
  
  if (safeGroups.length === 0) {
    const burgers = (saleItems || []).filter(item => {
      const name = String(item.name || '').toLowerCase();
      return name.includes('burger') || name.includes('döner') || name.includes('doner') || name.includes('pizza') || name.includes('durum') || name.includes('dürüm');
    });
    const fries = (saleItems || []).filter(item => {
      const name = String(item.name || '').toLowerCase();
      return name.includes('patates') || name.includes('kızartma') || name.includes('halka') || name.includes('snack') || name.includes('fries');
    });
    const drinks = (saleItems || []).filter(item => {
      const name = String(item.name || '').toLowerCase();
      return name.includes('cola') || name.includes('fanta') || name.includes('sprite') || name.includes('limonata') || name.includes('ayran') || name.includes('su') || name.includes('ice');
    });

    const group1Primary = burgers[0]?.id || saleItems[0]?.id || 'hamburger';
    const group1Alts = burgers.slice(1, 4).map((b, index) => ({ id: `alt-${b.id || index}`, itemId: b.id, manualAdjustments: {} }));
    
    const group2Primary = fries[0]?.id || saleItems[1]?.id || 'small-fries';
    const group2Alts = fries.slice(1, 3).map((f, index) => ({ id: `alt-${f.id || index}`, itemId: f.id, manualAdjustments: {} }));

    const group3Primary = drinks[0]?.id || saleItems[2]?.id || 'cola';
    const group3Alts = drinks.slice(1, 4).map((d, index) => ({ id: `alt-${d.id || index}`, itemId: d.id, manualAdjustments: {} }));

    return [
      {
        id: 'fallback-group-1',
        name: '1. Seçim (Ana Ürün)',
        primaryItemId: String(group1Primary),
        alternatives: group1Alts,
        optionGroups: [
          { id: 'opt-sos-secimi', optionGroupId: 'sos-secimi' }
        ]
      },
      {
        id: 'fallback-group-2',
        name: 'Yan Ürün Seçimi',
        primaryItemId: String(group2Primary),
        alternatives: group2Alts,
        optionGroups: []
      },
      {
        id: 'fallback-group-3',
        name: 'İçecek Seçimi',
        primaryItemId: String(group3Primary),
        alternatives: group3Alts,
        optionGroups: [
          { id: 'opt-icecek-buzu', optionGroupId: 'icecek-buzu' }
        ]
      }
    ];
  }

  return safeGroups.map((group, groupIndex) => ({
    id: String(group.id || `group-${groupIndex}`),
    name: group.name || `Seçim Grubu ${groupIndex + 1}`,
    primaryItemId: String(group.primaryItemId || ''),
    alternatives: (Array.isArray(group.alternatives) ? group.alternatives : []).map((alternative, alternativeIndex) => ({
      id: String(alternative.id || `alt-${alternativeIndex}`),
      itemId: String(alternative.itemId || ''),
      manualAdjustments: alternative.manualAdjustments || {}
    })),
    optionGroups: (Array.isArray(group.optionGroups) ? group.optionGroups : []).map((option, optionIndex) => ({
      id: String(option.id || `opt-${optionIndex}`),
      optionGroupId: String(option.optionGroupId || option.option_group_id || '')
    }))
  }));
}

export function useUnifiedPosCatalogBootstrap({
  modeLabel = 'POS',
  branchLocked = false,
  workspaceBranchId = '',
  workspaceBranchName = '',
  loadingBranches = false,
  readRememberedBranchId = () => '',
  readRememberedChannelId = () => '',
  resolveNextChannel = (current, nextChannels = []) => nextChannels[0]?.id || current || '',
  categorySelect = '*',
  productSelect = '*',
}) {
  const rememberedBranchReaderRef = useRef(readRememberedBranchId)
  const resolveNextChannelRef = useRef(resolveNextChannel)
  rememberedBranchReaderRef.current = readRememberedBranchId
  resolveNextChannelRef.current = resolveNextChannel
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [channels, setChannels] = useState([])
  const [taxes, setTaxes] = useState([])
  const [branchContexts, setBranchContexts] = useState([])
  const [comboDefinitions, setComboDefinitions] = useState([])
  const [optionGroupDefs, setOptionGroupDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingStage, setLoadingStage] = useState('Sube baglami okunuyor...')
  const [activeMainCat, setActiveMainCat] = useState(null)
  const [activeSubCat, setActiveSubCat] = useState(null)
  const [activeChannel, setActiveChannel] = useState(() => readRememberedChannelId())
  const [selectedBranchId, setSelectedBranchId] = useState(() => readRememberedBranchId())

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setCatalogLoading(true)
      setLoadingProgress(6)
      setLoadingStage('Sube baglami okunuyor...')

      try {
        const lockedBranchContext = branchLocked && workspaceBranchId
          ? {
              branchId: String(workspaceBranchId),
              branchName: String(workspaceBranchName || '').trim() || 'Secili Sube',
            }
          : null

        if (lockedBranchContext) {
          setBranchContexts(current => {
            if (
              current.length === 1
              && current[0]?.branchId === lockedBranchContext.branchId
              && current[0]?.branchName === lockedBranchContext.branchName
            ) {
              return current
            }
            return [lockedBranchContext]
          })
          setSelectedBranchId(current => (current === lockedBranchContext.branchId ? current : lockedBranchContext.branchId))
          setLoadingStage(`${modeLabel} aciliyor...`)
          setLoadingProgress(100)
          setLoading(false)
        }

        loadBranchContextsFromDb()
          .then(branches => {
            if (cancelled) return
            const safeBranches = Array.isArray(branches) ? branches : []
            if (safeBranches.length === 0) return
            setBranchContexts(safeBranches)
            const preferredBranch = findPreferredBranchContext(
              safeBranches,
              branchLocked ? workspaceBranchId : rememberedBranchReaderRef.current(),
            )
            if (preferredBranch?.branchId) {
              setSelectedBranchId(current => {
                if (branchLocked && workspaceBranchId) return workspaceBranchId
                return current === preferredBranch.branchId ? current : preferredBranch.branchId
              })
            }
            if (!branchLocked) {
              setLoading(false)
            }
          })
          .catch(error => {
            if (!cancelled) {
              console.error(`${modeLabel} branch context load failed`, error)
            }
          })

        db
          .from('sales_channels')
          .select('id,name')
          .is('deleted_at', null)
          .eq('active', true)
          .order('sort_order')
          .then(channelResult => {
            if (cancelled || channelResult?.error) return
            const nextChannels = channelResult.data || []
            setChannels(nextChannels)
            setActiveChannel(current => resolveNextChannelRef.current(current, nextChannels))
          })
          .catch(error => {
            if (!cancelled) {
              console.error(`${modeLabel} sales channel load failed`, error)
            }
          })

        const bootTasks = [
          {
            label: 'Kategoriler hazirlaniyor...',
            run: () => db.from('sale_categories').select(categorySelect).is('deleted_at', null).order('name'),
          },
          {
            label: 'Urunler aliniyor...',
            run: () => db.from('sale_items').select(productSelect).is('deleted_at', null).eq('active', true).order('name'),
          },
        ]

        let completed = 0
        const updateTaskProgress = label => {
          completed += 1
          if (cancelled) return
          setLoadingStage(label)
          setLoadingProgress(Math.min(96, Math.round(18 + (completed / bootTasks.length) * 78)))
        }

        setLoadingProgress(18)
        setLoadingStage('Urun katalogu aliniyor...')

        const [catR, prodR] = await Promise.all(
          bootTasks.map(async task => {
            const result = await task.run()
            updateTaskProgress(task.label)
            return result
          }),
        )
        if (cancelled) return

        if (catR?.error) {
          throw new Error(catR.error.message || `${modeLabel} sale category bootstrap failed`)
        }

        if (prodR?.error) {
          throw new Error(prodR.error.message || `${modeLabel} sale item bootstrap failed`)
        }

        const categorySnapshot = await ensureComboMenuCategory(catR.data || [])
        const cats = categorySnapshot.categories || []
        const prods = (prodR.data || []).map(prod => ({
          ...prod,
          pos_image: resolveImageUrl(prod.pos_image),
          channel_image: resolveImageUrl(prod.channel_image),
          image_url: resolveImageUrl(prod.image_url || prod.channel_image || prod.pos_image || null),
        }))

        setCategories(cats)
        setProducts(prods)

        if (cats.length) {
          const roots = cats.filter(cat => !cat.parent_id)
          const firstMain = roots[0] || cats[0]
          const firstChildren = cats.filter(cat => cat.parent_id === firstMain.id)
          setActiveMainCat(firstMain.id)
          setActiveSubCat(firstChildren[0]?.id || firstMain.id)
        }

        setCatalogLoading(false)

        if (!lockedBranchContext) {
          setLoadingStage(`${modeLabel} hazirlaniyor...`)
          setLoadingProgress(100)
          setLoading(false)
        }

        Promise.allSettled([
          db.from('taxes').select('id,name,rate').is('deleted_at', null).order('rate'),
          db.from('settings').select('value').eq('key', 'combo_menus_v1').single(),
          db.from('option_groups').select('*').is('deleted_at', null).order('name'),
        ]).then(([taxResult, comboResult, optionGroupsResult]) => {
          if (cancelled) return

          if (taxResult.status === 'fulfilled' && !taxResult.value?.error) {
            setTaxes(taxResult.value.data || [])
          }

          if (comboResult.status === 'fulfilled' && !comboResult.value?.error) {
            const raw = comboResult.value.data?.value
            let parsed = raw
            if (typeof raw === 'string') {
              try { parsed = JSON.parse(raw) } catch (e) {}
            }
            let records = []
            if (Array.isArray(parsed)) {
              records = parsed
            } else if (parsed && Array.isArray(parsed.records)) {
              records = parsed.records
            }
            const normalized = records.map(record => ({
              ...record,
              groups: normalizeComboGroups(record.groups, prods)
            }))
            setComboDefinitions(normalized)
          }

          if (optionGroupsResult.status === 'fulfilled' && !optionGroupsResult.value?.error) {
            setOptionGroupDefs((optionGroupsResult.value.data || []).map(def => ({
              ...def,
              group_name: def.group_name || def.name || '',
            })))
          }
        }).catch(() => {})
      } catch (error) {
        if (!cancelled) {
          console.error(`${modeLabel} load failed`, error)
          setCatalogLoading(false)
          setLoading(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [
    branchLocked,
    workspaceBranchId,
    workspaceBranchName,
    modeLabel,
    categorySelect,
    productSelect,
  ])

  const resolvedBranchId = branchLocked && workspaceBranchId
    ? workspaceBranchId
    : selectedBranchId

  const selectedBranchContext = useMemo(
    () => branchContexts.find(branch => branch.branchId === resolvedBranchId) || null,
    [branchContexts, resolvedBranchId],
  )

  const visibleBranchName = selectedBranchContext?.branchName
    || workspaceBranchName
    || (loadingBranches ? 'Sube baglami okunuyor...' : 'Satis icin sube secin')

  return {
    categories,
    products,
    channels,
    taxes,
    branchContexts,
    comboDefinitions,
    optionGroupDefs,
    loading,
    catalogLoading,
    loadingProgress,
    loadingStage,
    activeMainCat,
    activeSubCat,
    activeChannel,
    selectedBranchId,
    resolvedBranchId,
    selectedBranchContext,
    visibleBranchName,
    setActiveMainCat,
    setActiveSubCat,
    setActiveChannel,
    setSelectedBranchId,
  }
}

export default function UnifiedPosStaffScreen({
  mode = 'pos',
  activeStaff,
  onStaffLogout,
  showTableManagement = false,
  showGarsonSwitch = false,
  renderPos,
  renderGarson,
}) {
  const sharedProps = {
    activeStaff,
    onStaffLogout,
    showTableManagement,
    showGarsonSwitch,
  }

  if (mode === 'garson') {
    if (typeof renderGarson !== 'function') return null
    return renderGarson(sharedProps)
  }

  if (typeof renderPos !== 'function') return null
  return renderPos(sharedProps)
}
