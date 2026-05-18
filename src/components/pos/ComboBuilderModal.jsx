import { useEffect, useMemo, useState } from 'react'

function fmt(n) {
  return (parseFloat(n) || 0).toFixed(2)
}

function roundMoney(value) {
  return Math.round((parseFloat(value) || 0) * 100) / 100
}

function parseJ(value, fallback = []) {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function getChannelBasePrice(item, channelId) {
  const rows = parseJ(item?.channel_prices, [])
  const match = rows.find(entry => String(entry?.channel_id) === String(channelId) && entry?.active !== false)
  return parseFloat(match?.price) || parseFloat(item?.standard_price) || 0
}

function extractOptionGroupRules(options) {
  const list = Array.isArray(options) ? options : []
  const meta = list.find(item => item && item.__meta_type === 'selection_rules')
  return {
    minSelect: Math.max(0, parseInt(meta?.min_select, 10) || 0),
    maxSelect: Math.max(0, parseInt(meta?.max_select, 10) || 1),
    options: list.filter(item => item?.__meta_type !== 'selection_rules'),
  }
}

function getComboBasePrice(comboDefinition, channelId, itemMap) {
  const groups = Array.isArray(comboDefinition?.groups) ? comboDefinition.groups : []
  const form = comboDefinition?.form || {}
  const config = comboDefinition?.channelConfig?.[String(channelId)] || {}
  const baseTotal = groups.reduce((sum, group) => {
    const item = itemMap.get(String(group?.primaryItemId || ''))
    return sum + getChannelBasePrice(item, channelId)
  }, 0)

  const pricingStrategy = form.pricingStrategy || 'set-price'
  if (pricingStrategy === 'percent') {
    const percent = Number(config.percent ?? form.defaultPercent) || 0
    return roundMoney(Math.max(baseTotal * (1 - (percent / 100)), 0))
  }
  if (pricingStrategy === 'fixed') {
    const fixed = Number(config.fixed ?? form.defaultFixed) || 0
    return roundMoney(Math.max(baseTotal - fixed, 0))
  }
  return roundMoney(Number(config.comboPrice ?? form.defaultComboPrice) || 0)
}

function getAlternativeAdjustment(comboDefinition, group, selectedItemId, channelId, itemMap) {
  if (!selectedItemId || String(selectedItemId) === String(group?.primaryItemId || '')) return 0
  const alternative = (group?.alternatives || []).find(item => String(item?.itemId || '') === String(selectedItemId))
  if (!alternative) return 0

  if (comboDefinition?.form?.reflectPriceDiff) {
    const primary = itemMap.get(String(group?.primaryItemId || ''))
    const selected = itemMap.get(String(selectedItemId))
    return Math.max(0, roundMoney(getChannelBasePrice(selected, channelId) - getChannelBasePrice(primary, channelId)))
  }

  return roundMoney(Number(alternative?.manualAdjustments?.[String(channelId)]) || 0)
}

function buildOptionStepKey(prefix, ownerId, optionGroupId) {
  return `${prefix}:${ownerId}:${optionGroupId}`
}

function buildOptionSteps(comboDefinition, optionGroupDefs, groupSelections) {
  const defsById = new Map((optionGroupDefs || []).map(def => [String(def.id), def]))
  const steps = []

  for (const group of comboDefinition?.groups || []) {
    const selectedItemId = groupSelections[String(group.id)]
    if (!selectedItemId) continue

    for (const link of group.optionGroups || []) {
      const optionGroupId = String(link?.optionGroupId || link?.option_group_id || '')
      const def = defsById.get(optionGroupId)
      if (!def) continue
      const defName = def.group_name || def.name || 'Secenek Grubu'
      steps.push({
        key: buildOptionStepKey('group', String(group.id), optionGroupId),
        title: `${group.name || 'Grup'} icin ${defName}`,
        hint: 'Secimi tamamlamak icin minimum ve maksimum sinirlara uyun.',
        appliesToGroupId: String(group.id),
        optionGroupId,
        def,
      })
    }
  }

  for (const link of comboDefinition?.form?.comboOptionGroups || []) {
    const optionGroupId = String(link?.optionGroupId || link?.option_group_id || '')
    const def = defsById.get(optionGroupId)
    if (!def) continue
    const defName = def.group_name || def.name || 'Secenek Grubu'
    steps.push({
      key: buildOptionStepKey('combo', String(comboDefinition?.id || 'combo'), optionGroupId),
      title: `${defName} seciniz`,
      hint: 'Bu secim tum combo menuye uygulanir.',
      appliesToGroupId: null,
      optionGroupId,
      def,
    })
  }

  return steps
}

function buildSelectionSignature(groupSelections, optionSelections) {
  const groupsPart = Object.entries(groupSelections || {})
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([groupId, itemId]) => `${groupId}:${itemId}`)
    .join('|')

  const optionsPart = Object.entries(optionSelections || {})
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([stepKey, ids]) => `${stepKey}:${(ids || []).slice().sort().join(',')}`)
    .join('|')

  return `${groupsPart}__${optionsPart}`
}

