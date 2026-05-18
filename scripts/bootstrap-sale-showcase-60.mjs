import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'
const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')
const argv = new Set(process.argv.slice(2))
const auditOnly = argv.has('--audit-only')
const verifyOnly = argv.has('--verify-only')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const imagesDir = path.resolve(__dirname, '..', 'images')

const EXISTING_IDS = {
  saleRoot: 'a39c3971-8e16-47be-b859-0d8129178e34',
  burgers: '2f7d8c89-eb26-4dc8-9711-5d458ca4cc4e',
  ketchup: 'd6c0395e-8542-4536-93f3-c831d4e1c5f5',
  mustard: '1c305723-27b5-4e91-a5db-57fdc0b0cf1d',
  sauceChoice: '2ce7c1dd-d2c6-4939-b1b5-825c057d5138',
  burgerSauce: '99cd849a-cf3b-4f80-bdee-8c84e7eedcb2',
  bread: '8a1e3adc-f4de-4b85-85cb-bef887014fc5',
  patty: 'fd843e18-472d-4e1d-9fa9-999831cdf491',
  cheddar: '81ae42d5-214b-439e-8fc2-d7fd849ea1eb',
  hamburger: '70ff989c-d8a5-483a-8bd5-0a2c7b0c48e2',
  mediumPortion: 'c20d07dd-518c-42ef-a054-ca8ab0c07393',
  largePortion: '6a2cbf3e-b716-4067-b2a0-b3d71a2c1f5f',
}

const JSONB_COLUMNS = {
  sale_items: new Set(['location', 'channel_prices', 'portions', 'option_groups', 'recipe_rows']),
  sale_templates: new Set(['sale_ids']),
}

const IMAGE_FILES = {
  burger_klasik: 'DEMO-SAT-BURGER-KLASIK.jpg',
  burger_cheese: 'DEMO-SAT-BURGER-CHEESE.jpg',
  burger_double: 'DEMO-SAT-BURGER-DOUBLE.jpg',
  burger_aci_mayo: 'DEMO-SAT-BURGER-ACI-MAYO.webp',
  burger_bbq: 'DEMO-SAT-BURGER-BBQ.jpg',
  burger_karamelize: 'DEMO-SAT-BURGER-KARAMELIZE.webp',
  burger_mantar: 'DEMO-SAT-BURGER-MANTAR.jpg',
  burger_mini: 'DEMO-SAT-BURGER-MINI.jpg',
  burger_vejetaryen: 'DEMO-SAT-BURGER-VEJETARYEN.png',
  chicken_crispy_burger: 'DEMO-SAT-CHICKEN-CRISPY-BURGER.jpg',
  chicken_wrap: 'DEMO-SAT-CHICKEN-WRAP.png',
  chicken_sandvic: 'DEMO-SAT-CHICKEN-SANDVIC.jpg',
  chicken_nugget_box: 'DEMO-SAT-CHICKEN-NUGGET-BOX.jpg',
  chicken_wings: 'DEMO-SAT-CHICKEN-WINGS.png',
  chicken_panelli_tabak: 'DEMO-SAT-CHICKEN-PANELLI-TABAK.jpg',
  chicken_bowl: 'DEMO-SAT-CHICKEN-BOWL.jpg',
  snack_patates: 'DEMO-SAT-SNACK-PATATES.jpg',
  snack_jalapeno_patates: 'DEMO-SAT-SNACK-JALAPENO-PATATES.jpg',
  snack_sogan_halkasi: 'DEMO-SAT-SNACK-SOGAN-HALKASI.png',
  snack_mozzarella_stick: 'DEMO-SAT-SNACK-MOZZARELLA-STICK.png',
  snack_mini_nugget: 'DEMO-SAT-SNACK-MINI-NUGGET.jpg',
  soft_kola: 'DEMO-SAT-SOFT-KOLA.jpg',
  soft_gazoz: 'DEMO-SAT-SOFT-GAZOZ.jpg',
  soft_ayran: 'DEMO-SAT-SOFT-AYRAN.jpg',
  soft_su: 'DEMO-SAT-SOFT-SU.jpg',
  soft_soda: 'DEMO-SAT-SOFT-SODA.jpg',
  icetea_limon: 'DEMO-SAT-ICETEA-LIMON.png',
  icetea_seftali: 'DEMO-SAT-ICETEA-SEFTALI.png',
  juice_limonata: 'DEMO-SAT-JUICE-LIMONATA.png',
  juice_portakal: 'DEMO-SAT-JUICE-PORTAKAL.jpg',
  juice_elma: 'DEMO-SAT-JUICE-ELMA.jpg',
  juice_karisik: 'DEMO-SAT-JUICE-KARISIK.jpg',
  juice_havuc: 'DEMO-SAT-JUICE-HAVUC.jpg',
  milkshake_cilek: 'DEMO-SAT-MILKSHAKE-CILEK.png',
  milkshake_muz: 'DEMO-SAT-MILKSHAKE-MUZ.png',
  hot_cay: 'DEMO-SAT-HOT-CAY.jpg',
  hot_espresso: 'DEMO-SAT-HOT-ESPRESSO.jpg',
  hot_latte: 'DEMO-SAT-HOT-LATTE.jpg',
  hot_kakao: 'DEMO-SAT-HOT-KAKAO.jpg',
  dessert_cikolata_kup: 'DEMO-SAT-DESSERT-CIKOLATA-KUP.jpg',
  dessert_kremali_kakao: 'DEMO-SAT-DESSERT-KREMALI-KAKAO.webp',
  dessert_meyveli_kup: 'DEMO-SAT-DESSERT-MEYVELI-KUP.jpg',
  dessert_soguk_cikolata: 'DEMO-SAT-DESSERT-SOGUK-CIKOLATA.jpg',
  dessert_vanilya_kup: 'DEMO-SAT-DESSERT-VANILYA-KUP.jpg',
  icecream_cikolata: 'DEMO-SAT-ICECREAM-CIKOLATA.jpg',
  icecream_karisik: 'DEMO-SAT-ICECREAM-KARISIK.jpg',
  icecream_soslu: 'DEMO-SAT-ICECREAM-SOSLU.jpg',
  icecream_vanilya: 'DEMO-SAT-ICECREAM-VANILYA.jpg',
  salad_akdeniz: 'DEMO-SAT-SALAD-AKDENIZ.jpeg',
  salad_hellim: 'DEMO-SAT-SALAD-HELLIM.png',
  salad_mevsim: 'DEMO-SAT-SALAD-MEVSIM.png',
  salad_sezar: 'DEMO-SAT-SALAD-SEZAR.png',
  pasta_kremali_mantar: 'DEMO-SAT-PASTA-KREMALI-MANTAR.png',
  pasta_tavuklu: 'DEMO-SAT-PASTA-TAVUKLU.jpg',
  pizza_margherita: 'DEMO-SAT-PIZZA-MARGHERITA.jpg',
  pizza_karisik: 'DEMO-SAT-PIZZA-KARISIK.webp',
}

const imageCache = new Map()

function logStep(message) {
  console.log(`\n[sale-showcase-60] ${message}`)
}

