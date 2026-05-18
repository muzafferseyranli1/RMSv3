/**
 * bootstrap-enrich-channel-prices.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * 60 satış malının channel_prices alanını doldurur.
 * - Her kanalda farklı fiyat (baz fiyat ± %5 aralığında)
 * - Fiyatlar 5'in katına yuvarlanır
 * - Tüm kanallar active: true
 * - Railway /api/query üzerinden, 25'li batch'lerle idempotent upsert
 * ─────────────────────────────────────────────────────────────────────────────
 * Çalıştırma:
 *   node scripts/bootstrap-enrich-channel-prices.mjs
 *   node scripts/bootstrap-enrich-channel-prices.mjs --dry-run
 *   node scripts/bootstrap-enrich-channel-prices.mjs --verify-only
 */

const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'
const BATCH_SIZE = 25

const argv = new Set(process.argv.slice(2))
const isDryRun     = argv.has('--dry-run')
const isVerifyOnly = argv.has('--verify-only')

// ─── Kanal bazlı fiyat çarpanları (Hızlı Satış = baz, diğerleri farklı) ─────
// Kanallar sırayla: Hızlı Satış(10), Gel Al(20), Masa(30), QR Menü(40),
//                   Kiosk(50), Suitable Yemek(60), Online Yemek(70)
// Çarpan: 1.00 → baz, >1 = daha pahalı, <1 = daha ucuz
const CHANNEL_MULTIPLIERS = {
  'Hızlı Satış':    1.00,  // baz fiyat
  'Gel Al':         0.97,  // %3 indirimli (paket al götür)
  'Masa':           1.02,  // %2 artı (masa servisi)
  'QR Menü':        1.00,  // baz (self-service QR)
  'Kiosk':          0.98,  // %2 indirimli (kiosk teşvik)
  'Suitable Yemek': 1.05,  // %5 artı (platform komisyonu)
  'Online Yemek':   1.05,  // %5 artı (kurye maliyeti)
}

// ─── Yardımcı fonksiyonlar ─────────────────────────────────────────────────

function roundTo5(price) {
  return Math.round(price / 5) * 5
}

function buildChannelPrices(basePrice, channels, taxId) {
  return channels.map(ch => {
    const multiplier = CHANNEL_MULTIPLIERS[ch.name] ?? 1.00
    const rawPrice   = basePrice * multiplier
    const finalPrice = roundTo5(rawPrice)
    return {
      channel_id: ch.id,
      active:     true,
      price:      finalPrice,
      tax_id:     taxId,
    }
  })
}

function log(msg) {
  console.log(`[enrich-channel-prices] ${msg}`)
}

// ─── API katmanı ───────────────────────────────────────────────────────────

async function apiQuery(body) {
  const res = await fetch(`${API}/api/query`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(json)}`)
  return json.data || json.rows || json || []
}

async function selectAll(table, select) {
  const body = { table, operation: 'select' }
  if (select) body.select = select
  return apiQuery(body)
}

async function upsertItem(item) {
  // channel_prices JSONB — API'ye ham string olarak gönder
  const payload = {
    ...item,
    channel_prices: JSON.stringify(item.channel_prices),
  }
  return apiQuery({
    table:     'sale_items',
    operation: 'upsert',
    data:      payload,
    onConflict: 'id',
  })
}

// ─── Ana akış ──────────────────────────────────────────────────────────────

async function main() {
  log('Başlıyor...')

  // 1. Kanal listesi
  const channels = await selectAll('sales_channels')
  const activeChannels = channels
    .filter(c => !c.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
  log(`Aktif kanallar (${activeChannels.length}): ${activeChannels.map(c => c.name).join(', ')}`)

  if (activeChannels.length === 0) {
    throw new Error('Hiç aktif satış kanalı bulunamadı!')
  }

  // 2. Vergi: KDV Gıda (%10)
  const taxes = await selectAll('taxes')
  const vatTax = taxes.find(t => t.name === 'KDV Gıda') || taxes[0]
  if (!vatTax) throw new Error('Vergi kaydı bulunamadı!')
  log(`Kullanılan vergi: ${vatTax.name} (%${vatTax.rate})`)

  // 3. Tüm satış malları
  const allItems = await selectAll('sale_items', 'id,name,sku,sale_price,channel_prices')
  log(`Toplam satış malı: ${allItems.length}`)

  if (isVerifyOnly) {
    log('\n─── DOĞRULAMA RAPORU ───')
    let ok = 0, empty = 0
    for (const item of allItems) {
      const cp = Array.isArray(item.channel_prices) ? item.channel_prices : []
      const activeCount = cp.filter(c => c.active).length
      if (activeCount === activeChannels.length) {
        ok++
      } else {
        empty++
        log(`  ✗ ${item.name}: ${activeCount}/${activeChannels.length} kanal aktif`)
      }
    }
    log(`\nSonuç: ${ok} ürün tam, ${empty} ürün eksik`)
    return
  }

  // 4. Batch upsert
  let updated = 0
  let skipped = 0

  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE)
    log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}: ${i + 1}–${Math.min(i + BATCH_SIZE, allItems.length)} / ${allItems.length}`)

    for (const item of batch) {
      const basePrice = Number(item.sale_price) || 100
      const channelPrices = buildChannelPrices(basePrice, activeChannels, vatTax.id)

      if (isDryRun) {
        log(`  [DRY-RUN] ${item.name} (baz: ${basePrice}) → ${channelPrices.map(cp => `${activeChannels.find(c => c.id === cp.channel_id)?.name}=${cp.price}`).join(', ')}`)
        skipped++
        continue
      }

      try {
        await upsertItem({ id: item.id, channel_prices: channelPrices })
        log(`  ✓ ${item.name}: ${channelPrices.map(cp => `${activeChannels.find(c => c.id === cp.channel_id)?.name}=${cp.price}₺`).join(' | ')}`)
        updated++
      } catch (err) {
        log(`  ✗ HATA [${item.name}]: ${err.message}`)
      }
    }

    // Batch arası kısa bekleme
    if (i + BATCH_SIZE < allItems.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  log('\n─── ÖZET ───')
  log(`Güncellenen: ${updated}`)
  log(`Atlanan: ${skipped}`)
  log(`Toplam: ${allItems.length}`)
}

main().catch(err => {
  console.error(`[enrich-channel-prices] HATA: ${err.message}`)
  process.exit(1)
})
