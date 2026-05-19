import React from 'react'

function formatMoney(value) {
  const amount = Number(value || 0)
  return amount.toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatNumber(value, digits = 2) {
  const amount = Number(value || 0)
  return amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

const ACTION_TYPE_LABELS = {
  discount_percent: 'Yüzde indirim',
  total_order_discount_percent: 'Toplam sipariş indirimi',
  order_discount_amount: 'Tutar indirimi',
  free_products: 'Hediye ürün',
  bonus_points: 'Bonus puan',
  points_percent_of_order: 'Siparişten puan',
  points_earn_multiplier: 'Puan kazanım çarpanı',
  points_redeem_multiplier: 'Puan kullanımı',
}

function getActionMeta(snapshot = {}) {
  const actionType = String(snapshot.actionType || '').trim()
  const hasRedemption = Boolean(
    snapshot.redemptionContext
    && (
      Number(snapshot.redemptionContext.usedPoints || 0) > 0
      || Number(snapshot.redemptionContext.discountAmount || 0) > 0
    )
  )

  if (actionType === 'points_redeem_multiplier' || hasRedemption) {
    return {
      label: 'Puan kullanımı',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: 'fa-ticket',
    }
  }

  if (
    actionType === 'bonus_points'
    || actionType === 'points_percent_of_order'
    || actionType === 'points_earn_multiplier'
  ) {
    return {
      label: ACTION_TYPE_LABELS[actionType] || 'Puan kazanımı',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: 'fa-star',
    }
  }

  return {
    label: ACTION_TYPE_LABELS[actionType] || actionType || 'Sadakat',
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
    icon: 'fa-gift',
  }
}

function normalizeAppliedActions(snapshot = {}) {
  const raw = Array.isArray(snapshot.appliedActionsSummary)
    ? snapshot.appliedActionsSummary
    : Array.isArray(snapshot.appliedActions)
      ? snapshot.appliedActions
      : []

  return raw
    .map(action => {
      if (typeof action === 'string') {
        return { label: action }
      }
      if (action && typeof action === 'object') {
        return {
          label: String(action.label || action.type || 'Eylem'),
          value: action.value,
          usedPoints: action.usedPoints,
          discountAmount: action.discountAmount,
        }
      }
      return null
    })
    .filter(Boolean)
}

function buildDecisionLines(snapshot = {}) {
  const context = snapshot.decisionContext
  if (!context || typeof context !== 'object') return []

  const lines = []
  if (context.reason) lines.push(String(context.reason))
  if (context.runtimeChannel) lines.push(`Kanal: ${context.runtimeChannel}`)
  if (context.ruleActionType) {
    lines.push(`Kural eylemi: ${ACTION_TYPE_LABELS[context.ruleActionType] || context.ruleActionType}`)
  }
  if (Number.isFinite(Number(context.orderTotal)) && Number(context.orderTotal) > 0) {
    lines.push(`Sipariş toplamı: ${formatMoney(context.orderTotal)}`)
  }
  if (context.resolvedAt) {
    lines.push(`Çözümlendi: ${new Date(context.resolvedAt).toLocaleString('tr-TR')}`)
  }
  return lines
}

function buildCouponSummary(snapshot = {}) {
  const raw = snapshot.selectedCoupon || snapshot.selectedCouponCode
  if (!raw) return null
  if (typeof raw === 'string') {
    return { code: raw, label: '' }
  }
  if (typeof raw === 'object') {
    return {
      code: String(raw.code || raw.couponCode || ''),
      label: String(raw.label || raw.name || ''),
      discount: Number(raw.discount || raw.discountValue || 0),
    }
  }
  return null
}

function buildRedemptionRows(snapshot = {}) {
  const context = snapshot.redemptionContext
  if (!context || typeof context !== 'object') return []

  const rows = []
  if (Number(context.usedPoints || 0) > 0) {
    rows.push(['Kullanılan puan', formatNumber(context.usedPoints)])
  }
  if (Number(context.redemptionRate || 0) > 0) {
    rows.push(['Oran', `${formatMoney(context.redemptionRate)} / puan`])
  }
  if (Number(context.multiplier || 0) > 0) {
    rows.push(['Çarpan', `${formatNumber(context.multiplier)}x`])
  }
  if (Number(context.discountAmount || context.computedDiscount || 0) > 0) {
    rows.push(['İndirim tutarı', formatMoney(context.discountAmount || context.computedDiscount)])
  }
  return rows
}

export default function LoyaltyReadback({ loyaltySnapshot }) {
  if (!loyaltySnapshot || typeof loyaltySnapshot !== 'object') return null

  const actionMeta = getActionMeta(loyaltySnapshot)
  const coupon = buildCouponSummary(loyaltySnapshot)
  const appliedActions = normalizeAppliedActions(loyaltySnapshot)
  const decisionLines = buildDecisionLines(loyaltySnapshot)
  const redemptionRows = buildRedemptionRows(loyaltySnapshot)
  const hasPrimaryContent = Boolean(
    loyaltySnapshot.actionType
    || loyaltySnapshot.campaignName
    || loyaltySnapshot.offerLabel
    || appliedActions.length
    || redemptionRows.length
  )

  if (!hasPrimaryContent) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className={`inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full border ${actionMeta.badge}`}>
          <i className={`fa-solid ${actionMeta.icon}`} />
          {actionMeta.label}
        </span>
        {loyaltySnapshot.campaignName ? (
          <span className="text-sm text-gray-500 truncate max-w-[220px]">
            {loyaltySnapshot.campaignName}
          </span>
        ) : null}
      </div>

      {loyaltySnapshot.offerLabel ? (
        <div className="text-sm">
          <span className="text-gray-500">Teklif:</span>{' '}
          <span className="font-medium text-gray-700">{loyaltySnapshot.offerLabel}</span>
        </div>
      ) : null}

      {coupon?.code ? (
        <div className="flex items-center gap-2 bg-blue-50 rounded-md p-2 border border-blue-100 flex-wrap">
          <span className="text-xs text-blue-600 font-medium">Kupon:</span>
          <span className="text-sm font-mono text-blue-800">{coupon.code}</span>
          {coupon.label ? <span className="text-xs text-blue-600">({coupon.label})</span> : null}
          {coupon.discount > 0 ? (
            <span className="text-xs font-medium text-blue-700 ml-auto">%{formatNumber(coupon.discount)}</span>
          ) : null}
        </div>
      ) : null}

      {appliedActions.length ? (
        <div className="space-y-1">
          <span className="text-xs text-gray-500">Uygulanan eylemler</span>
          <div className="flex flex-wrap gap-1">
            {appliedActions.map((action, index) => (
              <span
                key={`${action.label}-${index}`}
                className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100"
                title={
                  action.usedPoints
                    ? `${formatNumber(action.usedPoints)} puan`
                    : action.discountAmount
                      ? formatMoney(action.discountAmount)
                      : undefined
                }
              >
                {action.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {decisionLines.length ? (
        <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 space-y-1">
          {decisionLines.map(line => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}

      {redemptionRows.length ? (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <i className="fa-solid fa-coins text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">Puan kullanımı özeti</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {redemptionRows.map(([label, value], index) => (
              <div
                key={`${label}-${index}`}
                className={`flex justify-between ${index === redemptionRows.length - 1 && label === 'İndirim tutarı' ? 'sm:col-span-2 mt-1 pt-1 border-t border-amber-200 font-semibold' : ''}`}
              >
                <span className="text-amber-700">{label}:</span>
                <span className="text-amber-900">{value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function LoyaltyBadge({ loyaltySnapshot }) {
  if (!loyaltySnapshot || !loyaltySnapshot.actionType) return null

  const meta = getActionMeta(loyaltySnapshot)
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${meta.badge}`}>
      <i className={`fa-solid ${meta.icon}`} />
      <span>{meta.label}</span>
      {loyaltySnapshot.campaignName ? (
        <span className="opacity-75 truncate max-w-[100px]">({loyaltySnapshot.campaignName})</span>
      ) : null}
    </span>
  )
}
