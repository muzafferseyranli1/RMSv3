import {
  FAVORITE_PRODUCT_IDS_STORAGE_KEY,
  hydrateFavoriteProductIdsFromDb,
  persistFavoriteProductIdsToDb,
  readLocalFavoriteProductIdsSnapshot,
} from '@/lib/posUiPersistence'

export const FAVORITE_PRODUCT_IDS_KEY = FAVORITE_PRODUCT_IDS_STORAGE_KEY

export function readFavoriteProductIds() {
  return readLocalFavoriteProductIdsSnapshot()
}

export function writeFavoriteProductIds(productIds) {
  persistFavoriteProductIdsToDb(productIds).catch(() => {
    // Favorite selections are best-effort only until the DB write succeeds.
  })
}

export { hydrateFavoriteProductIdsFromDb }
