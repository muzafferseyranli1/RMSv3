import { db } from './db.js'

export const FRANCHISE_SUGGESTION_TYPES = {
  PRODUCT: 'PRODUCT',
  STOCK_ITEM: 'STOCK_ITEM',
  COMBO_MENU: 'COMBO_MENU',
  OPTION_GROUP: 'OPTION_GROUP',
  SUPPLIER: 'SUPPLIER',
  CAMPAIGN: 'CAMPAIGN',
}

export const franchiseService = {
  /**
   * Franchise Merkez tarafından yeni bir öneri / talep kaydeder
   */
  async submitSuggestion({
    franchiseNodeId,
    franchiseName,
    type,
    itemName = '',
    payload = {},
    reason = '',
    recipe = '',
    salesExpectation = '',
    notes = '',
  }) {
    try {
      if (!franchiseNodeId || !type) {
        throw new Error('Franchise düğüm ID ve öneri tipi zorunludur.')
      }

      const { data, error } = await db.from('franchise_suggestions').insert({
        franchise_node_id: String(franchiseNodeId),
        franchise_name: String(franchiseName || 'Franchise Merkez'),
        type,
        item_name: itemName || payload?.name || 'Yeni Öneri',
        payload,
        reason,
        recipe,
        sales_expectation: salesExpectation,
        notes,
        status: 'PENDING',
      }).select().single()

      if (error) throw error
      return { success: true, data }
    } catch (err) {
      console.error('submitSuggestion error:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * Önerileri filtreleyerek çeker (Genel Merkez veya Franchise Merkez için)
   */
  async getSuggestions({ type = null, status = null, franchiseNodeId = null } = {}) {
    try {
      let query = db.from('franchise_suggestions').select('*').order('created_at', { ascending: false })

      if (type) query = query.eq('type', type)
      if (status) query = query.eq('status', status)
      if (franchiseNodeId) query = query.eq('franchise_node_id', String(franchiseNodeId))

      const { data, error } = await query
      if (error) throw error
      return { success: true, data: data || [] }
    } catch (err) {
      console.error('getSuggestions error:', err)
      return { success: false, data: [], error: err.message }
    }
  },

  /**
   * Genel Merkez tarafından bir öneriyi Onaylama veya Reddetme
   */
  async reviewSuggestion(suggestionId, status, reviewerNote = '') {
    try {
      if (!['APPROVED', 'REJECTED'].includes(status)) {
        throw new Error('Geçersiz durum (APPROVED veya REJECTED olmalı).')
      }

      const { data, error } = await db.from('franchise_suggestions')
        .update({
          status,
          reviewer_note: reviewerNote,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', suggestionId)
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (err) {
      console.error('reviewSuggestion error:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * Franchise Merkez tarafından Fiyat Değişiklik Talebi Gönderme
   */
  async submitPriceChangeRequest({
    franchiseNodeId,
    franchiseName,
    branchIds = [],
    productId,
    productName,
    currentPrice = 0,
    requestedPrice,
    reason = '',
  }) {
    try {
      const { data, error } = await db.from('franchise_price_change_requests').insert({
        franchise_node_id: String(franchiseNodeId),
        franchise_name: String(franchiseName || 'Franchise Merkez'),
        branch_ids: Array.isArray(branchIds) ? branchIds : [],
        product_id: String(productId),
        product_name: String(productName || 'Satış Ürünü'),
        current_price: Number(currentPrice) || 0,
        requested_price: Number(requestedPrice),
        reason,
        status: 'PENDING',
      }).select().single()

      if (error) throw error
      return { success: true, data }
    } catch (err) {
      console.error('submitPriceChangeRequest error:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * Fiyat Değişiklik Taleplerini Çekme
   */
  async getPriceChangeRequests({ status = null, franchiseNodeId = null } = {}) {
    try {
      let query = db.from('franchise_price_change_requests').select('*').order('created_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (franchiseNodeId) query = query.eq('franchise_node_id', String(franchiseNodeId))

      const { data, error } = await query
      if (error) throw error
      return { success: true, data: data || [] }
    } catch (err) {
      console.error('getPriceChangeRequests error:', err)
      return { success: false, data: [], error: err.message }
    }
  },

  /**
   * Genel Merkez tarafından Fiyat Değişiklik Talebini İnceleme ve Onaylama
   */
  async reviewPriceChangeRequest(requestId, status, reviewerNote = '') {
    try {
      const { data, error } = await db.from('franchise_price_change_requests')
        .update({
          status,
          reviewer_note: reviewerNote,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (err) {
      console.error('reviewPriceChangeRequest error:', err)
      return { success: false, error: err.message }
    }
  },
}