function stableUuid(scope, value) {
  const hash = createHash('sha1').update(`${scope}:${value}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function slugify(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeWriteValue(table, column, value) {
  if (JSONB_COLUMNS[table]?.has(column) && value !== null && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value
}

function buildBulkUpsertQuery(table, rows, conflictCols = ['id']) {
  if (!rows.length) return null
  const columns = Object.keys(rows[0])
  const values = []
  const valueSql = rows.map((row) => {
    const start = values.length + 1
    values.push(...columns.map((column) => normalizeWriteValue(table, column, row[column])))
    return `(${columns.map((_, index) => `$${start + index}`).join(', ')})`
  })
  const updateColumns = columns.filter((column) => !conflictCols.includes(column))
  const updateSql = updateColumns.map((column) => `"${column}" = excluded."${column}"`).join(', ')
  return {
    sql: `insert into "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) values ${valueSql.join(', ')} on conflict (${conflictCols.map((column) => `"${column}"`).join(', ')}) do update set ${updateSql}`,
    values,
  }
}

async function selectRows(client, sql, params = []) {
  const { rows } = await client.query(sql, params)
  return rows
}

async function selectSingle(client, sql, params = []) {
  const rows = await selectRows(client, sql, params)
  return rows[0] || null
}

async function upsertRows(client, table, rows, conflictCols = ['id']) {
  if (!rows.length) return
  const statement = buildBulkUpsertQuery(table, rows, conflictCols)
  await client.query(statement.sql, statement.values)
}

async function upsertRowsInBatches(client, table, rows, batchSize = 10, conflictCols = ['id']) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    await upsertRows(client, table, batch, conflictCols)
    const ids = batch.map((row) => row.id)
    const verify = await selectSingle(
      client,
      `select count(*)::int as count from "${table}" where id = any($1::uuid[])`,
      [ids],
    )
    if ((verify?.count || 0) !== batch.length) {
      throw new Error(`${table} batch verify basarisiz. Baslangic=${index} beklenen=${batch.length} bulunan=${verify?.count || 0}`)
    }
    console.log(JSON.stringify({ table, batchStart: index, attempted: batch.length, succeeded: verify.count }))
  }
}

function categoryVisual(categoryKey) {
  const palette = {
    burgers: ['#fff7ed', '#c2410c'],
    chicken: ['#eff6ff', '#1d4ed8'],
    snacks: ['#fef3c7', '#b45309'],
    cold_drinks: ['#ecfeff', '#0f766e'],
    hot_drinks: ['#fef2f2', '#b91c1c'],
    desserts: ['#fdf2f8', '#be185d'],
    icecream: ['#eef2ff', '#4338ca'],
    salads: ['#f0fdf4', '#15803d'],
    pasta: ['#fff7ed', '#c2410c'],
    pizza: ['#fee2e2', '#b91c1c'],
    bowls: ['#f0fdf4', '#166534'],
    combos: ['#ede9fe', '#5b21b6'],
  }
  const [bg, text] = palette[categoryKey] || ['#f8fafc', '#334155']
  return { bg, text }
}

function categoryDescription(name) {
  return `${name} ailesi demo satış katalogu için kullanılır.`
}

function toLocationScope(template) {
  return [
    {
      type: 'template',
      id: String(template.id),
      name: String(template.name),
      branchIds: Array.isArray(template.branch_ids) ? template.branch_ids.map(String) : [],
    },
  ]
}

function buildChannelPrices(basePrice, salesChannels, taxId) {
  return salesChannels.map((channel) => ({
    channel_id: channel.id,
    active: true,
    price: Number(basePrice),
    tax_id: taxId,
  }))
}

function buildComboChannelConfig(basePrice, salesChannels, taxId, pricingStrategy, diffValue) {
  return salesChannels.reduce((acc, channel) => {
    acc[String(channel.id)] = {
      active: true,
      taxId: taxId,
      percent: pricingStrategy === 'percent' ? diffValue : 15,
      fixed: pricingStrategy === 'fixed' ? diffValue : 25,
      comboPrice: pricingStrategy === 'set-price' ? basePrice : basePrice,
    }
    return acc
  }, {})
}

function buildRecipeRow(productKey, suffix, payload) {
  return {
    id: stableUuid('recipe-row', `${productKey}:${suffix}`),
    ingredient_type: payload.ingredientType,
    ingredient_id: payload.ingredientId,
    stock_item_id: payload.ingredientType === 'stock' ? payload.ingredientId : null,
    semi_item_id: payload.ingredientType === 'semi' ? payload.ingredientId : null,
    sku: payload.sku,
    unit: payload.unit,
    qty: payload.qty,
    cost: payload.cost,
    waste_pct: '0',
    channels: payload.channels,
    portions: payload.portions,
  }
}

function buildBurgerRecipe(productKey, salesChannels, variant = 'classic') {
  const channels = salesChannels.map((channel) => channel.id)
  const portionDefs = [
    { id: '__standart__', sauceQty: '20.0000', cheddarQty: '15.0000', pattyQty: '1.0000' },
    { id: EXISTING_IDS.mediumPortion, sauceQty: '25.0000', cheddarQty: '20.0000', pattyQty: '1.0000' },
    { id: EXISTING_IDS.largePortion, sauceQty: '35.0000', cheddarQty: '30.0000', pattyQty: '2.0000' },
  ]

  return portionDefs.flatMap((portion) => {
    const rows = [
      buildRecipeRow(productKey, `bread:${portion.id}`, {
        ingredientType: 'stock',
        ingredientId: EXISTING_IDS.bread,
        sku: 'STK-HMB-EKM',
        unit: 'adet',
        qty: '1.0000',
        cost: '6.5000',
        channels,
        portions: [portion.id],
      }),
      buildRecipeRow(productKey, `sauce:${portion.id}`, {
        ingredientType: 'semi',
        ingredientId: EXISTING_IDS.burgerSauce,
        sku: 'SEM-HMB-SOS',
        unit: 'mililitre',
        qty: portion.sauceQty,
        cost: '0.1560',
        channels,
        portions: [portion.id],
      }),
    ]

    const cheddarQty = variant === 'classic' ? portion.cheddarQty : portion.cheddarQty
    if (variant !== 'classic' || cheddarQty !== '0.0000') {
      rows.push(
        buildRecipeRow(productKey, `cheddar:${portion.id}`, {
          ingredientType: 'stock',
          ingredientId: EXISTING_IDS.cheddar,
          sku: 'STK-CHD-GRM',
          unit: 'gram',
          qty: cheddarQty,
          cost: '0.8500',
          channels,
          portions: [portion.id],
        }),
      )
    }

    rows.push(
      buildRecipeRow(productKey, `patty:${portion.id}`, {
        ingredientType: 'stock',
        ingredientId: EXISTING_IDS.patty,
        sku: 'STK-HMB-KFT',
        unit: 'adet',
        qty: variant === 'double' || variant === 'double-cheese'
          ? (portion.id === '__standart__' ? '2.0000' : portion.pattyQty)
          : portion.pattyQty,
        cost: '38.0000',
        channels,
        portions: [portion.id],
      }),
    )

    return rows
  })
}

function buildPortions() {
  return [
    { id: EXISTING_IDS.mediumPortion, name: 'Orta', price_offset: 35 },
    { id: EXISTING_IDS.largePortion, name: 'Büyük', price_offset: 70 },
  ]
}

function supportsSauceChoice(productKey) {
  return new Set([
    'hamburger',
    'cheeseburger',
    'double-hamburger',
    'double-cheeseburger',
    'aci-mayo-burger',
    'bbq-burger',
    'karamelize-soganli-burger',
    'mantarli-burger',
    'mini-burger',
    'crispy-tavuk-burger',
    'tavuk-wrap',
    'tavuklu-sandvic',
  ]).has(productKey)
}

