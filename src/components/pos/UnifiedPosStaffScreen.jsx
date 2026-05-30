import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/lib/db'
import { findPreferredBranchContext, loadBranchContextsFromDb } from '@/lib/branchContexts'
import { ensureComboMenuCategory } from '@/lib/comboMenuCategory'

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
          image_url: prod.image_url || prod.channel_image || prod.pos_image || null,
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
            if (Array.isArray(parsed)) {
              setComboDefinitions(parsed)
            } else if (parsed && Array.isArray(parsed.records)) {
              setComboDefinitions(parsed.records)
            } else {
              setComboDefinitions([])
            }
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
