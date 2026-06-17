/**
 * stock_items (Hammaddeler) Seeding Script
 * 
 * Mevcut tüm stok malları için manual_pages tablosuna el kitabı sayfası oluşturur.
 * Çalıştırma: node docs/scripts/seed_hammadde_pages.js
 */

const API = 'http://localhost:3001'

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`API ${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json
}

function buildHammaddeMetadata(item) {
  const tempMap = { dry: 'Kuru Depo (Oda Sıcaklığı)', cold: 'Soğuk (+2°C / +4°C)', frozen: 'Donmuş (-18°C)' }
  const tempLabel = tempMap[item.temperature_class] || 'Kuru Depo'

  return {
    erp_code: item.sku || '',
    approved_suppliers: '',
    subcategory: '',
    ideal_product_photo: item.image_url || '',
    dimensions: '',
    weight: item.purchase_price ? `${item.purchase_price} ₺ / ${item.unit || 'birim'}` : '',
    slicing_standard: '',
    texture: '',
    order_unit: item.order_unit || item.unit || '',
    min_order_qty: item.min_order ? String(item.min_order) : '',
    delivery_lead_time: '',
    critical_stock_level: item.min_stock ? String(item.min_stock) : '',
    max_stack_qty: item.max_stock ? String(item.max_stock) : '',
    storage_location: '',
    delivery_temp: item.temperature_class === 'frozen' ? '-18°C veya altı'
      : item.temperature_class === 'cold' ? '+2°C ile +4°C arası' : 'Oda sıcaklığı',
    packaging_qty: '',
    box_condition: '',
    storage_area: tempLabel,
    primary_shelf_life: '',
    thawing_procedure: item.temperature_class === 'frozen' ? 'Buzdolabında kontrollü çözündürme (+4°C)' : '',
    secondary_shelf_life: '',
    toast_temp: '',
    toast_time: '',
    caramelization_target: '',
    rejection_logistics: 'Hasarlı ambalaj, kirlilik veya yabancı madde içeren ürünler kabul edilmez.',
    rejection_cutting: '',
    rejection_cold_chain: item.temperature_class !== 'dry'
      ? 'Soğuk zincir kırılmış (erimiş, tekrar dondurulmuş) ürünler kesinlikle reddedilir.' : '',
    rejection_visual: 'Renk değişikliği, koku, küf veya bozulma belirtisi gösteren ürünler reddedilir.',
    visual_comparisons: [],
    custom_parameters: [],
    shelf_lives: [
      {
        id: 'sl-1',
        status: 'Açılmamış',
        storage_area: tempLabel,
        duration: 'Üretici etiketine göre'
      },
      {
        id: 'sl-2',
        status: 'Açılmış / Kullanımda',
        storage_area: item.temperature_class !== 'dry' ? 'Soğuk (+4°C)' : 'Kuru Depo',
        duration: '24-48 saat'
      }
    ],
    steps: [
      {
        description: `${item.name} teslim alınırken ambalaj bütünlüğü kontrol edilir, etiket ve son kullanma tarihi doğrulanır.`,
        imageUrl: '__default_check__'
      },
      {
        description: `${item.name} ${tempLabel} koşullarında muhafaza edilir. FIFO (ilk giren ilk çıkar) kuralı uygulanır.`,
        imageUrl: ''
      }
    ]
  }
}

async function main() {
  console.log('🌱 Hammadde (stock_items) Seeding Başlıyor...\n')

  // 1. Kategoriler
  const { data: categories } = await api('/api/manual/categories')
  const hammaddelerCat = categories.find(c =>
    c.name?.toLowerCase().includes('hammad')
  )
  if (!hammaddelerCat) {
    console.error('❌ "Hammaddeler" kategorisi bulunamadı!')
    process.exit(1)
  }
  console.log(`📂 Hedef: ${hammaddelerCat.name} → ${hammaddelerCat.id}`)

  // 2. Mevcut sayfalar
  const { data: existingPages } = await api('/api/manual/pages')
  const linkedIds = new Set(
    existingPages.filter(p => p.linked_item_id).map(p => p.linked_item_id)
  )
  console.log(`📋 Mevcut sayfa: ${existingPages.length} (${linkedIds.size} bağlı)\n`)

  // 3. Stock items çek
  const { data: stockItems } = await api('/api/stock-items-list')
  console.log(`🥩 ${stockItems.length} stok malı bulundu`)

  const toCreate = stockItems.filter(i => !linkedIds.has(i.id))
  console.log(`📝 Oluşturulacak: ${toCreate.length}\n`)

  let success = 0, fail = 0
  for (const item of toCreate) {
    try {
      await api('/api/manual/pages', {
        method: 'POST',
        body: JSON.stringify({
          category_id: hammaddelerCat.id,
          title: item.name,
          content: `## ${item.name}\n\nBu sayfa **${item.name}** hammaddesinin kabul, depolama ve kullanım standartlarını içermektedir.\n\n- **SKU:** ${item.sku || '—'}\n- **Birim:** ${item.unit || '—'}\n- **Depolama:** ${item.temperature_class === 'frozen' ? 'Donmuş (-18°C)' : item.temperature_class === 'cold' ? 'Soğutmalı (+4°C)' : 'Kuru Depo'}\n- **Min. Stok:** ${item.min_stock || 0} ${item.unit || ''}`,
          linked_item_id: item.id,
          linked_item_type: 'stock_item',
          is_draft: false,
          metadata: buildHammaddeMetadata(item)
        })
      })
      console.log(`  ✅ "${item.name}"`)
      success++
      await new Promise(r => setTimeout(r, 120))
    } catch (err) {
      console.error(`  ❌ "${item.name}": ${err.message}`)
      fail++
    }
  }

  console.log(`\n🎉 Tamamlandı! ${success} başarılı, ${fail} başarısız.`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