function psSingleQuote(value) {
  return String(value).replace(/'/g, "''")
}

function toSaleItemRow(item) {
  const { key, categoryName, ...row } = item
  return {
    ...row,
    location: [],
    channel_prices: [],
    portions: [],
    option_groups: [],
    recipe_rows: [],
    recipe_linked: false,
    recipe_output_qty: 1,
    recipe_output_unit: 'adet',
    recipe_is_template: false,
  }
}

function loadImageAsDataUrl(imagePath) {
  if (imageCache.has(imagePath)) return imageCache.get(imagePath)
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Gorsel bulunamadi: ${imagePath}`)
  }

  const psScript = [
    'param([string]$path)',
    'Add-Type -AssemblyName System.Drawing',
    '$size = 512',
    '$quality = 85L',
    '$img = [System.Drawing.Image]::FromFile($path)',
    '$bmp = New-Object System.Drawing.Bitmap $size, $size',
    '$gfx = [System.Drawing.Graphics]::FromImage($bmp)',
    '$gfx.Clear([System.Drawing.Color]::White)',
    '$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '$gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality',
    '$gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality',
    '$ratio = [Math]::Min($size / $img.Width, $size / $img.Height)',
    '$w = [int][Math]::Round($img.Width * $ratio)',
    '$h = [int][Math]::Round($img.Height * $ratio)',
    '$x = [int](($size - $w) / 2)',
    '$y = [int](($size - $h) / 2)',
    '$gfx.DrawImage($img, $x, $y, $w, $h)',
    "$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }",
    '$encoder = [System.Drawing.Imaging.Encoder]::Quality',
    '$params = New-Object System.Drawing.Imaging.EncoderParameters 1',
    '$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, $quality)',
    '$ms = New-Object System.IO.MemoryStream',
    '$bmp.Save($ms, $codec, $params)',
    '[Convert]::ToBase64String($ms.ToArray())',
    '$ms.Dispose()',
    '$gfx.Dispose()',
    '$bmp.Dispose()',
    '$img.Dispose()',
  ].join('; ')

  const result = spawnSync(
    'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-Command', `& { ${psScript} }`, imagePath],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 },
  )

  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Gorsel data URL uretilmedi: ${path.basename(imagePath)} ${result.stderr || result.stdout}`)
  }

  const dataUrl = `data:image/jpeg;base64,${result.stdout.trim()}`
  imageCache.set(imagePath, dataUrl)
  return dataUrl
}

