import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')
const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

const argv = new Set(process.argv.slice(2))
const schemaOnly = argv.has('--schema-only')
const seedOnly = argv.has('--seed-only')
const verifyOnly = argv.has('--verify-only')

if (schemaOnly && seedOnly) {
  console.error('Ayni anda hem --schema-only hem --seed-only kullanilamaz.')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationPath = path.resolve(__dirname, '..', 'migrations', '005_tr_sokaklar_reference.sql')

const BRANCH_OVERRIDES = {
  'Antalya Lara Şubesi': { city: 'Antalya', district: 'Muratpaşa', preferredNeighborhoods: ['Lara Mahallesi', 'Fener Mahallesi', 'Güzeloba Mahallesi'] },
  'Bakırköy Şubesi': { city: 'İstanbul', district: 'Bakırköy', preferredNeighborhoods: ['Kartaltepe Mahallesi', 'Zuhuratbaba Mahallesi', 'Ataköy 7-8-9-10. Kısım Mahallesi'] },
  'Beşiktaş Şubesi': { city: 'İstanbul', district: 'Beşiktaş', preferredNeighborhoods: ['Etiler Mahallesi', 'Gayrettepe Mahallesi', 'Levent Mahallesi'] },
  'Eskişehir Şubesi': { city: 'Eskişehir', district: 'Tepebaşı', preferredNeighborhoods: ['Hoşnudiye Mahallesi', 'Eskibağlar Mahallesi', 'Bahçelievler Mahallesi'] },
  'Kadıköy Şubesi': { city: 'İstanbul', district: 'Kadıköy', preferredNeighborhoods: ['Bostancı Mahallesi', 'Caddebostan Mahallesi', 'Kozyatağı Mahallesi'] },
  'Kayseri Şubesi': { city: 'Kayseri', district: 'Melikgazi', preferredNeighborhoods: ['Hunat Mahallesi', 'Tacettin Veli Mahallesi', 'Gesi Fatih Mahallesi'] },
  'Pendik Şubesi': { city: 'İstanbul', district: 'Pendik', preferredNeighborhoods: ['Batı Mahallesi', 'Kurtköy Mahallesi', 'Yenişehir Mahallesi'] },
  'Şişli Şubesi': { city: 'İstanbul', district: 'Şişli', preferredNeighborhoods: ['Esentepe Mahallesi', 'Fulya Mahallesi', 'Mecidiyeköy Mahallesi'] },
  'Üsküdar Şubesi': { city: 'İstanbul', district: 'Üsküdar', preferredNeighborhoods: ['Acıbadem Mahallesi', 'Altunizade Mahallesi', 'Mimar Sinan Mahallesi'] },
}

const DISTRICT_PREFERRED_NEIGHBORHOODS = {
  'Adana|Çukurova': ['Belediye Evleri Mahallesi', 'Güzelyalı Mahallesi', 'Yurt Mahallesi'],
  'Adana|Seyhan': ['Gürselpaşa Mahallesi', 'Kurtuluş Mahallesi', 'Reşatbey Mahallesi'],
  'Ankara|Çankaya': ['Kızılay Mahallesi', 'Bahçelievler Mahallesi', 'Birlik Mahallesi'],
  'Ankara|Etimesgut': ['Eryaman Mahallesi', 'Şehit Osman Avcı Mahallesi', 'Alsancak Mahallesi'],
  'Ankara|Keçiören': ['Etlik Mahallesi', 'Kalaba Mahallesi', 'Ovacık Mahallesi'],
  'Ankara|Pursaklar': ['Fatih Mahallesi', 'Merkez Mahallesi', 'Saray Mahallesi'],
  'Antalya|Alanya': ['Güllerpınarı Mahallesi', 'Kızlarpınarı Mahallesi', 'Saray Mahallesi'],
  'Antalya|Kepez': ['Fabrikalar Mahallesi', 'Kültür Mahallesi', 'Varsak Karşıyaka Mahallesi'],
  'Antalya|Muratpaşa': ['Fener Mahallesi', 'Güzeloba Mahallesi', 'Lara Mahallesi'],
  'Aydın|Kuşadası': ['Türkmen Mahallesi', 'Kadınlar Denizi Mahallesi', 'Davutlar Mahallesi'],
  'Balıkesir|Edremit': ['Akçay Mahallesi', 'Altınkum Mahallesi', 'Altınoluk Mahallesi'],
  'Bursa|Nilüfer': ['Balat Mahallesi', 'Beşevler Mahallesi', 'İhsaniye Mahallesi'],
  'Denizli|Merkezefendi': ['Adalet Mahallesi', 'Sümer Mahallesi', 'Yenişehir Mahallesi'],
  'Eskişehir|Tepebaşı': ['Hoşnudiye Mahallesi', 'Eskibağlar Mahallesi', 'Bahçelievler Mahallesi'],
  'Gaziantep|Şehitkamil': ['Atatürk Mahallesi', 'Batıkent Mahallesi', 'Mücahitler Mahallesi'],
  'İstanbul|Ataşehir': ['Atatürk Mahallesi', 'Barbaros Mahallesi', 'Küçükbakkalköy Mahallesi'],
  'İstanbul|Bakırköy': ['Kartaltepe Mahallesi', 'Zuhuratbaba Mahallesi', 'Ataköy 7-8-9-10. Kısım Mahallesi'],
  'İstanbul|Beşiktaş': ['Etiler Mahallesi', 'Gayrettepe Mahallesi', 'Levent Mahallesi'],
  'İstanbul|Beylikdüzü': ['Adnan Kahveci Mahallesi', 'Barış Mahallesi', 'Büyükşehir Mahallesi'],
  'İstanbul|Kadıköy': ['Bostancı Mahallesi', 'Caddebostan Mahallesi', 'Kozyatağı Mahallesi'],
  'İstanbul|Kartal': ['Atalar Mahallesi', 'Cevizli Mahallesi', 'Soğanlık Yeni Mahallesi'],
  'İstanbul|Pendik': ['Batı Mahallesi', 'Kurtköy Mahallesi', 'Yenişehir Mahallesi'],
  'İstanbul|Sarıyer': ['Ayazağa Mahallesi', 'Maslak Mahallesi', 'Tarabya Mahallesi'],
  'İstanbul|Şişli': ['Esentepe Mahallesi', 'Fulya Mahallesi', 'Mecidiyeköy Mahallesi'],
  'İstanbul|Üsküdar': ['Acıbadem Mahallesi', 'Altunizade Mahallesi', 'Mimar Sinan Mahallesi'],
  'İzmir|Bornova': ['Erzene Mahallesi', 'Kazımdirik Mahallesi', 'Evka 3 Mahallesi'],
  'İzmir|Buca': ['Adatepe Mahallesi', 'Şirinyer Mahallesi', 'Yaylacık Mahallesi'],
  'İzmir|Karşıyaka': ['Bahariye Mahallesi', 'Bostanlı Mahallesi', 'Mavişehir Mahallesi'],
  'İzmir|Konak': ['Alsancak Mahallesi', 'Güzelyalı Mahallesi', 'Kültür Mahallesi'],
  'Kayseri|Melikgazi': ['Hunat Mahallesi', 'Tacettin Veli Mahallesi', 'Gesi Fatih Mahallesi'],
  'Kocaeli|İzmit': ['Yahya Kaptan Mahallesi', 'Alikahya Atatürk Mahallesi', 'Yenişehir Mahallesi'],
  'Konya|Selçuklu': ['Bosna Hersek Mahallesi', 'Beyhekim Mahallesi', 'Yazır Mahallesi'],
  'Mersin|Yenişehir': ['Limonluk Mahallesi', 'Pozcu Mahallesi', 'Fuat Morel Mahallesi'],
  'Muğla|Bodrum': ['Bitez Mahallesi', 'Konacık Mahallesi', 'Yalıkavak Mahallesi'],
  'Samsun|Atakum': ['Cumhuriyet Mahallesi', 'Denizevleri Mahallesi', 'Mimar Sinan Mahallesi'],
  'Trabzon|Ortahisar': ['Beşirli Mahallesi', 'Boztepe Mahallesi', 'Pelitli Mahallesi'],
}

function logStep(message) {
  console.log(`\n[address-reference-demo] ${message}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .split(/\s+/)
    .map(part => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1))
    .join(' ')
}

function normalizeKey(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function inferStreetType(name) {
  const text = normalizeKey(name)
  if (text.includes('bulvari') || text.includes('bulvar')) return 'bulvar'
  if (text.includes('caddesi') || text.includes('cadde')) return 'cadde'
  if (text.includes('sokagi') || text.includes('sokak')) return 'sokak'
  if (text.includes('yolu')) return 'yol'
  return 'diger'
}

function isGoodStreetName(name) {
  const text = normalizeKey(name)
  if (!text) return false
  if (text.length < 3) return false
  if (text.includes('otoyol') || text.includes('otoban') || text.includes('cevre yolu') || text.includes('baglanti yolu')) return false
  if (/\bd ?\d+\b/.test(text)) return false
  return /(sokak|sokagi|cadde|caddesi|bulvar|bulvari|yolu)/.test(text)
}

async function queryApi(body) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.error) {
    throw new Error(payload.error.message || 'Bilinmeyen API hatasi')
  }
  return payload.data
}

async function ensureApiHealth() {
  const response = await fetch(`${API_URL}/health`)
  if (!response.ok) throw new Error(`API health hatasi: HTTP ${response.status}`)
  const payload = await response.json()
  if (!payload?.ok) throw new Error('API health sonucu beklenen sekilde donmedi.')
}

async function applySchema() {
  if (!DATABASE_URL) {
    throw new Error('Schema uygulamasi icin DATABASE_URL gereklidir.')
  }

  const sql = await fs.readFile(migrationPath, 'utf8')
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

async function fetchJson(url, options = {}) {
  const {
    maxRetries = 5,
    minIntervalMs = 0,
    label = url,
    ...fetchOptions
  } = options

  fetchJson.lastRequestAt ||= 0

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const waitMs = Math.max(0, fetchJson.lastRequestAt + minIntervalMs - Date.now())
    if (waitMs > 0) {
      await sleep(waitMs)
    }

    const response = await fetch(url, fetchOptions)
    fetchJson.lastRequestAt = Date.now()

    if (response.ok) {
      return response.json()
    }

    const text = await response.text().catch(() => '')
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const backoffMs = 1500 * attempt
      console.warn(`[retry] ${label} status=${response.status} attempt=${attempt} wait=${backoffMs}ms`)
      await sleep(backoffMs)
      continue
    }

    throw new Error(text || `${label} HTTP ${response.status}`)
  }
}

async function getCities() {
  const payload = await fetchJson('https://beterali.com/api/v1/cities', { label: 'beterali:cities', minIntervalMs: 250 })
  return payload?.data?.cities || []
}

async function getDistricts(cityCode) {
  const payload = await fetchJson(`https://beterali.com/api/v1/districts?city_code=${cityCode}`, { label: `beterali:districts:${cityCode}`, minIntervalMs: 250 })
  return payload?.data?.districts || []
}

async function getNeighborhoods(districtCode) {
  const payload = await fetchJson(`https://beterali.com/api/v1/neighbourhoods?districts_code=${districtCode}`, { label: `beterali:neighborhoods:${districtCode}`, minIntervalMs: 250 })
  return payload?.data?.neighbourhoods || []
}

function resolveBranchArea(branchName) {
  const override = BRANCH_OVERRIDES[branchName]
  if (override) return override

  const plain = String(branchName || '').replace(/\s+Şubesi$/i, '').trim()
  const parts = plain.split(/\s+/)
  const city = parts.shift() || ''
  const district = parts.join(' ').trim()
  return {
    city,
    district,
    preferredNeighborhoods: DISTRICT_PREFERRED_NEIGHBORHOODS[`${city}|${district}`] || [],
  }
}

async function getActiveBranches() {
  const rows = await queryApi({
    table: 'company_nodes',
    operation: 'select',
    select: 'id,name,type,parent_id,can_sell,sort_order',
    filters: [{ type: 'order', col: 'sort_order', ascending: true }],
  })

  return (rows || []).filter(row => row.can_sell === true)
}

function chooseNeighborhoods(city, district, officialNeighborhoods, preferredNames) {
  const byKey = new Map(officialNeighborhoods.map(row => [normalizeKey(row.neighbourhood_name), row]))
  const chosen = []

  for (const preferredName of preferredNames || []) {
    const hit = byKey.get(normalizeKey(preferredName))
    if (hit && !chosen.some(row => row.neighbourhood_code === hit.neighbourhood_code)) {
      chosen.push(hit)
    }
  }

  for (const row of officialNeighborhoods) {
    if (chosen.length >= 3) break
    if (!chosen.some(item => item.neighbourhood_code === row.neighbourhood_code)) {
      chosen.push(row)
    }
  }

  if (!chosen.length) {
    throw new Error(`Mahalle secilemedi: ${city} / ${district}`)
  }

  return chosen
}

async function fetchStreetNamesForNeighborhood(city, district, neighborhood) {
  const query = `[out:json][timeout:25];
area[boundary=administrative][name="${city}"]->.city;
area[boundary=administrative][name="${district}"](area.city)->.district;
area[boundary=administrative][name="${neighborhood}"](area.district)->.hood;
way(area.hood)[highway][name];
out tags;`
  const payload = await fetchJson('https://overpass-api.de/api/interpreter', {
    label: `overpass:${city}:${district}:${neighborhood}`,
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'SuitableRMS/1.0 address-reference-demo',
    },
    body: query,
    minIntervalMs: 1200,
  })
  const names = [...new Set((payload.elements || []).map(row => row.tags?.name).filter(isGoodStreetName))]
    .sort((a, b) => a.localeCompare(b, 'tr'))
    .slice(0, 12)

  return names.map(name => ({ name, sourceRef: `overpass:${city}|${district}|${neighborhood}` }))
}

async function buildCoveragePlan() {
  const branches = await getActiveBranches()
  const officialCities = await getCities()
  const cityByName = new Map(officialCities.map(row => [normalizeKey(row.city_name), row]))

  const districtCache = new Map()
  const neighborhoodCache = new Map()
  const uniqueTargets = new Map()

  for (const branch of branches) {
    const area = resolveBranchArea(branch.name)
    if (!area.city || !area.district) continue

    const cityRow = cityByName.get(normalizeKey(area.city))
    if (!cityRow) throw new Error(`Sehir eslesmedi: ${branch.name} -> ${area.city}`)

    if (!districtCache.has(cityRow.city_code)) {
      districtCache.set(cityRow.city_code, await getDistricts(cityRow.city_code))
    }
    const districtRows = districtCache.get(cityRow.city_code)
    const districtRow = districtRows.find(row => normalizeKey(row.district_name) === normalizeKey(area.district))
    if (!districtRow) throw new Error(`Ilce eslesmedi: ${branch.name} -> ${area.city} / ${area.district}`)

    if (!neighborhoodCache.has(districtRow.district_code)) {
      neighborhoodCache.set(districtRow.district_code, await getNeighborhoods(districtRow.district_code))
    }
    const neighborhoodRows = neighborhoodCache.get(districtRow.district_code)
    const selectedNeighborhoods = chooseNeighborhoods(
      toTitleCase(cityRow.city_name),
      toTitleCase(districtRow.district_name),
      neighborhoodRows,
      area.preferredNeighborhoods || DISTRICT_PREFERRED_NEIGHBORHOODS[`${toTitleCase(cityRow.city_name)}|${toTitleCase(districtRow.district_name)}`] || [],
    )

    uniqueTargets.set(`${cityRow.city_code}|${districtRow.district_code}`, {
      branchName: branch.name,
      city: { id: Number(cityRow.city_code), ad: toTitleCase(cityRow.city_name) },
      district: {
        id: Number(districtRow.district_code),
        il_id: Number(cityRow.city_code),
        ad: toTitleCase(districtRow.district_name),
      },
      neighborhoods: selectedNeighborhoods.map(row => ({
        id: Number(row.neighbourhood_code),
        ilce_id: Number(districtRow.district_code),
        ad: toTitleCase(row.neighbourhood_name),
      })),
    })
  }

  return [...uniqueTargets.values()]
}

async function insertInBatches(table, rows, onConflict, chunkSize = 50) {
  let total = 0
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    await queryApi({
      table,
      operation: 'upsert',
      data: chunk,
      options: onConflict ? { onConflict } : {},
    })
    total += chunk.length
    console.log(`[write] ${table} batch=${index / chunkSize + 1} rows=${chunk.length} total=${total}`)
  }
  return total
}

