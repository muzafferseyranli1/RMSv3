// catalog-fix-large-images.mjs — Eksik/Büyük görselleri küçültüp yükle
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { IMAGE_MAP } from './catalog-data-ids.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.resolve(__dirname, '..', 'images')
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'

async function q(b) {
  const r = await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) })
  return (await r.json()).data || []
}
async function updateImage(id, b64) {
  const r = await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ table:'sale_items', operation:'update', data:{ pos_image:b64, channel_image:b64 }, filters:[{type:'eq',col:'id',val:id}] }) })
  return r.ok
}

async function main() {
  console.log('=== EKSİK GÖRSELLERİ KÜÇÜLTÜP YÜKLE ===\n')
  
  // Görselsiz satış mallarını bul
  const items = await q({ table:'sale_items', operation:'select', select:'id,name,pos_image' })
  const missing = items.filter(i => !i.pos_image)
  console.log(`Eksik görseli olan ürün sayısı: ${missing.length}`)

  for (const item of missing) {
    const fname = IMAGE_MAP[item.id]
    if (!fname) {
      console.log(`  - ${item.name}: IMAGE_MAP içinde tanımlı değil.`)
      continue
    }

    const fpath = path.join(IMG_DIR, fname)
    if (!fs.existsSync(fpath)) {
      console.log(`  - ${item.name}: ${fname} dosyası bulunamadı.`)
      continue
    }

    console.log(`  + ${item.name} işleniyor (${fname})...`)
    try {
      // 800x800, JPEG, kalite 75 (max 200KB civarı olur)
      const buf = await sharp(fpath)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()

      const b64 = `data:image/jpeg;base64,${buf.toString('base64')}`
      console.log(`    -> Boyut küçültüldü: ${(buf.length/1024).toFixed(1)} KB`)
      
      const ok = await updateImage(item.id, b64)
      if (ok) console.log(`    ✓ DB güncellendi.`)
      else console.log(`    ✗ DB güncellenemedi.`)

    } catch (e) {
      console.error(`    ✗ HATA: ${e.message}`)
    }
  }
}

main().catch(e => { console.error('HATA:', e.message); process.exit(1) })