function productCatalog() {
  return [
    ['hamburger', 'Hamburger', 'Hamburger', 'burgers', 'SAL-HMB-STD', 245, 'burger_klasik', 8, 'classic'],
    ['cheeseburger', 'Cheeseburger', 'Cheese', 'burgers', 'SAL-HMB-CHS', 265, 'burger_cheese', 8, 'cheese'],
    ['double-hamburger', 'Double Hamburger', 'Double', 'burgers', 'SAL-HMB-DBL', 325, 'burger_double', 10, 'double'],
    ['double-cheeseburger', 'Double Cheeseburger', 'Dbl Cheese', 'burgers', 'SAL-HMB-DBLC', 345, 'burger_double', 10, 'double-cheese'],
    ['aci-mayo-burger', 'Acı Mayo Burger', 'Acı Mayo', 'burgers', 'SAL-HMB-ACI', 275, 'burger_aci_mayo', 8, null],
    ['bbq-burger', 'BBQ Burger', 'BBQ', 'burgers', 'SAL-HMB-BBQ', 285, 'burger_bbq', 8, null],
    ['karamelize-soganli-burger', 'Karamelize Soğanlı Burger', 'Karamelize', 'burgers', 'SAL-HMB-KRM', 289, 'burger_karamelize', 8, null],
    ['mantarli-burger', 'Mantarlı Burger', 'Mantarlı', 'burgers', 'SAL-HMB-MTR', 295, 'burger_mantar', 8, null],
    ['mini-burger', 'Mini Burger', 'Mini', 'burgers', 'SAL-HMB-MINI', 205, 'burger_mini', 6, null],
    ['vejetaryen-burger', 'Vejetaryen Burger', 'Veggie', 'burgers', 'SAL-HMB-VEG', 255, 'burger_vejetaryen', 7, null],

    ['crispy-tavuk-burger', 'Crispy Tavuk Burger', 'Crispy', 'chicken', 'SAL-CHK-CRSP', 255, 'chicken_crispy_burger', 8, null],
    ['tavuk-wrap', 'Tavuk Wrap', 'Wrap', 'chicken', 'SAL-CHK-WRAP', 245, 'chicken_wrap', 7, null],
    ['tavuklu-sandvic', 'Tavuklu Sandviç', 'Sandviç', 'chicken', 'SAL-CHK-SND', 235, 'chicken_sandvic', 6, null],
    ['nugget-box', 'Nugget Box', 'Nugget', 'chicken', 'SAL-CHK-NUG', 215, 'chicken_nugget_box', 6, null],
    ['tavuk-kanat', 'Tavuk Kanat', 'Kanat', 'chicken', 'SAL-CHK-WING', 265, 'chicken_wings', 9, null],
    ['panelli-tavuk-tabagi', 'Panelli Tavuk Tabağı', 'Panelli', 'chicken', 'SAL-CHK-PAN', 285, 'chicken_panelli_tabak', 10, null],
    ['tavuk-bowl', 'Tavuk Bowl', 'Bowl', 'bowls', 'SAL-BWL-CHK', 245, 'chicken_bowl', 6, null],

    ['kucuk-patates', 'Küçük Patates Kızartması', 'K. Patates', 'snacks', 'SAL-SNK-FRY-S', 95, 'snack_patates', 5, null],
    ['baharatli-patates', 'Baharatlı Patates Kızartması', 'Baharatlı', 'snacks', 'SAL-SNK-FRY-B', 105, 'snack_patates', 5, null],
    ['jalapeno-patates', 'Jalapeno Patates', 'Jalapeno', 'snacks', 'SAL-SNK-FRY-J', 119, 'snack_jalapeno_patates', 5, null],
    ['sogan-halkasi', 'Soğan Halkası', 'Soğan', 'snacks', 'SAL-SNK-ONI', 129, 'snack_sogan_halkasi', 6, null],
    ['mozzarella-stick', 'Mozzarella Stick', 'Mozzarella', 'snacks', 'SAL-SNK-MOZ', 135, 'snack_mozzarella_stick', 6, null],
    ['mini-nugget', 'Mini Nugget', 'Mini Nugget', 'snacks', 'SAL-SNK-MNG', 115, 'snack_mini_nugget', 5, null],

    ['cocacola', 'Coca-Cola', 'Kola', 'cold_drinks', 'SAL-DRK-COLA', 49, 'soft_kola', 1, null],
    ['cocacola-zero', 'Coca-Cola Zero', 'Zero', 'cold_drinks', 'SAL-DRK-ZERO', 49, 'soft_kola', 1, null],
    ['fanta', 'Fanta', 'Fanta', 'cold_drinks', 'SAL-DRK-FANTA', 49, 'juice_portakal', 1, null],
    ['sprite', 'Sprite', 'Sprite', 'cold_drinks', 'SAL-DRK-SPRT', 49, 'soft_gazoz', 1, null],
    ['ayran', 'Ayran', 'Ayran', 'cold_drinks', 'SAL-DRK-AYR', 39, 'soft_ayran', 1, null],
    ['su-500ml', 'Su 500 ml', 'Su', 'cold_drinks', 'SAL-DRK-SU', 19, 'soft_su', 1, null],
    ['soda', 'Soda', 'Soda', 'cold_drinks', 'SAL-DRK-SODA', 29, 'soft_soda', 1, null],
    ['ice-tea-limon', 'Ice Tea Limon', 'IceTea Limon', 'cold_drinks', 'SAL-DRK-ITL', 45, 'icetea_limon', 1, null],
    ['ice-tea-seftali', 'Ice Tea Şeftali', 'IceTea Şeftali', 'cold_drinks', 'SAL-DRK-ITS', 45, 'icetea_seftali', 1, null],
    ['limonata', 'Limonata', 'Limonata', 'cold_drinks', 'SAL-DRK-LMN', 55, 'juice_limonata', 2, null],
    ['portakal-suyu', 'Portakal Suyu', 'Portakal', 'cold_drinks', 'SAL-DRK-PRT', 59, 'juice_portakal', 2, null],
    ['elma-suyu', 'Elma Suyu', 'Elma', 'cold_drinks', 'SAL-DRK-ELM', 57, 'juice_elma', 2, null],
    ['karisik-meyve-suyu', 'Karışık Meyve Suyu', 'Karışık', 'cold_drinks', 'SAL-DRK-KRS', 62, 'juice_karisik', 2, null],
    ['havuc-suyu', 'Havuç Suyu', 'Havuç', 'cold_drinks', 'SAL-DRK-HVC', 61, 'juice_havuc', 2, null],
    ['cilek-milkshake', 'Çilek Milkshake', 'Çilek', 'cold_drinks', 'SAL-DRK-MLC', 79, 'milkshake_cilek', 3, null],
    ['muz-milkshake', 'Muz Milkshake', 'Muz', 'cold_drinks', 'SAL-DRK-MLM', 79, 'milkshake_muz', 3, null],

    ['cay', 'Çay', 'Çay', 'hot_drinks', 'SAL-HOT-CAY', 25, 'hot_cay', 2, null],
    ['espresso', 'Espresso', 'Espresso', 'hot_drinks', 'SAL-HOT-ESP', 55, 'hot_espresso', 3, null],
    ['latte', 'Latte', 'Latte', 'hot_drinks', 'SAL-HOT-LAT', 75, 'hot_latte', 4, null],
    ['sicak-cikolata', 'Sıcak Çikolata', 'Sıcak Çik.', 'hot_drinks', 'SAL-HOT-CIK', 69, 'hot_kakao', 4, null],

    ['cikolata-kup', 'Çikolata Kup', 'Çik. Kup', 'desserts', 'SAL-DST-CKP', 119, 'dessert_cikolata_kup', 2, null],
    ['kremali-kakao-tatlisi', 'Kremalı Kakao Tatlısı', 'Kremalı', 'desserts', 'SAL-DST-KRM', 125, 'dessert_kremali_kakao', 2, null],
    ['meyveli-kup', 'Meyveli Kup', 'Meyveli', 'desserts', 'SAL-DST-MYK', 119, 'dessert_meyveli_kup', 2, null],
    ['soguk-cikolata-tatlisi', 'Soğuk Çikolata Tatlısı', 'Soğuk Çik.', 'desserts', 'SAL-DST-SGC', 129, 'dessert_soguk_cikolata', 2, null],
    ['vanilya-kup', 'Vanilya Kup', 'Vanilya', 'desserts', 'SAL-DST-VNK', 119, 'dessert_vanilya_kup', 2, null],

    ['vanilya-dondurma', 'Vanilya Dondurma', 'Vanilya', 'icecream', 'SAL-ICE-VAN', 89, 'icecream_vanilya', 1, null],
    ['cikolatali-dondurma', 'Çikolatalı Dondurma', 'Çikolata', 'icecream', 'SAL-ICE-CIK', 95, 'icecream_cikolata', 1, null],
    ['karisik-dondurma', 'Karışık Dondurma', 'Karışık', 'icecream', 'SAL-ICE-KRS', 99, 'icecream_karisik', 1, null],
    ['soslu-dondurma', 'Soslu Dondurma', 'Soslu', 'icecream', 'SAL-ICE-SOS', 105, 'icecream_soslu', 1, null],

    ['akdeniz-salata', 'Akdeniz Salata', 'Akdeniz', 'salads', 'SAL-SLD-AKD', 159, 'salad_akdeniz', 4, null],
    ['hellim-salata', 'Hellim Salata', 'Hellim', 'salads', 'SAL-SLD-HLM', 179, 'salad_hellim', 4, null],
    ['mevsim-salata', 'Mevsim Salata', 'Mevsim', 'salads', 'SAL-SLD-MVS', 145, 'salad_mevsim', 3, null],
    ['sezar-salata', 'Sezar Salata', 'Sezar', 'salads', 'SAL-SLD-SZR', 189, 'salad_sezar', 4, null],

    ['kremali-mantarli-makarna', 'Kremalı Mantarlı Makarna', 'Mantarlı', 'pasta', 'SAL-PAS-KRM', 239, 'pasta_kremali_mantar', 8, null],
    ['tavuklu-makarna', 'Tavuklu Makarna', 'Tavuklu', 'pasta', 'SAL-PAS-TVK', 255, 'pasta_tavuklu', 8, null],

    ['margherita-pizza', 'Margherita Pizza', 'Margherita', 'pizza', 'SAL-PIZ-MRG', 299, 'pizza_margherita', 12, null],
    ['karisik-pizza', 'Karışık Pizza', 'Karışık', 'pizza', 'SAL-PIZ-KRS', 339, 'pizza_karisik', 12, null],
  ].map(([key, name, shortName, categoryKey, sku, price, imageKey, prepTime, recipeVariant]) => ({
    key,
    name,
    shortName,
    categoryKey,
    sku,
    price,
    imageKey,
    prepTime,
    recipeVariant,
  }))
}

function buildSaleCategories() {
  const defs = [
    { key: 'burgers', name: 'Burgerler', parentId: EXISTING_IDS.saleRoot, id: EXISTING_IDS.burgers },
    { key: 'chicken', name: 'Tavuk Ürünleri', parentId: EXISTING_IDS.saleRoot },
    { key: 'snacks', name: 'Snackler', parentId: EXISTING_IDS.saleRoot },
    { key: 'cold_drinks', name: 'Soğuk İçecekler', parentId: EXISTING_IDS.saleRoot },
    { key: 'hot_drinks', name: 'Sıcak İçecekler', parentId: EXISTING_IDS.saleRoot },
    { key: 'desserts', name: 'Tatlılar', parentId: EXISTING_IDS.saleRoot },
    { key: 'icecream', name: 'Dondurmalar', parentId: EXISTING_IDS.saleRoot },
    { key: 'salads', name: 'Salatalar', parentId: EXISTING_IDS.saleRoot },
    { key: 'pasta', name: 'Makarnalar', parentId: EXISTING_IDS.saleRoot },
    { key: 'pizza', name: 'Pizzalar', parentId: EXISTING_IDS.saleRoot },
    { key: 'bowls', name: 'Bowllar', parentId: EXISTING_IDS.saleRoot },
    { key: 'combos', name: 'Combo Menüler', parentId: EXISTING_IDS.saleRoot },
  ]

  return defs.map((def) => {
    const visual = categoryVisual(def.key)
    return {
      id: def.id || stableUuid('sale-category', def.key),
      name: def.name,
      parent_id: def.parentId,
      bg: visual.bg,
      text_color: visual.text,
      sku_mask: `SAL-${slugify(def.key).slice(0, 3).toUpperCase()}-`,
      append_type: 'karisik',
      append_len: 4,
      description: categoryDescription(def.name),
      acc_cat: null,
      acc_code: null,
      revenue_account_id: null,
      deleted_at: null,
    }
  })
}