async function seedData() {
  await ensureApiHealth()
  const coverage = await buildCoveragePlan()

  const cities = []
  const districts = []
  const neighborhoods = []
  const streets = []

  for (const target of coverage) {
    cities.push(target.city)
    districts.push(target.district)
    for (const neighborhood of target.neighborhoods) {
      neighborhoods.push(neighborhood)
      const streetRows = await fetchStreetNamesForNeighborhood(target.city.ad, target.district.ad, neighborhood.ad)
      if (!streetRows.length) {
        console.warn(`[warn] Sokak verisi bulunamadi: ${target.city.ad} / ${target.district.ad} / ${neighborhood.ad}`)
        continue
      }
      for (const street of streetRows) {
        streets.push({
          mahalle_id: neighborhood.id,
          ad: street.name,
          tur: inferStreetType(street.name),
          source: 'openstreetmap',
          source_ref: street.sourceRef,
        })
      }
    }
  }

  const dedupeBy = (rows, keyFn) => [...new Map(rows.map(row => [keyFn(row), row])).values()]

  const cityRows = dedupeBy(cities, row => row.id)
  const districtRows = dedupeBy(districts, row => row.id)
  const neighborhoodRows = dedupeBy(neighborhoods, row => row.id)
  const streetRows = dedupeBy(streets, row => `${row.mahalle_id}|${normalizeKey(row.ad)}`)

  logStep(`Hazir coverage: şehir=${cityRows.length}, ilçe=${districtRows.length}, mahalle=${neighborhoodRows.length}, sokak=${streetRows.length}`)

  await insertInBatches('tr_iller', cityRows, 'id', 25)
  await insertInBatches('tr_ilceler', districtRows, 'id', 50)
  await insertInBatches('tr_mahalleler', neighborhoodRows, 'id', 100)
  await insertInBatches('tr_sokaklar', streetRows, 'mahalle_id,ad', 100)

  return {
    cityCount: cityRows.length,
    districtCount: districtRows.length,
    neighborhoodCount: neighborhoodRows.length,
    streetCount: streetRows.length,
  }
}