export function findComboDefinitionForProduct(product, comboDefinitions = []) {
  const definitionId = String(product?.comboDefinitionId || '')
  if (definitionId) {
    const directMatch = comboDefinitions.find(combo => String(combo?.id || '') === definitionId)
    if (directMatch) return directMatch
  }

  const productSku = String(product?.sku || '').trim()
  const productName = normalizeText(product?.name)

  return comboDefinitions.find(combo => {
    const comboSku = String(combo?.sku || combo?.form?.sku || '').trim()
    if (productSku && comboSku && comboSku === productSku) return true

    const comboNames = [
      combo?.name,
      combo?.shortName,
      combo?.form?.name,
      combo?.form?.shortName,
    ].map(normalizeText).filter(Boolean)

    return productName && comboNames.includes(productName)
  }) || null
}

export function buildExpandedComboPayload({ comboProduct, comboDefinition, channelId, saleItems, optionGroupDefs, groupSelections, optionSelections }) {
  const itemMap = new Map((saleItems || []).map(item => [String(item.id), item]))
  const selectedGroups = (comboDefinition?.groups || []).filter(group => groupSelections[String(group.id)])
  const optionSteps = buildOptionSteps(comboDefinition, optionGroupDefs, groupSelections)
  const comboBasePrice = getComboBasePrice(comboDefinition, channelId, itemMap)

  const comboLevelOptions = []
  const perGroupOptions = {}
  for (const step of optionSteps) {
    const rules = extractOptionGroupRules(parseJ(step.def?.options, []))
    const selectedIds = optionSelections?.[step.key] || []
    const selectedOptions = rules.options.filter(option => selectedIds.includes(String(option.option_id || option.id || option.name)))
      .map(option => ({
        id: String(option.option_id || option.id || option.name),
        name: option.name || 'Secenek',
        price: roundMoney(option.price),
      }))

    if (step.appliesToGroupId) {
      perGroupOptions[step.appliesToGroupId] = [...(perGroupOptions[step.appliesToGroupId] || []), ...selectedOptions]
    } else {
      comboLevelOptions.push(...selectedOptions)
    }
  }

  const baseLines = selectedGroups.map((group, index) => {
    const selectedItemId = String(groupSelections[String(group.id)] || group.primaryItemId || '')
    const item = itemMap.get(selectedItemId)
    const lineOptions = [...(perGroupOptions[String(group.id)] || []), ...(index === 0 ? comboLevelOptions : [])]
    const baseUnitPrice = roundMoney(
      getChannelBasePrice(item, channelId)
      + lineOptions.reduce((sum, option) => sum + (parseFloat(option.price) || 0), 0)
    )

    return {
      product_id: item?.id || selectedItemId,
      product_name: item?.name || 'Secilen Urun',
      prod: item || { id: selectedItemId, name: 'Secilen Urun' },
      groupName: group.name || 'Grup',
      isPrimary: String(selectedItemId) === String(group.primaryItemId || ''),
      baseUnitPrice,
      options: lineOptions,
      adjustment: getAlternativeAdjustment(comboDefinition, group, selectedItemId, channelId, itemMap),
    }
  })

  const realTotal = roundMoney(baseLines.reduce((sum, line) => sum + line.baseUnitPrice, 0))
  const adjustmentTotal = roundMoney(baseLines.reduce((sum, line) => sum + line.adjustment, 0))
  const targetTotal = roundMoney(comboBasePrice + adjustmentTotal + comboLevelOptions.reduce((sum, option) => sum + (parseFloat(option.price) || 0), 0))

  if (!baseLines.length) {
    return {
      comboUnitPrice: targetTotal,
      realTotal,
      comboBasePrice,
      adjustmentTotal,
      expandedLines: [],
      displayLines: [],
      signature: buildSelectionSignature(groupSelections, optionSelections),
    }
  }

  const ratio = realTotal > 0 ? (targetTotal / realTotal) : 1
  let allocated = 0
  const expandedLines = baseLines.map((line, index) => {
    const isLast = index === baseLines.length - 1
    const unitPrice = isLast
      ? roundMoney(targetTotal - allocated)
      : roundMoney(line.baseUnitPrice * ratio)
    allocated = roundMoney(allocated + unitPrice)

    return {
      ...line,
      unitPrice: Math.max(0, unitPrice),
      qty: 1,
    }
  })

  return {
    comboUnitPrice: roundMoney(targetTotal),
    realTotal,
    comboBasePrice,
    adjustmentTotal,
    expandedLines,
    displayLines: expandedLines.map(line => ({
      id: `${line.product_id}:${line.groupName}`,
      title: line.product_name,
      subtitle: (line.options || []).map(option => option.name).filter(Boolean).join(' - '),
    })),
    signature: buildSelectionSignature(groupSelections, optionSelections),
    comboLevelOptions,
  }
}