function buildSaleTemplates(productsByCategory) {
  return Object.entries(productsByCategory).map(([categoryKey, products]) => ({
    id: stableUuid('sale-template', categoryKey),
    name: `${products[0]?.categoryName || categoryKey} Şablonu`,
    description: `${products[0]?.categoryName || categoryKey} demo satış kartları.`,
    sale_ids: JSON.stringify(products.map((item) => item.id)),
    deleted_at: null,
  }))
}

function buildComboRecords({ saleItemMap, salesChannels, locationScope, comboCategoryId, optionGroupId, taxId }) {
  const combos = [
    {
      key: 'klasik-menu',
      name: 'Klasik Hamburger Menü',
      shortName: 'Klasik Menü',
      sku: 'CMB-HMB-KLS',
      strategy: 'set-price',
      baseValue: 339,
      reflectPriceDiff: false,
      groups: [
        ['Ana Ürün Seçimi', 'hamburger', ['cheeseburger']],
        ['İçecek Seçimi', 'cocacola', ['fanta']],
        ['Snack Seçimi', 'kucuk-patates', ['sogan-halkasi']],
      ],
    },
    {
      key: 'cheese-menu',
      name: 'Cheeseburger Menü',
      shortName: 'Cheese Menü',
      sku: 'CMB-HMB-CHS',
      strategy: 'percent',
      baseValue: 12,
      reflectPriceDiff: true,
      groups: [
        ['Ana Ürün Seçimi', 'cheeseburger', ['double-cheeseburger']],
        ['İçecek Seçimi', 'cocacola-zero', ['fanta']],
        ['Snack Seçimi', 'baharatli-patates', ['sogan-halkasi']],
      ],
    },
    {
      key: 'double-menu',
      name: 'Double Burger Menü',
      shortName: 'Double Menü',
      sku: 'CMB-HMB-DBL',
      strategy: 'fixed',
      baseValue: 35,
      reflectPriceDiff: true,
      groups: [
        ['Ana Ürün Seçimi', 'double-hamburger', ['double-cheeseburger']],
        ['İçecek Seçimi', 'cocacola', ['sprite']],
        ['Snack Seçimi', 'jalapeno-patates', ['mozzarella-stick']],
      ],
    },
    {
      key: 'tavuk-menu',
      name: 'Tavuk Burger Menü',
      shortName: 'Tavuk Menü',
      sku: 'CMB-CHK-STD',
      strategy: 'set-price',
      baseValue: 319,
      reflectPriceDiff: false,
      groups: [
        ['Ana Ürün Seçimi', 'crispy-tavuk-burger', ['tavuk-wrap']],
        ['İçecek Seçimi', 'ayran', ['fanta']],
        ['Snack Seçimi', 'kucuk-patates', ['mini-nugget']],
      ],
    },
    {
      key: 'premium-menu',
      name: 'Premium Burger Menü',
      shortName: 'Premium',
      sku: 'CMB-HMB-PRM',
      strategy: 'percent',
      baseValue: 10,
      reflectPriceDiff: true,
      groups: [
        ['Ana Ürün Seçimi', 'mantarli-burger', ['bbq-burger']],
        ['İçecek Seçimi', 'ice-tea-seftali', ['limonata']],
        ['Snack Seçimi', 'mozzarella-stick', ['sogan-halkasi']],
      ],
    },
    {
      key: 'cocuk-menu',
      name: 'Çocuk Menü',
      shortName: 'Çocuk',
      sku: 'CMB-KID-001',
      strategy: 'fixed',
      baseValue: 20,
      reflectPriceDiff: false,
      groups: [
        ['Ana Ürün Seçimi', 'mini-burger', ['nugget-box']],
        ['İçecek Seçimi', 'ayran', ['su-500ml']],
        ['Snack Seçimi', 'mini-nugget', ['kucuk-patates']],
      ],
    },
  ]

  const defaultPosImage = saleItemMap.get('hamburger')?.pos_image || ''
  const defaultChannelImage = saleItemMap.get('hamburger')?.channel_image || ''

  return combos.map((combo) => ({
    id: stableUuid('combo-record', combo.key),
    sku: combo.sku,
    name: combo.name,
    shortName: combo.shortName,
    active: true,
    deleted: false,
    form: {
      name: combo.name,
      shortName: combo.shortName,
      sku: combo.sku,
      autoSku: false,
      location: locationScope,
      catId: comboCategoryId,
      accCat: '',
      accCode: '',
      pricingStrategy: combo.strategy,
      reflectPriceDiff: combo.reflectPriceDiff,
      defaultPercent: combo.strategy === 'percent' ? combo.baseValue : 15,
      defaultFixed: combo.strategy === 'fixed' ? combo.baseValue : 25,
      defaultComboPrice: combo.strategy === 'set-price' ? combo.baseValue : 300,
      comboOptionGroups: [{ id: stableUuid('combo-option', combo.key), optionGroupId }],
      pos_image: defaultPosImage,
      pos_color: '#1e293b',
      pos_text_color: '#ffffff',
      channel_image: defaultChannelImage,
      channel_description: `${combo.name} demo combo kartıdır.`,
    },
    groups: combo.groups.map(([name, primaryKey, altKeys], index) => ({
      id: stableUuid('combo-group', `${combo.key}:${index}`),
      name,
      primaryItemId: saleItemMap.get(primaryKey)?.id || '',
      alternatives: altKeys.map((altKey, altIndex) => ({
        id: stableUuid('combo-alt', `${combo.key}:${index}:${altIndex}`),
        itemId: saleItemMap.get(altKey)?.id || '',
        manualAdjustments: salesChannels.reduce((acc, channel) => {
          acc[String(channel.id)] = 0
          return acc
        }, {}),
      })),
      optionGroups: index === 0 ? [{ id: stableUuid('combo-group-option', combo.key), optionGroupId }] : [],
    })),
    channelConfig: buildComboChannelConfig(
      combo.strategy === 'set-price' ? combo.baseValue : 300,
      salesChannels,
      taxId,
      combo.strategy,
      combo.baseValue,
    ),
  }))
}

