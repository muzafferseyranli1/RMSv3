import { db } from '@/lib/db'

export const COMBO_MENU_CATEGORY_NAME = 'Menuler'
const LEGACY_ALACARTE_NAMES = new Set(['alacarte'])

function normalizeCategoryName(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0131/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

export function isComboMenuCategory(categoryOrName) {
  const rawName = typeof categoryOrName === 'string'
    ? categoryOrName
    : categoryOrName?.name
  return normalizeCategoryName(rawName) === 'menuler'
}

export function isLegacyAlaCarteCategory(categoryOrName) {
  const rawName = typeof categoryOrName === 'string'
    ? categoryOrName
    : categoryOrName?.name
  return LEGACY_ALACARTE_NAMES.has(normalizeCategoryName(rawName))
}

export function compareSaleCategoryPriority(left, right) {
  const leftIsCombo = isComboMenuCategory(left)
  const rightIsCombo = isComboMenuCategory(right)
  if (leftIsCombo !== rightIsCombo) return leftIsCombo ? -1 : 1
  return String(left?.name || '').localeCompare(String(right?.name || ''), 'tr')
}

export function sortSaleCategoriesWithComboFirst(categories = []) {
  return [...(categories || [])].sort(compareSaleCategoryPriority)
}

export function resolveComboMenuCategory(categories = []) {
  return (categories || []).find(category => !category?.deleted_at && isComboMenuCategory(category)) || null
}

export function resolveComboMenuCategoryId(categories = [], fallbackId = null) {
  return resolveComboMenuCategory(categories)?.id || fallbackId || null
}

export async function ensureComboMenuCategory(categories = []) {
  const safeCategories = Array.isArray(categories) ? categories : []
  const existingCombo = resolveComboMenuCategory(safeCategories)
  if (existingCombo) {
    return {
      categories: sortSaleCategoriesWithComboFirst(safeCategories),
      comboCategory: existingCombo,
      changed: false,
    }
  }

  const legacyCategory = safeCategories.find(isLegacyAlaCarteCategory) || null
  if (legacyCategory) {
    const { data, error } = await db
      .from('sale_categories')
      .update({
        name: COMBO_MENU_CATEGORY_NAME,
        parent_id: null,
        deleted_at: null,
        bg: legacyCategory.bg || '#dcfce7',
        text_color: legacyCategory.text_color || '#166534',
        description: 'Sadece combo menuler icin ayrilmis kategori',
      })
      .eq('id', legacyCategory.id)
    if (error) throw error
    const updatedCategory = Array.isArray(data) ? data[0] : data
    const nextCategories = safeCategories.map(category => (
      category.id === legacyCategory.id
        ? { ...category, ...updatedCategory }
        : category
    ))
    return {
      categories: sortSaleCategoriesWithComboFirst(nextCategories),
      comboCategory: { ...legacyCategory, ...updatedCategory },
      changed: true,
    }
  }

  const insertPayload = {
    name: COMBO_MENU_CATEGORY_NAME,
    parent_id: null,
    bg: '#dcfce7',
    text_color: '#166534',
    description: 'Sadece combo menuler icin ayrilmis kategori',
  }
  const { data, error } = await db.from('sale_categories').insert(insertPayload)
  if (error) throw error
  const createdCategory = Array.isArray(data) ? data[0] : data
  const nextCategories = [...safeCategories, createdCategory]
  return {
    categories: sortSaleCategoriesWithComboFirst(nextCategories),
    comboCategory: createdCategory,
    changed: true,
  }
}