export function expandCartItemsForPayload(cartItems = []) {
  return cartItems.flatMap(item => {
    if (!item?.comboBundle?.expandedLines?.length) {
      return [{
        product_id: item?.prod?.id,
        product_name: item?.prod?.name,
        portion: item?.portion?.name || null,
        options: (item?.options || []).map(option => option.name),
        note: item?.note || '',
        unit_price: roundMoney(item?.unitPrice),
        qty: parseFloat(item?.qty) || 1,
        total: roundMoney((parseFloat(item?.unitPrice) || 0) * (parseFloat(item?.qty) || 0)),
      }]
    }

    const multiplier = Math.max(1, parseFloat(item?.qty) || 1)
    return item.comboBundle.expandedLines.map(line => ({
      product_id: line.product_id,
      product_name: line.product_name,
      portion: null,
      options: (line.options || []).map(option => option.name),
      note: item?.note || '',
      unit_price: roundMoney(line.unitPrice),
      qty: multiplier,
      total: roundMoney((parseFloat(line.unitPrice) || 0) * multiplier),
      combo_name: item?.prod?.name || '',
      combo_group_name: line.groupName || '',
    }))
  })
}

export function flattenCartItems(cartItems = []) {
  return cartItems.flatMap(item => {
    if (!item?.comboBundle?.expandedLines?.length) return [item]
    const multiplier = Math.max(1, parseFloat(item?.qty) || 1)
    return item.comboBundle.expandedLines.map(line => ({
      id: `${item.id}:${line.product_id}:${line.groupName || ''}`,
      prod: line.prod,
      portion: null,
      options: line.options || [],
      note: item.note || '',
      unitPrice: roundMoney(line.unitPrice),
      qty: multiplier,
      comboParentName: item?.prod?.name || '',
      comboGroupName: line.groupName || '',
    }))
  })
}