function buildCatalogData({ branchTemplate, salesChannels, vatTax }) {
  const locationScope = toLocationScope(branchTemplate)
  const saleCategories = buildSaleCategories()
  const categoryIdMap = Object.fromEntries(saleCategories.map((item) => [slugify(item.name), item.id]))

  const groupTemplate = {
    group_def_id: EXISTING_IDS.sauceChoice,
    group_name: 'Sos Seçimi',
    required: true,
    min_select: 1,
    max_select: 2,
    options: [
      { option_id: EXISTING_IDS.ketchup, name: 'Ketçap', price: 0 },
      { option_id: EXISTING_IDS.mustard, name: 'Hardal', price: 0 },
    ],
  }

  const categoryKeyToId = {
    burgers: EXISTING_IDS.burgers,
    chicken: categoryIdMap[slugify('Tavuk Ürünleri')],
    snacks: categoryIdMap[slugify('Snackler')],
    cold_drinks: categoryIdMap[slugify('Soğuk İçecekler')],
    hot_drinks: categoryIdMap[slugify('Sıcak İçecekler')],
    desserts: categoryIdMap[slugify('Tatlılar')],
    icecream: categoryIdMap[slugify('Dondurmalar')],
    salads: categoryIdMap[slugify('Salatalar')],
    pasta: categoryIdMap[slugify('Makarnalar')],
    pizza: categoryIdMap[slugify('Pizzalar')],
    bowls: categoryIdMap[slugify('Bowllar')],
    combos: categoryIdMap[slugify('Combo Menüler')],
  }

  const saleItems = productCatalog().map((product) => {
    const id = product.key === 'hamburger' ? EXISTING_IDS.hamburger : stableUuid('sale-item', product.key)
    const assetPath = path.resolve(imagesDir, IMAGE_FILES[product.imageKey])
    const imageDataUrl = loadImageAsDataUrl(assetPath)
    const visual = categoryVisual(product.categoryKey)
    const optionGroups = supportsSauceChoice(product.key)
      ? [{ ...groupTemplate, id: stableUuid('sale-item-option', product.key) }]
      : []
    const recipeRows = product.recipeVariant ? buildBurgerRecipe(product.key, salesChannels, product.recipeVariant) : []
    const categoryName = saleCategories.find((item) => item.id === categoryKeyToId[product.categoryKey])?.name || ''

    return {
      id,
      key: product.key,
      name: product.name,
      short_name: product.shortName,
      sku: product.sku,
      auto_sku: false,
      description: `${product.name} demo satış kartıdır.`,
      location: locationScope,
      cat_l1: null,
      cat_l2: null,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      acc_cat: null,
      acc_code: null,
      unit: null,
      sale_price: product.price,
      cost_price: null,
      tax_id: vatTax.id,
      stock_item_id: null,
      recipe_linked: recipeRows.length > 0,
      active: true,
      deleted_at: null,
      channel_prices: buildChannelPrices(product.price, salesChannels, vatTax.id),
      same_price: true,
      pos_image: imageDataUrl,
      pos_color: visual.bg === '#fff7ed' ? '#9a3412' : '#1e293b',
      pos_text_color: '#ffffff',
      channel_image: imageDataUrl,
      channel_description: `${product.name} satış kanallarında gösterilen demo görselidir.`,
      setting_active: true,
      sale_status: true,
      is_favorite: ['hamburger', 'cheeseburger', 'cocacola', 'fanta', 'kucuk-patates'].includes(product.key),
      split_payment: false,
      print_note: false,
      hide_kitchen: false,
      substitute_id: null,
      portions: product.categoryKey === 'burgers' ? buildPortions() : [],
      option_groups: optionGroups,
      sale_cat_l1: EXISTING_IDS.saleRoot,
      sale_cat_l2: categoryKeyToId[product.categoryKey],
      sale_cat_l3: null,
      sale_cat_l4: null,
      sale_cat_l5: null,
      recipe_rows: recipeRows,
      recipe_output_qty: 1,
      recipe_output_unit: 'adet',
      recipe_is_template: false,
      standard_price: product.price,
      prep_time_minutes: product.prepTime,
      categoryName,
    }
  })

  const productsByCategory = saleItems.reduce((acc, item) => {
    if (!acc[item.categoryName]) acc[item.categoryName] = []
    acc[item.categoryName].push(item)
    return acc
  }, {})

  const saleTemplates = buildSaleTemplates(productsByCategory)
  const saleItemMap = new Map(saleItems.map((item) => [item.key, item]))
  const comboRecords = buildComboRecords({
    saleItemMap,
    salesChannels,
    locationScope,
    comboCategoryId: categoryKeyToId.combos,
    optionGroupId: EXISTING_IDS.sauceChoice,
    taxId: vatTax.id,
  })

  return { saleCategories, saleItems, saleTemplates, comboRecords }
}

function mergeComboRecords(existingRecords, demoRecords) {
  const existing = Array.isArray(existingRecords) ? existingRecords : []
  const preserved = existing.filter((item) => !demoRecords.some((demo) => String(demo.id) === String(item.id)))
  return [...demoRecords, ...preserved]
}

async function auditPilot(client) {
  const hamburger = await selectSingle(
    client,
    'select id, name, portions, option_groups, recipe_rows, pos_image, channel_image from sale_items where id = $1',
    [EXISTING_IDS.hamburger],
  )
  if (!hamburger) throw new Error('Hamburger kaydi bulunamadi.')

  const portions = Array.isArray(hamburger.portions) ? hamburger.portions : []
  const portionMap = new Map(portions.map((item) => [item.name, Number(item.price_offset)]))
  if (portionMap.get('Orta') !== 35 || portionMap.get('Büyük') !== 70) {
    throw new Error('Hamburger porsiyon offsetleri beklenen degerlerde degil.')
  }

  const recipeRows = Array.isArray(hamburger.recipe_rows) ? hamburger.recipe_rows : []
  const hasSemi = recipeRows.some((row) => row?.ingredient_type === 'semi' && row?.semi_item_id === EXISTING_IDS.burgerSauce)
  const hasPatty = recipeRows.some((row) => row?.ingredient_type === 'stock' && row?.stock_item_id === EXISTING_IDS.patty)
  if (!hasSemi || !hasPatty) {
    throw new Error('Hamburger recetesi stock + semi karmasini korumuyor.')
  }

  const optionGroups = Array.isArray(hamburger.option_groups) ? hamburger.option_groups : []
  const sauceGroup = optionGroups.find((item) => String(item?.group_def_id || '') === EXISTING_IDS.sauceChoice)
  if (!sauceGroup || Number(sauceGroup.min_select) !== 1 || Number(sauceGroup.max_select) !== 2) {
    throw new Error('Hamburger Sos Seçimi grubu beklenen min/max degerlerini tasimiyor.')
  }

  const semiItem = await selectSingle(client, 'select name, recipe_rows from semi_items where id = $1', [EXISTING_IDS.burgerSauce])
  const semiRows = Array.isArray(semiItem?.recipe_rows) ? semiItem.recipe_rows : []
  if (!semiRows.length || semiRows.some((row) => row?.ingredient_type !== 'stock')) {
    throw new Error('Hamburger Sosu yalnizca stock girdileriyle dogrulanamadi.')
  }

  const optionGroup = await selectSingle(client, 'select id, name from option_groups where id = $1', [EXISTING_IDS.sauceChoice])
  if (!optionGroup || optionGroup.name !== 'Sos Seçimi') {
    throw new Error('Sos Seçimi option group kaydi bulunamadi veya bozuk.')
  }

  return {
    hamburgerHasImages: Boolean(hamburger.pos_image && hamburger.channel_image),
    recipeRows: recipeRows.length,
    semiRows: semiRows.length,
  }
}