async function verifyData() {
  await ensureApiHealth()
  const [cities, districts, neighborhoods, streets] = await Promise.all([
    queryApi({ table: 'tr_iller', operation: 'select', select: 'id,ad' }),
    queryApi({ table: 'tr_ilceler', operation: 'select', select: 'id,ad,il_id' }),
    queryApi({ table: 'tr_mahalleler', operation: 'select', select: 'id,ad,ilce_id' }),
    queryApi({ table: 'tr_sokaklar', operation: 'select', select: 'id,ad,mahalle_id' }),
  ])

  console.log(JSON.stringify({
    cityCount: cities.length,
    districtCount: districts.length,
    neighborhoodCount: neighborhoods.length,
    streetCount: streets.length,
  }, null, 2))
}

async function main() {
  if (!seedOnly && !verifyOnly) {
    logStep('Schema fazi basliyor')
    await applySchema()
    logStep('Schema fazi tamamlandi')
  }

  if (!schemaOnly && !verifyOnly) {
    logStep('Seed fazi basliyor')
    const result = await seedData()
    logStep(`Seed fazi tamamlandi: ${JSON.stringify(result)}`)
  }

  logStep('Verify fazi basliyor')
  await verifyData()
  logStep('Verify fazi tamamlandi')
}

main().catch(error => {
  console.error(`[address-reference-demo] ${error.message}`)
  process.exit(1)
})