export default function ComboBuilderModal({
  comboProduct,
  comboDefinition,
  saleItems = [],
  optionGroupDefs = [],
  channelId,
  onClose,
  onConfirm,
}) {
  const itemMap = useMemo(
    () => new Map((saleItems || []).map(item => [String(item.id), item])),
    [saleItems]
  )

  const [groupSelections, setGroupSelections] = useState({})
  const [optionSelections, setOptionSelections] = useState({})
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const defaults = {}
    for (const group of comboDefinition?.groups || []) {
      if (group?.primaryItemId) defaults[String(group.id)] = String(group.primaryItemId)
    }
    setGroupSelections(defaults)
    setOptionSelections({})
    setStepIndex(0)
  }, [comboDefinition])

  const optionSteps = useMemo(
    () => buildOptionSteps(comboDefinition, optionGroupDefs, groupSelections),
    [comboDefinition, optionGroupDefs, groupSelections]
  )

  const steps = useMemo(() => {
    const orderedSteps = []
    const comboLevelSteps = optionSteps.filter(step => !step.appliesToGroupId)

    for (const group of comboDefinition?.groups || []) {
      orderedSteps.push({ type: 'group', group })
      const groupOptionSteps = optionSteps.filter(step => String(step.appliesToGroupId || '') === String(group?.id || ''))
      for (const step of groupOptionSteps) orderedSteps.push({ type: 'option', step })
    }

    for (const step of comboLevelSteps) orderedSteps.push({ type: 'option', step })

    return orderedSteps
  }, [comboDefinition, optionSteps])

  const currentStep = steps[stepIndex] || null
  const calculation = useMemo(
    () => buildExpandedComboPayload({
      comboProduct,
      comboDefinition,
      channelId,
      saleItems,
      optionGroupDefs,
      groupSelections,
      optionSelections,
    }),
    [channelId, comboDefinition, comboProduct, groupSelections, optionGroupDefs, optionSelections, saleItems]
  )

  const canContinue = useMemo(() => {
    if (!currentStep) return false
    if (currentStep.type === 'group') {
      return Boolean(groupSelections[String(currentStep.group.id)])
    }

    const rules = extractOptionGroupRules(parseJ(currentStep.step?.def?.options, []))
    const selectedIds = optionSelections[currentStep.step.key] || []
    const maxSelect = rules.maxSelect > 0 ? rules.maxSelect : Number.POSITIVE_INFINITY
    return selectedIds.length >= rules.minSelect && selectedIds.length <= maxSelect
  }, [currentStep, groupSelections, optionSelections])

  function handleSelectGroupItem(groupId, itemId) {
    setGroupSelections(current => ({
      ...current,
      [String(groupId)]: String(itemId),
    }))
  }

  function handleToggleOption(step, optionId, maxSelect) {
    setOptionSelections(current => {
      const currentIds = current[step.key] || []
      const exists = currentIds.includes(optionId)
      if (exists) {
        return {
          ...current,
          [step.key]: currentIds.filter(id => id !== optionId),
        }
      }

      if (maxSelect <= 1) {
        return {
          ...current,
          [step.key]: [optionId],
        }
      }

      if (maxSelect > 0 && currentIds.length >= maxSelect) return current
      return {
        ...current,
        [step.key]: [...currentIds, optionId],
      }
    })
  }

  function submit() {
    onConfirm?.({
      unitPrice: calculation.comboUnitPrice,
      comboBundle: {
        comboId: comboDefinition?.id,
        comboSku: comboDefinition?.sku,
        comboName: comboProduct?.name || comboDefinition?.name || comboDefinition?.form?.name || 'Combo Menu',
        comboBasePrice: calculation.comboBasePrice,
        realTotal: calculation.realTotal,
        adjustmentTotal: calculation.adjustmentTotal,
        expandedLines: calculation.expandedLines,
        displayLines: calculation.displayLines,
        signature: calculation.signature,
      },
      cartKeySuffix: calculation.signature,
    })
  }

  const currentOptionRules = currentStep?.type === 'option'
    ? extractOptionGroupRules(parseJ(currentStep.step?.def?.options, []))
    : null
  const currentOptionMax = currentOptionRules
    ? (currentOptionRules.maxSelect > 0 ? currentOptionRules.maxSelect : Number.POSITIVE_INFINITY)
    : 0

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.68)',
      backdropFilter: 'blur(4px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: 'min(920px, 96vw)',
        maxHeight: '92vh',
        overflow: 'hidden',
        borderRadius: 22,
        background: '#0a0f44',
        border: '1px solid rgba(255,255,255,.12)',
        boxShadow: '0 25px 60px rgba(0,0,0,.6)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}>
          <div>
            <div style={{ fontSize: '1.18rem', fontWeight: 900, color: '#fff', marginBottom: 6 }}>
              {comboProduct?.name || comboDefinition?.name || 'Combo Menu'}
            </div>
            <div style={{ fontSize: '.8rem', color: '#a5b4fc', lineHeight: 1.45, fontWeight: 700 }}>
              Tanimli grup yapisina gore secimlerinizi tamamlayin.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              border: 'none',
              background: 'rgba(255,255,255,.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1.35rem',
            }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="hide-scrollbar" style={{ padding: 22, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.55fr .9fr', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {currentStep?.type === 'group' && (
                <div style={{
                  background: 'rgba(255,255,255,.02)',
                  border: '1px solid rgba(251,191,36,.25)',
                  borderRadius: 18,
                  padding: 20,
                }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#a5b4fc', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Grup Secimi
                  </div>
                  <div style={{ fontSize: '1.12rem', fontWeight: 900, color: '#fff', marginBottom: 8 }}>
                    {currentStep.group?.name || 'Seciminizi yapin'}
                  </div>
                  <div style={{ fontSize: '.86rem', color: '#cbd5e1', marginBottom: 18 }}>
                    Ana urun ve alternatifler arasindan bir secim yapin.
                  </div>

                  <div style={{ display: 'grid', gap: 12 }}>
                    {[{
                      itemId: String(currentStep.group?.primaryItemId || ''),
                      isPrimary: true,
                    }, ...((currentStep.group?.alternatives || []).map(alternative => ({
                      itemId: String(alternative?.itemId || ''),
                      isPrimary: false,
                    })))].map(choice => {
                      const item = itemMap.get(choice.itemId)
                      const delta = getAlternativeAdjustment(comboDefinition, currentStep.group, choice.itemId, channelId, itemMap)
                      const isActive = String(groupSelections[String(currentStep.group.id)] || '') === choice.itemId
                      const basePrice = getChannelBasePrice(item, channelId)

                      return (
                        <button
                          type="button"
                          key={`${currentStep.group.id}:${choice.itemId}`}
                          onClick={() => handleSelectGroupItem(currentStep.group.id, choice.itemId)}
                          style={{
                            border: `1.5px solid ${isActive ? '#fbbf24' : 'rgba(255,255,255,.1)'}`,
                            background: isActive ? 'rgba(251,191,36,.12)' : 'rgba(255,255,255,.03)',
                            borderRadius: 16,
                            padding: '16px 18px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            color: isActive ? '#fbbf24' : '#fff',
                            transition: '.15s',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                                <div style={{ fontWeight: 800, color: isActive ? '#fbbf24' : '#fff', fontSize: '.94rem' }}>
                                  {item?.name || 'Secilen urun'}
                                </div>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  fontSize: '.7rem',
                                  fontWeight: 800,
                                  background: choice.isPrimary ? 'rgba(251,191,36,.18)' : 'rgba(255,255,255,.1)',
                                  color: choice.isPrimary ? '#fbbf24' : '#c7d2fe',
                                }}>
                                  {choice.isPrimary ? 'Ana Urun' : 'Alternatif'}
                                </span>
                              </div>
                              <div style={{ fontSize: '.76rem', color: 'rgba(255,255,255,.55)' }}>
                                Gercek kanal fiyati: {fmt(basePrice)} TL
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              {!choice.isPrimary && (
                                <div style={{ fontWeight: 900, color: delta > 0 ? '#34d399' : 'rgba(255,255,255,.55)', fontSize: '.92rem' }}>
                                  +{fmt(Math.max(0, delta))} TL
                                </div>
                              )}
                              <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.4)', marginTop: 4 }}>
                                {choice.isPrimary ? 'Referans secim' : 'Combo farki'}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {currentStep?.type === 'option' && (() => {
                const rules = currentOptionRules
                const maxSelect = currentOptionMax
                const selectedIds = optionSelections[currentStep.step.key] || []
                const isGroupOptionStep = Boolean(currentStep.step?.appliesToGroupId)
                const panelBackground = isGroupOptionStep ? 'linear-gradient(180deg,rgba(251,191,36,.12),rgba(249,115,22,.08))' : 'rgba(255,255,255,.02)'
                const panelBorder = isGroupOptionStep ? '1px solid rgba(251,191,36,.34)' : '1px solid rgba(165,180,252,.16)'
                const panelLabel = isGroupOptionStep ? 'Gruba Bagli Secenek Grubu' : 'Combo Secenek Grubu'
                const panelLabelColor = isGroupOptionStep ? '#fdba74' : '#a5b4fc'
                const helperColor = isGroupOptionStep ? '#fde68a' : '#cbd5e1'
                const requirementColor = isGroupOptionStep ? '#fed7aa' : '#fca5a5'
                const metaColor = isGroupOptionStep ? 'rgba(253,186,116,.82)' : 'rgba(165,180,252,.6)'
                const activeBorder = isGroupOptionStep ? '#f59e0b' : '#10b981'
                const activeBackground = isGroupOptionStep ? 'rgba(245,158,11,.16)' : 'rgba(16,185,129,.12)'
                const activeText = isGroupOptionStep ? '#fbbf24' : '#10b981'

                return (
                  <div style={{
                    background: panelBackground,
                    border: panelBorder,
                    borderRadius: 18,
                    padding: 20,
                  }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: panelLabelColor, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                      {panelLabel}
                    </div>
                    <div style={{ fontSize: '1.08rem', fontWeight: 900, color: '#fff', marginBottom: 8 }}>
                      {currentStep.step?.title}
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom: 10 }}>
                      <div style={{ fontSize: '.82rem', color: requirementColor, fontWeight: 700 }}>
                        Bu grup icin en az {rules.minSelect} secim yapin.
                      </div>
                      <div style={{ fontSize: '.72rem', color: metaColor, fontWeight: 700 }}>
                        {rules.minSelect > 0 ? 'Zorunlu' : 'Opsiyonel'} • max {Number.isFinite(maxSelect) ? maxSelect : 'sinirsiz'}
                      </div>
                    </div>
                    <div style={{ fontSize: '.82rem', color: helperColor, marginBottom: 18 }}>
                      {currentStep.step?.hint}
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                      {rules.options.map(option => {
                        const optionId = String(option.option_id || option.id || option.name)
                        const active = selectedIds.includes(optionId)
                        const price = roundMoney(option.price)
                        return (
                          <button
                            type="button"
                            key={`${currentStep.step.key}:${optionId}`}
                            onClick={() => handleToggleOption(currentStep.step, optionId, maxSelect)}
                            style={{
                              border: `1.5px solid ${active ? activeBorder : 'rgba(255,255,255,.1)'}`,
                              background: active ? activeBackground : 'rgba(255,255,255,.03)',
                              borderRadius: 16,
                              padding: '15px 18px',
                              textAlign: 'left',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                              <div>
                                <div style={{ fontWeight: 800, color: active ? activeText : '#fff', fontSize: '.92rem', marginBottom: 4 }}>
                                  {option.name || 'Secenek'}
                                </div>
                                <div style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.5)' }}>
                                  {price > 0 ? `+${fmt(price)} TL eklenir` : 'Ucretsiz secenek'}
                                </div>
                              </div>
                              <div style={{
                                width: 26,
                                height: 26,
                                borderRadius: 999,
                                border: `2px solid ${active ? activeBorder : 'rgba(255,255,255,.3)'}`,
                                background: active ? activeBorder : 'transparent',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {active ? <i className="fa-solid fa-check" style={{ fontSize: '.75rem' }} /> : null}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'rgba(251,191,36,.1)',
                border: '1px solid rgba(251,191,36,.22)',
                borderRadius: 18,
                padding: 18,
              }}>
                <div style={{ fontSize: '.72rem', color: '#fbbf24', fontWeight: 800, marginBottom: 6 }}>
                  Taban Fiyat
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#fff', marginBottom: 12 }}>
                  {fmt(calculation.comboBasePrice)} TL
                </div>
                <div style={{ fontSize: '.72rem', color: '#f8fafc', opacity: .82, marginBottom: 2 }}>
                  Secilen urunlerle olusan toplam
                </div>
                <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#fff', marginBottom: 10 }}>
                  {fmt(calculation.comboUnitPrice)} TL
                </div>
                <div style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>
                  Fiyat farklari ve secenek bedelleri bu toplamda guncellenir.
                </div>
              </div>

              <div style={{
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 18,
                padding: 18,
              }}>
                <div style={{ fontWeight: 900, color: '#fff', marginBottom: 14 }}>Secim Ozeti</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {(comboDefinition?.groups || []).map(group => {
                    const selectedItemId = String(groupSelections[String(group.id)] || '')
                    const item = itemMap.get(selectedItemId)
                    return (
                      <div key={group.id} style={{ paddingBottom: 10, borderBottom: '1px dashed rgba(255,255,255,.08)' }}>
                        <div style={{ fontSize: '.76rem', color: '#94a3b8', marginBottom: 3 }}>{group.name || 'Grup'}</div>
                        <div style={{ fontWeight: 800, color: '#fff', fontSize: '.86rem' }}>
                          {item?.name || 'Secim bekleniyor'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          padding: '18px 24px',
          borderTop: '1px solid rgba(255,255,255,.08)',
          background: '#05082b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <button
            type="button"
            onClick={() => (stepIndex > 0 ? setStepIndex(current => current - 1) : onClose?.())}
            style={{
              minHeight: 48,
              padding: '0 18px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,.15)',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {stepIndex > 0 ? 'Geri' : 'Vazgec'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: '.8rem', color: '#94a3b8' }}>
              Adim {Math.min(stepIndex + 1, Math.max(steps.length, 1))} / {Math.max(steps.length, 1)}
            </div>
            {stepIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => canContinue && setStepIndex(current => current + 1)}
                disabled={!canContinue}
                style={{
                  minHeight: 48,
                  padding: '0 20px',
                  borderRadius: 14,
                  border: 'none',
                  background: canContinue ? 'linear-gradient(135deg,#f59e0b,#fb7185)' : 'rgba(255,255,255,.12)',
                  color: canContinue ? '#fff' : '#94a3b8',
                  fontWeight: 900,
                  cursor: canContinue ? 'pointer' : 'not-allowed',
                }}
              >
                Ilerle
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canContinue}
                style={{
                  minHeight: 48,
                  padding: '0 22px',
                  borderRadius: 14,
                  border: 'none',
                  background: canContinue ? 'linear-gradient(135deg,#f59e0b,#fbbf24)' : 'rgba(255,255,255,.12)',
                  color: canContinue ? '#0f172a' : '#94a3b8',
                  fontWeight: 900,
                  cursor: canContinue ? 'pointer' : 'not-allowed',
                }}
              >
                Urun Ekle
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
