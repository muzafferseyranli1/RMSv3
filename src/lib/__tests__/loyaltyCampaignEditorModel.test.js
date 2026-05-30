import { describe, it, expect } from 'vitest'
import { getStandaloneConditionConfig } from '../loyaltyCampaignEditorModel.js'

describe('getStandaloneConditionConfig', () => {
  it('strips draft and additional condition fields', () => {
    const config = {
      type: 'totalAmount',
      minAmount: 100,
      additionalConditions: [{ type: 'itemCount', count: 2 }],
      additionalConditionsMode: 'and',
      __draftEmptyCondition: true
    }

    const result = getStandaloneConditionConfig(config)

    expect(result).toEqual({
      type: 'totalAmount',
      minAmount: 100
    })
  })

  it('does not mutate original object', () => {
    const config = {
      type: 'totalAmount',
      additionalConditions: []
    }

    getStandaloneConditionConfig(config)

    expect(config).toEqual({
      type: 'totalAmount',
      additionalConditions: []
    })
  })

  it('handles undefined gracefully', () => {
    const result = getStandaloneConditionConfig()
    expect(result).toEqual({})
  })

  it('handles null gracefully', () => {
    const result = getStandaloneConditionConfig(null)
    expect(result).toEqual({})
  })
})
