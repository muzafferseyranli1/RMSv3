import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

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

if (!DATABASE_URL) {
  console.error('DATABASE_URL zorunludur. Branch service authority demo bootstrap icin Railway Postgres baglantisini env ile verin.')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationPath = path.resolve(__dirname, '..', 'migrations', '006_call_center_branch_routing.sql')

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
  'Denizli|Merkezefendi': ['Adalet Mahallesi', 'Sümer Mahallesi', 'Yenişehir Mahallesi'],
  'Eskişehir|Tepebaşı': ['Hoşnudiye Mahallesi', 'Eskibağlar Mahallesi', 'Bahçelievler Mahallesi'],
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
  'Konya|Selçuklu': ['Bosna Hersek Mahallesi', 'Beyhekim Mahallesi', 'Yazır Mahallesi'],
}

function logStep(message) {
  console.log(`\n[branch-service-authority-demo] ${message}`)
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

function buildLine1(row) {
  return [
    row.city_name,
    row.district_name,
    row.neighborhood_name,
    row.street,
  ].filter(Boolean).join(', ')
}

async function applySchema(client) {
  const sql = await fs.readFile(migrationPath, 'utf8')
  await client.query(sql)
}

async function fetchAuthorityContext(client) {
  const branchesResult = await client.query(`
    select id, name
    from public.company_nodes
    where can_sell = true
    order by sort_order, name
  `)
  const citiesResult = await client.query(`select id, ad from public.tr_iller order by ad`)
  const districtsResult = await client.query(`select id, ad, il_id from public.tr_ilceler order by ad`)
  const neighborhoodsResult = await client.query(`select id, ad, ilce_id from public.tr_mahalleler order by ad`)

  return {
    branches: branchesResult.rows || [],
    cities: citiesResult.rows || [],
    districts: districtsResult.rows || [],
    neighborhoods: neighborhoodsResult.rows || [],
  }
}

function chooseNeighborhoods(area, districtsByCity, neighborhoodsByDistrict) {
  const districtRows = districtsByCity.get(normalizeKey(`${area.city}|${area.district}`)) || []
  const district = districtRows[0] || null
  if (!district) return { district: null, neighborhoods: [] }

  const pool = neighborhoodsByDistrict.get(String(district.id)) || []
  const byKey = new Map(pool.map(row => [normalizeKey(row.ad), row]))
  const chosen = []

  for (const preferredName of area.preferredNeighborhoods || []) {
    const hit = byKey.get(normalizeKey(preferredName))
    if (hit && !chosen.some(row => String(row.id) === String(hit.id))) {
      chosen.push(hit)
    }
  }

  for (const row of pool) {
    if (chosen.length >= 3) break
    if (!chosen.some(item => String(item.id) === String(row.id))) {
      chosen.push(row)
    }
  }

  return { district, neighborhoods: chosen.slice(0, 3) }
}

async function seedAuthority(client) {
  const { branches, cities, districts, neighborhoods } = await fetchAuthorityContext(client)
  const cityByName = new Map(cities.map(row => [normalizeKey(row.ad), row]))
  const districtsByCity = new Map()
  const neighborhoodsByDistrict = new Map()

  for (const district of districts) {
    const city = cities.find(row => String(row.id) === String(district.il_id))
    const key = normalizeKey(`${city?.ad || ''}|${district.ad}`)
    districtsByCity.set(key, [...(districtsByCity.get(key) || []), district])
  }

  for (const neighborhood of neighborhoods) {
    const key = String(neighborhood.ilce_id)
    neighborhoodsByDistrict.set(key, [...(neighborhoodsByDistrict.get(key) || []), neighborhood])
  }

  const addressRows = []
  const coverageRows = []

  for (const branch of branches) {
    const area = resolveBranchArea(branch.name)
    const city = cityByName.get(normalizeKey(area.city))
    if (!city) continue

    const { district, neighborhoods: chosenNeighborhoods } = chooseNeighborhoods(area, districtsByCity, neighborhoodsByDistrict)
    if (!district || !chosenNeighborhoods.length) continue

    const primaryNeighborhood = chosenNeighborhoods[0]
    addressRows.push({
      branch_id: branch.id,
      branch_name: branch.name,
      city_id: String(city.id),
      city_name: city.ad,
      district_id: String(district.id),
      district_name: district.ad,
      neighborhood_id: String(primaryNeighborhood.id),
      neighborhood_name: primaryNeighborhood.ad,
      street: null,
      line_1: buildLine1({
        city_name: city.ad,
        district_name: district.ad,
        neighborhood_name: primaryNeighborhood.ad,
        street: null,
      }),
      metadata: JSON.stringify({
        source: 'demo_branch_authority',
        matchStrategy: 'physical_address',
        seededAt: new Date().toISOString(),
      }),
    })

    chosenNeighborhoods.forEach((neighborhood, index) => {
      coverageRows.push({
        branch_id: branch.id,
        branch_name: branch.name,
        city_id: String(city.id),
        city_name: city.ad,
        district_id: String(district.id),
        district_name: district.ad,
        neighborhood_id: String(neighborhood.id),
        neighborhood_name: neighborhood.ad,
        priority: index + 1,
        metadata: JSON.stringify({
          source: 'demo_branch_authority',
          matchStrategy: 'coverage',
          seededAt: new Date().toISOString(),
        }),
      })
    })
  }

  await client.query('begin')
  try {
    await client.query(`
      delete from public.branch_service_coverage
      where metadata ->> 'source' = 'demo_branch_authority'
    `)
    await client.query(`
      delete from public.branch_addresses
      where metadata ->> 'source' = 'demo_branch_authority'
    `)

    for (const row of addressRows) {
      await client.query(`
        insert into public.branch_addresses (
          branch_id,
          branch_name,
          city_id,
          city_name,
          district_id,
          district_name,
          neighborhood_id,
          neighborhood_name,
          street,
          line_1,
          metadata,
          updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb, now())
        on conflict (branch_id) do update set
          branch_name = excluded.branch_name,
          city_id = excluded.city_id,
          city_name = excluded.city_name,
          district_id = excluded.district_id,
          district_name = excluded.district_name,
          neighborhood_id = excluded.neighborhood_id,
          neighborhood_name = excluded.neighborhood_name,
          street = excluded.street,
          line_1 = excluded.line_1,
          metadata = excluded.metadata,
          active = true,
          deleted_at = null,
          updated_at = now()
      `, [
        row.branch_id,
        row.branch_name,
        row.city_id,
        row.city_name,
        row.district_id,
        row.district_name,
        row.neighborhood_id,
        row.neighborhood_name,
        row.street,
        row.line_1,
        row.metadata,
      ])
    }

    for (const row of coverageRows) {
      await client.query(`
        insert into public.branch_service_coverage (
          branch_id,
          branch_name,
          city_id,
          city_name,
          district_id,
          district_name,
          neighborhood_id,
          neighborhood_name,
          priority,
          metadata,
          updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, now())
      `, [
        row.branch_id,
        row.branch_name,
        row.city_id,
        row.city_name,
        row.district_id,
        row.district_name,
        row.neighborhood_id,
        row.neighborhood_name,
        row.priority,
        row.metadata,
      ])
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }

  return {
    branchAddressCount: addressRows.length,
    branchCoverageCount: coverageRows.length,
  }
}

async function verifyAuthority(client) {
  const addressCountResult = await client.query(`select count(*)::int as count from public.branch_addresses where deleted_at is null and active = true`)
  const coverageCountResult = await client.query(`select count(*)::int as count from public.branch_service_coverage where deleted_at is null and active = true`)

  const summary = {
    branch_addresses: Number(addressCountResult.rows[0]?.count || 0),
    branch_service_coverage: Number(coverageCountResult.rows[0]?.count || 0),
  }

  console.log(JSON.stringify(summary, null, 2))
  return summary
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  try {
    if (!seedOnly && !verifyOnly) {
      logStep('Schema uygulaniyor')
      await applySchema(client)
    }

    if (!schemaOnly && !verifyOnly) {
      logStep('Branch address ve service coverage authority seed yaziliyor')
      const result = await seedAuthority(client)
      console.log(JSON.stringify(result, null, 2))
    }

    logStep('Readback dogrulamasi')
    await verifyAuthority(client)
  } finally {
    await client.end()
  }
}

main().catch(error => {
  console.error('[branch-service-authority-demo] failed:', error?.message || error)
  process.exit(1)
})
