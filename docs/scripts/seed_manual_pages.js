/**
 * manual_pages Seeding Script
 * 
 * Bu script mevcut sale_items verilerini Railway API'den çekip
 * her ürün için manual_pages tablosuna el kitabı sayfası oluşturur.
 * 
 * Çalıştırma: node docs/scripts/seed_manual_pages.js
 */

const API = 'http://localhost:3001'

// ── Helpers ──────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`API ${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json
}

// ── Step 1: Kategorileri çek ─────────────────────────────────────
async function getCategories() {
  const { data } = await api('/api/manual/categories')
  return data || []
}

// ── Step 2: Mevcut manual_pages'i çek (zaten eklenenleri atlamak için) ──
async function getExistingPages() {
  const { data } = await api('/api/manual/pages')
  return data || []
}

// ── Step 3: Sale items'ı çek (PostgREST endpoint'i üzerinden) ────
async function getSaleItems() {
  // Railway server'daki PostgREST proxy endpoint'i
  const { data } = await api('/api/sale-items-list')
  return data || []
}

// ── Step 4: Ürün için metadata oluştur ───────────────────────────
function buildProductMetadata(item) {
  return {
    product_image: item.channel_image || item.pos_image || '',
    description: item.channel_description || `${item.name} hazırlama ve servis standartları.`,
    steps: [
      {
        description: `${item.name} standart tarifte belirtilen miktarlarda hazırlanır. Reçete takip edilir ve porsiyon kontrolü yapılır.`,
        imageUrl: ''
      },
      {
        description: 'Hazırlanan ürün servis standartlarına uygun şekilde sunulur. Görünüm, sıcaklık ve porsiyon kontrol edilir.',
        imageUrl: ''
      }
    ],
    visual_comparisons: []
  }
}

// ── Step 5: Tek sayfa oluştur ─────────────────────────────────────
async function createPage(categoryId, item) {
  const body = {
    category_id: categoryId,
    title: item.name,
    content: `## ${item.name}\n\nBu sayfa **${item.name}** ürününün hazırlama, porsiyon ve servis standartlarını içermektedir.\n\n### Temel Bilgiler\n- **SKU:** ${item.sku || 'Tanımsız'}\n- **Kategori:** Ürünler\n${item.prep_time_minutes ? `- **Hazırlık Süresi:** ${item.prep_time_minutes} dakika` : ''}`,
    linked_item_id: item.id,
    linked_item_type: 'sale_item',
    is_draft: false,
    metadata: buildProductMetadata(item)
  }

  const result = await api('/api/manual/pages', {
    method: 'POST',
    body: JSON.stringify(body)
  })
  return result
}

// ── ANA FONKSİYON ──────────────────────────────────────────────────
async function main() {
  console.log('🚀 Manual Pages Seeding Başlıyor...\n')

  // 1. Kategorileri al
  let categories
  try {
    categories = await getCategories()
    console.log(`✅ ${categories.length} kategori bulundu:`)
    categories.forEach(c => console.log(`   - ${c.name} (${c.id})`))
  } catch (err) {
    console.error('❌ Kategoriler alınamadı:', err.message)
    process.exit(1)
  }

  // "Ürünler" kategorisini bul
  const urunlerCat = categories.find(c =>
    c.name?.toLowerCase().includes('ürün') || c.name?.toLowerCase().includes('urun')
  )
  if (!urunlerCat) {
    console.error('❌ "Ürünler" kategorisi bulunamadı! Önce ManualManagement sayfasından kategori oluşturun.')
    process.exit(1)
  }
  console.log(`\n📂 Hedef kategori: ${urunlerCat.name} → ${urunlerCat.id}`)

  // 2. Mevcut sayfaları al
  let existingPages
  try {
    existingPages = await getExistingPages()
    console.log(`\n📋 Mevcut sayfa sayısı: ${existingPages.length}`)
  } catch (err) {
    console.warn('⚠️  Mevcut sayfalar alınamadı, tümü yeni oluşturulacak:', err.message)
    existingPages = []
  }

  // Zaten linked_item_id'si olan sayfaların ID setini oluştur
  const linkedIds = new Set(existingPages.filter(p => p.linked_item_id).map(p => p.linked_item_id))
  console.log(`   (${linkedIds.size} ürün zaten bağlı)`)

  // 3. Sale items'ı çek
  console.log('\n🍔 Satış malları çekiliyor...')
  let saleItems = []
  try {
    saleItems = await getSaleItems()
    console.log(`✅ ${saleItems.length} satış malı bulundu`)
  } catch (err) {
    console.error('❌ Satış malları alınamadı:', err.message)
    console.log('\nℹ️  /api/sale-items-list endpoint\'i yoksa, önce server/index.js\'e ekleyin.')
    console.log('   Veya bu script\'i çalıştırmadan önce manuel içerik ekleyin.')
    process.exit(1)
  }

  // 4. Eksik olanlar için sayfa oluştur
  const toCreate = saleItems.filter(item =>
    item.active !== false &&
    item.deleted_at === null &&
    !linkedIds.has(item.id)
  )
  console.log(`\n📝 Oluşturulacak sayfa sayısı: ${toCreate.length}`)

  let success = 0, fail = 0
  for (const item of toCreate) {
    try {
      await createPage(urunlerCat.id, item)
      console.log(`  ✅ "${item.name}"`)
      success++
      // Rate limit için kısa bekleme
      await new Promise(r => setTimeout(r, 150))
    } catch (err) {
      console.error(`  ❌ "${item.name}": ${err.message}`)
      fail++
    }
  }

  console.log(`\n🎉 Tamamlandı! ${success} başarılı, ${fail} başarısız.`)
  console.log('   /manual sayfasına gidin ve içerikleri görüntüleyin.')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
