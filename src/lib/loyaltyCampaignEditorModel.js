import {
  getDefaultActionConfig,
  getDefaultConditionConfig,
  normalizeCampaign,
  normalizeRule,
} from '@/lib/loyalty'

function createEditorId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function getEditorRuleConditions(rule) {
  const mainConditionHidden = Boolean(rule?.conditionConfig?.__draftEmptyCondition)
  const main = mainConditionHidden ? [] : [{
    id: rule.id,
    conditionKey: rule.conditionKey,
    conditionConfig: rule.conditionConfig || {},
  }]
  const extra = Array.isArray(rule?.conditionConfig?.additionalConditions)
    ? rule.conditionConfig.additionalConditions.map(item => ({
      id: item.id,
      conditionKey: item.conditionKey,
      conditionConfig: item.config || {},
    }))
    : []
  return [...main, ...extra]
}

export function getStandaloneConditionConfig(config = {}) {
  const nextConfig = { ...(config || {}) }
  delete nextConfig.additionalConditions
  delete nextConfig.additionalConditionsMode
  delete nextConfig.__draftEmptyCondition
  return nextConfig
}

export function getStandaloneActionConfig(config = {}) {
  const nextConfig = { ...(config || {}) }
  delete nextConfig.additionalActions
  delete nextConfig.__draftEmptyAction
  return nextConfig
}

export function getEditorRuleActions(rule) {
  const mainActionHidden = Boolean(rule?.actionConfig?.__draftEmptyAction)
  const main = mainActionHidden ? [] : [{
    id: rule.id,
    actionType: rule.actionType,
    actionSummary: rule.actionSummary,
    actionConfig: rule.actionConfig || {},
  }]
  const extra = Array.isArray(rule?.actionConfig?.additionalActions)
    ? rule.actionConfig.additionalActions.map(item => ({
      id: item.id,
      actionType: item.actionType,
      actionSummary: item.actionSummary,
      actionConfig: item.actionConfig || {},
    }))
    : []
  return [...main, ...extra]
}

export function createEditorRuleDraft(rule, scope) {
  return {
    id: rule.id,
    scope,
    active: rule.active !== false,
    stopProcessing: Boolean(rule.stopProcessing),
    conditions: getEditorRuleConditions(rule).map(item => ({
      id: item.id,
      conditionKey: item.conditionKey,
      conditionConfig: item.conditionConfig || {},
    })),
    actions: getEditorRuleActions(rule).map(item => ({
      id: item.id,
      actionType: item.actionType,
      actionSummary: item.actionSummary || '',
      actionConfig: item.actionConfig || {},
    })),
  }
}

export function hydrateEditorRuleFromDraft(draft, index = 0, scope = 'applicable') {
  const conditions = Array.isArray(draft?.conditions) ? draft.conditions : []
  const actions = Array.isArray(draft?.actions) ? draft.actions : []
  const primaryCondition = conditions[0] || null
  const primaryAction = actions[0] || null

  return normalizeRule({
    id: draft?.id || createEditorId('rule'),
    scope,
    conditionKey: primaryCondition?.conditionKey || (scope === 'periodic' ? 'calendar_schedule' : 'birthday'),
    actionType: primaryAction?.actionType || 'bonus_points',
    actionSummary: primaryAction?.actionSummary || '',
    active: draft?.active !== false,
    stopProcessing: Boolean(draft?.stopProcessing),
    sortOrder: ((index + 1) * 10),
    conditionConfig: {
      ...(primaryCondition?.conditionConfig || getDefaultConditionConfig(primaryCondition?.conditionKey || (scope === 'periodic' ? 'calendar_schedule' : 'birthday'))),
      additionalConditions: conditions.slice(1).map(item => ({
        id: item.id,
        conditionKey: item.conditionKey,
        config: item.conditionConfig || {},
      })),
      __draftEmptyCondition: conditions.length === 0,
    },
    actionConfig: {
      ...(primaryAction?.actionConfig || getDefaultActionConfig(primaryAction?.actionType || 'bonus_points')),
      additionalActions: actions.slice(1).map(item => ({
        id: item.id,
        actionType: item.actionType,
        actionSummary: item.actionSummary || '',
        actionConfig: item.actionConfig || {},
      })),
      __draftEmptyAction: actions.length === 0,
    },
  }, index, scope)
}

export function hydrateCampaignForEditor(campaign) {
  const drafts = campaign?.metadata?.editorRuleDrafts || {}
  const applicableDrafts = Array.isArray(drafts.applicable) ? drafts.applicable : null
  const periodicDrafts = Array.isArray(drafts.periodic) ? drafts.periodic : null

  if (!applicableDrafts && !periodicDrafts) return campaign

  return normalizeCampaign({
    ...campaign,
    applicableRules: (applicableDrafts || []).map((draft, index) => hydrateEditorRuleFromDraft(draft, index, 'applicable')),
    periodicRules: (periodicDrafts || []).map((draft, index) => hydrateEditorRuleFromDraft(draft, index, 'periodic')),
  })
}

export function materializeRuleForRuntime(rule, scope) {
  const draft = createEditorRuleDraft(rule, scope)
  const conditions = draft.conditions
  const actions = draft.actions

  if (conditions.length === 0 || actions.length === 0) {
    return { draft, runtimeRules: [] }
  }

  const [primaryCondition, ...extraConditions] = conditions
  const runtimeRules = actions.map((action, index) => normalizeRule({
    id: index === 0 ? rule.id : createEditorId('rule'),
    scope,
    conditionKey: primaryCondition.conditionKey,
    actionType: action.actionType,
    actionSummary: action.actionSummary || '',
    active: action.active !== false,
    stopProcessing: action.stopProcessing ?? draft.stopProcessing,
    sortOrder: ((index + 1) * 10),
    conditionConfig: {
      ...(primaryCondition.conditionConfig || {}),
      additionalConditions: extraConditions.map(item => ({
        id: item.id,
        conditionKey: item.conditionKey,
        config: item.conditionConfig || {},
      })),
    },
    actionConfig: action.actionConfig || {},
  }, index, scope))

  return { draft, runtimeRules }
}

export function serializeCampaignForPersistence(campaign, programId) {
  const nextMetadata = { ...(campaign.metadata || {}) }
  const applicableSerialized = (campaign.applicableRules || []).map(rule => materializeRuleForRuntime(rule, 'applicable'))
  const periodicSerialized = (campaign.periodicRules || []).map(rule => materializeRuleForRuntime(rule, 'periodic'))

  nextMetadata.editorRuleDrafts = {
    applicable: applicableSerialized.map(item => item.draft),
    periodic: periodicSerialized.map(item => item.draft),
  }

  return normalizeCampaign({
    ...campaign,
    programId,
    metadata: nextMetadata,
    applicableRules: applicableSerialized.flatMap(item => item.runtimeRules),
    periodicRules: periodicSerialized.flatMap(item => item.runtimeRules),
  })
}