async function writeComboSettings(client, demoRecords) {
  const current = await selectSingle(client, "select value from settings where key = 'combo_menus_v1'")
  const merged = mergeComboRecords(current?.value, demoRecords)
  await client.query(
    `insert into settings(key, value) values ('combo_menus_v1', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(merged)],
  )
  const verify = await selectSingle(client, "select value from settings where key = 'combo_menus_v1'")
  const value = Array.isArray(verify?.value) ? verify.value : []
  const count = demoRecords.filter((item) => value.some((row) => String(row.id) === String(item.id))).length
  if (count !== demoRecords.length) {
    throw new Error(`combo_menus_v1 verify basarisiz. Beklenen=${demoRecords.length} bulunan=${count}`)
  }
}

async function verifyShowcase(client, expectedIds, comboIds) {
  const saleCheck = await selectSingle(
    client,
    'select count(*)::int as count from sale_items where id = any($1::uuid[]) and deleted_at is null',
    [expectedIds],
  )
  if ((saleCheck?.count || 0) !== expectedIds.length) {
    throw new Error(`60 sale_items verify basarisiz. Beklenen=${expectedIds.length}, bulunan=${saleCheck?.count || 0}`)
  }

  const imageCheck = await selectSingle(
    client,
    'select count(*)::int as count from sale_items where id = any($1::uuid[]) and coalesce(pos_image, \'\') <> \'\' and coalesce(channel_image, \'\') <> \'\'',
    [expectedIds],
  )
  if ((imageCheck?.count || 0) !== expectedIds.length) {
    throw new Error(`Gorsel verify basarisiz. Beklenen=${expectedIds.length}, bulunan=${imageCheck?.count || 0}`)
  }

  const comboSetting = await selectSingle(client, "select value from settings where key = 'combo_menus_v1'")
  const comboValue = Array.isArray(comboSetting?.value) ? comboSetting.value : []
  const comboCount = comboIds.filter((id) => comboValue.some((row) => String(row.id) === String(id))).length
  if (comboCount !== comboIds.length) {
    throw new Error(`Combo verify basarisiz. Beklenen=${comboIds.length}, bulunan=${comboCount}`)
  }

  const rows = await selectRows(
    client,
    'select id, name from sale_items where deleted_at is null and name = any($1::text[])',
    [['Hamburger', 'Cheeseburger', 'Coca-Cola', 'Fanta', 'Küçük Patates Kızartması', 'Soğan Halkası']],
  )
  if (rows.length !== 6) {
    throw new Error('Combo cekirdek urunleri eksik.')
  }
}

async function apiQuery(body) {
  const requestPath = path.resolve(__dirname, '..', 'tmp-sale-showcase-request.json')
  fs.writeFileSync(requestPath, JSON.stringify(body), 'utf8')
  const psScript = [
    `$bodyPath = '${psSingleQuote(requestPath)}'`,
    `$uri = '${psSingleQuote(`${API_URL}/api/query`)}'`,
    '$body = Get-Content -Raw -LiteralPath $bodyPath',
    "$resp = Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Body $body",
    '$resp | ConvertTo-Json -Depth 100 -Compress',
  ].join('; ')
  const result = spawnSync(
    'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-Command', psScript],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 },
  )
  try {
    fs.unlinkSync(requestPath)
  } catch {}
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'API query calismadi')
  }
  const payload = JSON.parse(result.stdout.trim())
  if (payload?.error) {
    throw new Error(payload.error.message || 'API query hatasi')
  }
  return payload.data
}

function eq(col, val) {
  return { type: 'eq', col, val }
}

function inFilter(col, val) {
  return { type: 'in', col, val }
}

function order(col, ascending = true) {
  return { type: 'order', col, ascending }
}

async function apiSelect(table, filters = [], select = '*') {
  return apiQuery({ table, operation: 'select', select, filters })
}

async function apiSelectSingle(table, filters = [], select = '*') {
  const rows = await apiSelect(table, [...filters, { type: 'limit', val: 1 }], select)
  return rows[0] || null
}

async function apiUpsert(table, data, onConflict = 'id') {
  try {
    return await apiQuery({ table, operation: 'upsert', data, options: { onConflict } })
  } catch (error) {
    throw new Error(`${table} upsert hatasi: ${error.message}`)
  }
}

async function apiUpdate(table, data, filters) {
  try {
    return await apiQuery({ table, operation: 'update', data, filters })
  } catch (error) {
    throw new Error(`${table} update hatasi: ${error.message}`)
  }
}

async function auditPilotViaApi() {
  const hamburger = await apiSelectSingle('sale_items', [eq('id', EXISTING_IDS.hamburger)])
  if (!hamburger) throw new Error('Hamburger kaydi bulunamadi.')

  const portions = Array.isArray(hamburger.portions) ? hamburger.portions : []
  const portionMap = new Map(portions.map((item) => [item.name, Number(item.price_offset)]))
  if (portionMap.get('Orta') !== 35 || portionMap.get('Büyük') !== 70) {
    throw new Error('Hamburger porsiyon offsetleri beklenen degerlerde degil.')
  }

  const recipeRows = Array.isArray(hamburger.recipe_rows) ? hamburger.recipe_rows : []
  const hasSemi = recipeRows.some((row) => row?.ingredient_type === 'semi' && row?.semi_item_id === EXISTING_IDS.burgerSauce)
  const hasPatty = recipeRows.some((row) => row?.ingredient_type === 'stock' && row?.stock_item_id === EXISTING_IDS.patty)
  if (!hasSemi || !hasPatty) {
    throw new Error('Hamburger recetesi stock + semi karmasini korumuyor.')
  }

  const optionGroups = Array.isArray(hamburger.option_groups) ? hamburger.option_groups : []
  const sauceGroup = optionGroups.find((item) => String(item?.group_def_id || '') === EXISTING_IDS.sauceChoice)
  if (!sauceGroup || Number(sauceGroup.min_select) !== 1 || Number(sauceGroup.max_select) !== 2) {
    throw new Error('Hamburger Sos Seçimi grubu beklenen min/max degerlerini tasimiyor.')
  }

  const semiItem = await apiSelectSingle('semi_items', [eq('id', EXISTING_IDS.burgerSauce)])
  const semiRows = Array.isArray(semiItem?.recipe_rows) ? semiItem.recipe_rows : []
  if (!semiRows.length || semiRows.some((row) => row?.ingredient_type !== 'stock')) {
    throw new Error('Hamburger Sosu yalnizca stock girdileriyle dogrulanamadi.')
  }

  const optionGroup = await apiSelectSingle('option_groups', [eq('id', EXISTING_IDS.sauceChoice)])
  if (!optionGroup || optionGroup.name !== 'Sos Seçimi') {
    throw new Error('Sos Seçimi option group kaydi bulunamadi veya bozuk.')
  }

  return {
    hamburgerHasImages: Boolean(hamburger.pos_image && hamburger.channel_image),
    recipeRows: recipeRows.length,
    semiRows: semiRows.length,
  }
}

async function verifyShowcaseViaApi(expectedIds, comboIds) {
  const items = await apiSelect('sale_items', [inFilter('id', expectedIds)])
  if (items.length !== expectedIds.length) {
    throw new Error(`60 sale_items verify basarisiz. Beklenen=${expectedIds.length}, bulunan=${items.length}`)
  }

  const imageCount = items.filter((item) => String(item.pos_image || '').trim() && String(item.channel_image || '').trim()).length
  if (imageCount !== expectedIds.length) {
    throw new Error(`Gorsel verify basarisiz. Beklenen=${expectedIds.length}, bulunan=${imageCount}`)
  }

  const comboSetting = await apiSelectSingle('settings', [eq('key', 'combo_menus_v1')])
  const comboValue = Array.isArray(comboSetting?.value) ? comboSetting.value : []
  const comboCount = comboIds.filter((id) => comboValue.some((row) => String(row.id) === String(id))).length
  if (comboCount !== comboIds.length) {
    throw new Error(`Combo verify basarisiz. Beklenen=${comboIds.length}, bulunan=${comboCount}`)
  }

  const comboCore = await apiSelect('sale_items', [inFilter('name', ['Hamburger', 'Cheeseburger', 'Coca-Cola', 'Fanta', 'Küçük Patates Kızartması', 'Soğan Halkası'])], 'id,name')
  if (comboCore.length !== 6) {
    throw new Error('Combo cekirdek urunleri eksik.')
  }
}

async function main() {
  const expectedItemIds = productCatalog().map((item) => item.key === 'hamburger' ? EXISTING_IDS.hamburger : stableUuid('sale-item', item.key))
  const expectedComboIds = ['klasik-menu', 'cheese-menu', 'double-menu', 'tavuk-menu', 'premium-menu', 'cocuk-menu']
    .map((key) => stableUuid('combo-record', key))

  if (!DATABASE_URL) {
    logStep('Mevcut hamburger pilotu API uzerinden audit ediliyor')
    const audit = await auditPilotViaApi()
    console.log(JSON.stringify(audit, null, 2))

    if (auditOnly) return
    if (verifyOnly) {
      await verifyShowcaseViaApi(expectedItemIds, expectedComboIds)
      return
    }

    const taxes = await apiSelect('taxes', [order('rate', true), order('name', true)], 'id,name,rate,deleted_at')
    const salesChannels = await apiSelect('sales_channels', [eq('active', true), order('sort_order', true), order('name', true)], 'id,name,sort_order,deleted_at,active')
    const branchTemplates = await apiSelect('branch_templates', [order('name', true)], 'id,name,branch_ids,deleted_at')
    const branchTemplate = branchTemplates.find((item) => item.name === 'Tüm Şubeler')
      || [...branchTemplates].sort((a, b) => (Array.isArray(b.branch_ids) ? b.branch_ids.length : 0) - (Array.isArray(a.branch_ids) ? a.branch_ids.length : 0))[0]
    const vatTax = taxes.find((item) => item.name === 'KDV Gıda') || taxes[0]

    if (!vatTax) throw new Error('KDV Gıda vergisi bulunamadi.')
    if (!branchTemplate) throw new Error('Tüm Şubeler branch template kaydi bulunamadi.')
    if (!Array.isArray(branchTemplate.branch_ids) || !branchTemplate.branch_ids.length) {
      throw new Error('Tüm Şubeler branch template branch_ids bos.')
    }
    if (!salesChannels.length) {
      throw new Error('Aktif sales_channels kaydi bulunamadi.')
    }

    logStep('60 urunluk katalog ve combo tanimlari API uzerinden yaziliyor')
    const catalog = buildCatalogData({ branchTemplate, salesChannels, vatTax })
    console.log(JSON.stringify({ step: 'sale_categories', count: catalog.saleCategories.length }))
    await apiUpsert('sale_categories', catalog.saleCategories, 'id')
    const hamburgerRow = catalog.saleItems.find((item) => item.id === EXISTING_IDS.hamburger)
    if (hamburgerRow) {
      console.log(JSON.stringify({ step: 'sale_items.hamburger_image_patch', count: 1 }))
      await apiUpdate(
        'sale_items',
        {
          pos_image: hamburgerRow.pos_image,
          channel_image: hamburgerRow.channel_image,
          channel_description: hamburgerRow.channel_description,
          pos_color: hamburgerRow.pos_color,
          pos_text_color: hamburgerRow.pos_text_color,
        },
        [eq('id', EXISTING_IDS.hamburger)],
      )
    }
    const upsertableItems = catalog.saleItems.filter((item) => item.id !== EXISTING_IDS.hamburger)
    for (let index = 0; index < upsertableItems.length; index += 5) {
      const batch = upsertableItems.slice(index, index + 5).map(toSaleItemRow)
      if (index === 0) {
        fs.writeFileSync(path.resolve(__dirname, '..', 'tmp-sale-showcase-first-batch.json'), JSON.stringify(batch, null, 2), 'utf8')
      }
      console.log(JSON.stringify({ step: 'sale_items', batchStart: index, count: batch.length }))
      await apiUpsert('sale_items', batch, 'id')
      const verifyRows = await apiSelect('sale_items', [inFilter('id', batch.map((item) => item.id))], 'id,pos_image,channel_image')
      if (verifyRows.length !== batch.length) {
        throw new Error(`sale_items API batch verify basarisiz. Baslangic=${index} beklenen=${batch.length} bulunan=${verifyRows.length}`)
      }
      console.log(JSON.stringify({ table: 'sale_items', batchStart: index, attempted: batch.length, succeeded: verifyRows.length }))
    }
    console.log(JSON.stringify({ step: 'sale_templates', count: catalog.saleTemplates.length }))
    await apiUpsert('sale_templates', catalog.saleTemplates, 'id')

    const currentCombo = await apiSelectSingle('settings', [eq('key', 'combo_menus_v1')])
    const mergedCombo = mergeComboRecords(currentCombo?.value, catalog.comboRecords)
    console.log(JSON.stringify({ step: 'settings.combo_menus_v1', count: catalog.comboRecords.length }))
    await apiUpsert('settings', { key: 'combo_menus_v1', value: JSON.stringify(mergedCombo) }, 'key')

    await verifyShowcaseViaApi(
      catalog.saleItems.map((item) => item.id),
      catalog.comboRecords.map((item) => item.id),
    )

    console.log(JSON.stringify({
      mode: 'api',
      sale_categories: catalog.saleCategories.length,
      sale_items: catalog.saleItems.length,
      sale_templates: catalog.saleTemplates.length,
      combo_records: catalog.comboRecords.length,
      local_images_used: imageCache.size,
    }, null, 2))
    return
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  try {
    logStep('Mevcut hamburger pilotu audit ediliyor')
    const audit = await auditPilot(client)
    console.log(JSON.stringify(audit, null, 2))

    if (auditOnly) return

    if (verifyOnly) {
      await verifyShowcase(client, expectedItemIds, expectedComboIds)
      return
    }

    const taxes = await selectRows(client, 'select id, name, rate from taxes where deleted_at is null order by rate asc, name asc')
    const salesChannels = await selectRows(client, 'select id, name, sort_order from sales_channels where deleted_at is null and active is true order by sort_order asc, name asc')
    const branchTemplates = await selectRows(client, 'select id, name, branch_ids from branch_templates where deleted_at is null order by name asc')
    const branchTemplate = branchTemplates.find((item) => item.name === 'Tüm Şubeler')
      || [...branchTemplates].sort((a, b) => (Array.isArray(b.branch_ids) ? b.branch_ids.length : 0) - (Array.isArray(a.branch_ids) ? a.branch_ids.length : 0))[0]
    const vatTax = taxes.find((item) => item.name === 'KDV Gıda') || taxes[0]

    if (!vatTax) throw new Error('KDV Gıda vergisi bulunamadi.')
    if (!branchTemplate) throw new Error('Tüm Şubeler branch template kaydi bulunamadi.')
    if (!Array.isArray(branchTemplate.branch_ids) || !branchTemplate.branch_ids.length) {
      throw new Error('Tüm Şubeler branch template branch_ids bos.')
    }
    if (!salesChannels.length) {
      throw new Error('Aktif sales_channels kaydi bulunamadi.')
    }

    logStep('60 urunluk katalog ve combo tanimlari hazirlaniyor')
    const catalog = buildCatalogData({ branchTemplate, salesChannels, vatTax })

    await client.query('begin')
    try {
      await upsertRows(client, 'sale_categories', catalog.saleCategories)
      await upsertRowsInBatches(client, 'sale_items', catalog.saleItems.map(toSaleItemRow), 5)
      await upsertRows(client, 'sale_templates', catalog.saleTemplates)
      await writeComboSettings(client, catalog.comboRecords)
      await verifyShowcase(
        client,
        catalog.saleItems.map((item) => item.id),
        catalog.comboRecords.map((item) => item.id),
      )
      await client.query('commit')
      console.log(JSON.stringify({
        sale_categories: catalog.saleCategories.length,
        sale_items: catalog.saleItems.length,
        sale_templates: catalog.saleTemplates.length,
        combo_records: catalog.comboRecords.length,
        local_images_used: imageCache.size,
      }, null, 2))
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`[sale-showcase-60] ${error.message}`)
  process.exit(1)
})
