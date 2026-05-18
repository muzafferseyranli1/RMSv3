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

if (schemaOnly && seedOnly) {
  console.error('Ayni anda hem --schema-only hem --seed-only kullanilamaz.')
  process.exit(1)
}

if (!DATABASE_URL) {
  console.error('DATABASE_URL zorunludur. Canli Railway Postgres baglantisini env ile verin.')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const schemaPath = path.resolve(__dirname, '..', 'sql', 'catalog-hamburger-pilot-bootstrap.sql')

const IDS = {
  stockCategories: {
    root: '8cb4bc2b-f246-4058-a6a9-f443ba1cb926',
    protein: 'c9dbad67-cc6c-4365-92ff-5dff714792ef',
    bakery: 'eeb39ebc-dcc5-4cae-916e-c8117afb4636',
    dairy: 'fc69768a-cbc8-4f93-b9f4-6a9a3afd7e71',
    sauces: 'a852a254-c512-4c15-89ef-e42690e52d17',
  },
  semiCategories: {
    root: '59079c20-3064-4935-82c1-e6ca22e339e1',
    sauces: 'f3453211-4e6c-4275-951c-05d16b0cc914',
  },
  saleCategories: {
    root: 'a39c3971-8e16-47be-b859-0d8129178e34',
    burgers: '2f7d8c89-eb26-4dc8-9711-5d458ca4cc4e',
    extras: 'dff67be0-b0aa-4338-af07-955eb403fd3a',
  },
  suppliers: {
    bread: 'db863d5a-30b9-4bc7-a60e-6348ed473864',
    meat: '6002b2b8-e13e-4286-8f65-a3c783695d24',
    dairy: '43d07d7e-08f3-4cf2-a98a-f6aa16219f8c',
    sauces: '19dece80-9803-49a5-a314-e058179df54f',
  },
  stockItems: {
    bread: '8a1e3adc-f4de-4b85-85cb-bef887014fc5',
    patty: 'fd843e18-472d-4e1d-9fa9-999831cdf491',
    cheddar: '81ae42d5-214b-439e-8fc2-d7fd849ea1eb',
    ketchup: 'a49dcd4d-89de-4896-8910-8a8f253094f1',
    mustard: '71f60490-5cee-4820-8f74-9316914eb5eb',
    mayo: '59ef6f6b-f44b-4ca1-aa52-8800d61d54bf',
  },
  semiItems: {
    burgerSauce: '99cd849a-cf3b-4f80-bdee-8c84e7eedcb2',
  },
  saleOptions: {
    ketchup: 'd6c0395e-8542-4536-93f3-c831d4e1c5f5',
    mustard: '1c305723-27b5-4e91-a5db-57fdc0b0cf1d',
  },
  optionGroups: {
    sauceChoice: '2ce7c1dd-d2c6-4939-b1b5-825c057d5138',
  },
  saleItems: {
    burger: '70ff989c-d8a5-483a-8bd5-0a2c7b0c48e2',
  },
  templates: {
    stockAll: 'ac7ac10b-d39d-43f2-bad4-547bfc674275',
    stockSauces: '09cd6c59-8bce-4f16-8b77-82657dbc0571',
    saleBurgers: 'c9cdb314-4a8f-4488-98a3-bbfabf650847',
  },
  portions: {
    medium: 'c20d07dd-518c-42ef-a054-ca8ab0c07393',
    large: '6a2cbf3e-b716-4067-b2a0-b3d71a2c1f5f',
  },
}

const JSONB_COLUMNS = {
  suppliers: new Set(['yetkililer', 'siparis_mailleri', 'siparis_telefonlari']),
  stock_items: new Set(['location', 'packaging_units', 'suppliers_list']),
  semi_items: new Set(['location', 'channel_prices', 'portions', 'option_groups', 'recipe_rows']),
  sale_options: new Set(['channel_prices', 'portions', 'recipe_rows']),
  option_groups: new Set(['options']),
  sale_items: new Set(['location', 'channel_prices', 'portions', 'option_groups', 'recipe_rows']),
  stock_templates: new Set(['stock_ids']),
  sale_templates: new Set(['sale_ids']),
}

function logStep(message) {
  console.log(`\n[hamburger-pilot-bootstrap] ${message}`)
}

function buildGroupOptionsPayload(options, minSelect, maxSelect) {
  return [
    {
      __meta_type: 'selection_rules',
      min_select: Math.max(0, parseInt(minSelect, 10) || 0),
      max_select: Math.max(0, parseInt(maxSelect, 10) || 1),
    },
    ...options,
  ]
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

function buildBulkUpsertQuery(table, rows, conflictCols = ['id']) {
  if (!rows.length) return null

  const columns = Object.keys(rows[0])
  const quotedColumns = columns.map(column => `"${column}"`).join(', ')
  const values = []
  const rowPlaceholders = rows.map(row => {
    const start = values.length + 1
    values.push(...columns.map(column => normalizeWriteValue(table, column, row[column])))
    return `(${columns.map((_, index) => `$${start + index}`).join(', ')})`
  })

  const updateColumns = columns.filter(column => !conflictCols.includes(column))
  const updateSql = updateColumns.length
    ? updateColumns.map(column => `"${column}" = EXCLUDED."${column}"`).join(', ')
    : 'id = EXCLUDED.id'

  return {
    sql: `insert into "${table}" (${quotedColumns}) values ${rowPlaceholders.join(', ')} on conflict (${conflictCols.map(column => `"${column}"`).join(', ')}) do update set ${updateSql}`,
    values,
  }
}

function normalizeWriteValue(table, column, value) {
  if (JSONB_COLUMNS[table]?.has(column) && value !== null && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value
}

async function readSqlFile(filePath) {
  return fs.readFile(filePath, 'utf8')
}

async function applySchema(client) {
  const sql = await readSqlFile(schemaPath)
  await client.query(sql)
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

function buildSeedData({ branchTemplate, salesChannels, vatTax }) {
  const locationScope = toLocationScope(branchTemplate)
  const now = new Date().toISOString()

  const stockCategories = [
    {
      id: IDS.stockCategories.root,
      name: 'Hamburger Hammaddeleri',
      parent_id: null,
      bg: '#fef3c7',
      text_color: '#92400e',
      sku_mask: 'STK-HMB-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Hamburger ailesinin cekirdek stok kategorisi.',
      acc_cat: null,
      acc_code: null,
      expense_account_id: null,
      deleted_at: null,
    },
    {
      id: IDS.stockCategories.protein,
      name: 'Et ve Proteinler',
      parent_id: IDS.stockCategories.root,
      bg: '#fee2e2',
      text_color: '#991b1b',
      sku_mask: 'STK-ET-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Kofte ve protein bazli hamburger girdileri.',
      acc_cat: null,
      acc_code: null,
      expense_account_id: null,
      deleted_at: null,
    },
    {
      id: IDS.stockCategories.bakery,
      name: 'Ekmek ve Unlu Mamuller',
      parent_id: IDS.stockCategories.root,
      bg: '#ffedd5',
      text_color: '#9a3412',
      sku_mask: 'STK-EKM-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Ekmek ve yardimci unlu mamul stoklari.',
      acc_cat: null,
      acc_code: null,
      expense_account_id: null,
      deleted_at: null,
    },
    {
      id: IDS.stockCategories.dairy,
      name: 'Peynir ve Sut Urunleri',
      parent_id: IDS.stockCategories.root,
      bg: '#ecfccb',
      text_color: '#3f6212',
      sku_mask: 'STK-SUT-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Hamburgerlerde kullanilan peynir ve sut urunleri.',
      acc_cat: null,
      acc_code: null,
      expense_account_id: null,
      deleted_at: null,
    },
    {
      id: IDS.stockCategories.sauces,
      name: 'Soslar',
      parent_id: IDS.stockCategories.root,
      bg: '#dbeafe',
      text_color: '#1d4ed8',
      sku_mask: 'STK-SOS-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Ketcap, hardal ve mayonez gibi yardimci soslar.',
      acc_cat: null,
      acc_code: null,
      expense_account_id: null,
      deleted_at: null,
    },
  ]

  const semiCategories = [
    {
      id: IDS.semiCategories.root,
      name: 'Hazırlık Ürünleri',
      parent_id: null,
      bg: '#ede9fe',
      text_color: '#5b21b6',
      sku_mask: 'SEM-HZR-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Servis oncesi hazirlanan yarimamul urunler.',
      acc_cat: null,
      acc_code: null,
      semi_cost_account_id: null,
      deleted_at: null,
    },
    {
      id: IDS.semiCategories.sauces,
      name: 'Sos Bazları',
      parent_id: IDS.semiCategories.root,
      bg: '#fae8ff',
      text_color: '#86198f',
      sku_mask: 'SEM-SOS-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Hamburger ve benzeri urunlerde kullanilan sos bazlari.',
      acc_cat: null,
      acc_code: null,
      semi_cost_account_id: null,
      deleted_at: null,
    },
  ]

  const saleCategories = [
    {
      id: IDS.saleCategories.root,
      name: 'A la Carte',
      parent_id: null,
      bg: '#dbeafe',
      text_color: '#1d4ed8',
      sku_mask: 'SAL-ALC-',
      append_type: 'karisik',
      append_len: 4,
      description: 'A la carte satis kategorileri.',
      acc_cat: null,
      acc_code: null,
      revenue_account_id: null,
      deleted_at: null,
    },
    {
      id: IDS.saleCategories.burgers,
      name: 'Hamburgerler',
      parent_id: IDS.saleCategories.root,
      bg: '#fef3c7',
      text_color: '#92400e',
      sku_mask: 'SAL-HMB-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Hamburger satis kartlari.',
      acc_cat: null,
      acc_code: null,
      revenue_account_id: null,
      deleted_at: null,
    },
    {
      id: IDS.saleCategories.extras,
      name: 'Ekstralar',
      parent_id: IDS.saleCategories.root,
      bg: '#dcfce7',
      text_color: '#166534',
      sku_mask: 'SAL-EKS-',
      append_type: 'karisik',
      append_len: 4,
      description: 'Hamburgere bagli ekstra satis elemanlari.',
      acc_cat: null,
      acc_code: null,
      revenue_account_id: null,
      deleted_at: null,
    },
  ]

  const suppliers = [
    {
      id: IDS.suppliers.bread,
      cari_kodu: 'SUP-BRD-001',
      muhasebe_kodu: '320.001',
      karsi_taraf_kodu: 'BRD-HMB',
      name: 'Anadolu Ekmek Tedarik A.Ş.',
      marka_kisa_adi: 'Anadolu Ekmek',
      yetkililer: [],
      sirket_tipi: 'tuzel',
      vergi_dairesi: null,
      vergi_no: null,
      tc_no: null,
      fatura_tipi: 'e_fatura',
      pay_term: 30,
      banka: null,
      iban: null,
      siparis_yontemi: 'email',
      siparis_mailleri: [],
      siparis_telefonlari: [],
      siparis_wa_no: null,
      logo_url: null,
      cat: 'Ekmek',
      address: null,
      notes: 'Hamburger ekmegi tedarikcisi.',
      active: true,
      deleted_at: null,
    },
    {
      id: IDS.suppliers.meat,
      cari_kodu: 'SUP-MET-001',
      muhasebe_kodu: '320.002',
      karsi_taraf_kodu: 'MET-HMB',
      name: 'Marmara Et Ürünleri Ltd. Şti.',
      marka_kisa_adi: 'Marmara Et',
      yetkililer: [],
      sirket_tipi: 'tuzel',
      vergi_dairesi: null,
      vergi_no: null,
      tc_no: null,
      fatura_tipi: 'e_fatura',
      pay_term: 30,
      banka: null,
      iban: null,
      siparis_yontemi: 'email',
      siparis_mailleri: [],
      siparis_telefonlari: [],
      siparis_wa_no: null,
      logo_url: null,
      cat: 'Et',
      address: null,
      notes: 'Hamburger kofte tedarikcisi.',
      active: true,
      deleted_at: null,
    },
    {
      id: IDS.suppliers.dairy,
      cari_kodu: 'SUP-DRY-001',
      muhasebe_kodu: '320.003',
      karsi_taraf_kodu: 'DRY-HMB',
      name: 'Horeca Süt ve Peynir Dağıtım A.Ş.',
      marka_kisa_adi: 'Horeca Süt',
      yetkililer: [],
      sirket_tipi: 'tuzel',
      vergi_dairesi: null,
      vergi_no: null,
      tc_no: null,
      fatura_tipi: 'e_fatura',
      pay_term: 30,
      banka: null,
      iban: null,
      siparis_yontemi: 'email',
      siparis_mailleri: [],
      siparis_telefonlari: [],
      siparis_wa_no: null,
      logo_url: null,
      cat: 'Peynir',
      address: null,
      notes: 'Cheddar peynir tedarikcisi.',
      active: true,
      deleted_at: null,
    },
    {
      id: IDS.suppliers.sauces,
      cari_kodu: 'SUP-SOS-001',
      muhasebe_kodu: '320.004',
      karsi_taraf_kodu: 'SOS-HMB',
      name: 'Tat Sos Horeca Dağıtım Ltd. Şti.',
      marka_kisa_adi: 'Tat Sos',
      yetkililer: [],
      sirket_tipi: 'tuzel',
      vergi_dairesi: null,
      vergi_no: null,
      tc_no: null,
      fatura_tipi: 'e_fatura',
      pay_term: 30,
      banka: null,
      iban: null,
      siparis_yontemi: 'email',
      siparis_mailleri: [],
      siparis_telefonlari: [],
      siparis_wa_no: null,
      logo_url: null,
      cat: 'Sos',
      address: null,
      notes: 'Ketcap, hardal ve mayonez tedarikcisi.',
      active: true,
      deleted_at: null,
    },
  ]

  const stockItems = [
    {
      id: IDS.stockItems.bread,
      sku: 'STK-HMB-EKM',
      auto_sku: false,
      name: 'Hamburger Ekmeği',
      short_name: 'Ekmeği',
      location: locationScope,
      acc_cat: null,
      acc_code: null,
      cat_l1: IDS.stockCategories.root,
      cat_l2: IDS.stockCategories.bakery,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      unit: 'adet',
      packaging_units: [],
      min_stock: 0,
      max_stock: 1000,
      reorder: null,
      order_unit: 'ana',
      min_order: null,
      max_order: null,
      recipe_linked: true,
      daily_usage: null,
      auto_usage: false,
      supp_id: IDS.suppliers.bread,
      purchase_price: 6.5,
      suppliers_list: [{ supp_id: IDS.suppliers.bread, purchase_price: 6.5, is_default: true }],
      saleable: false,
      sale_name: null,
      sale_group: null,
      deleted_at: null,
    },
    {
      id: IDS.stockItems.patty,
      sku: 'STK-HMB-KFT',
      auto_sku: false,
      name: 'Hamburger Köftesi',
      short_name: 'Köftesi',
      location: locationScope,
      acc_cat: null,
      acc_code: null,
      cat_l1: IDS.stockCategories.root,
      cat_l2: IDS.stockCategories.protein,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      unit: 'adet',
      packaging_units: [],
      min_stock: 0,
      max_stock: 1000,
      reorder: null,
      order_unit: 'ana',
      min_order: null,
      max_order: null,
      recipe_linked: true,
      daily_usage: null,
      auto_usage: false,
      supp_id: IDS.suppliers.meat,
      purchase_price: 38,
      suppliers_list: [{ supp_id: IDS.suppliers.meat, purchase_price: 38, is_default: true }],
      saleable: false,
      sale_name: null,
      sale_group: null,
      deleted_at: null,
    },
    {
      id: IDS.stockItems.cheddar,
      sku: 'STK-CHD-GRM',
      auto_sku: false,
      name: 'Cheddar Peyniri',
      short_name: 'Cheddar',
      location: locationScope,
      acc_cat: null,
      acc_code: null,
      cat_l1: IDS.stockCategories.root,
      cat_l2: IDS.stockCategories.dairy,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      unit: 'gram',
      packaging_units: [],
      min_stock: 0,
      max_stock: 1000,
      reorder: null,
      order_unit: 'ana',
      min_order: null,
      max_order: null,
      recipe_linked: true,
      daily_usage: null,
      auto_usage: false,
      supp_id: IDS.suppliers.dairy,
      purchase_price: 0.85,
      suppliers_list: [{ supp_id: IDS.suppliers.dairy, purchase_price: 0.85, is_default: true }],
      saleable: false,
      sale_name: null,
      sale_group: null,
      deleted_at: null,
    },
    {
      id: IDS.stockItems.ketchup,
      sku: 'STK-KTC-ML',
      auto_sku: false,
      name: 'Ketçap',
      short_name: 'Ketçap',
      location: locationScope,
      acc_cat: null,
      acc_code: null,
      cat_l1: IDS.stockCategories.root,
      cat_l2: IDS.stockCategories.sauces,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      unit: 'mililitre',
      packaging_units: [],
      min_stock: 0,
      max_stock: 1000,
      reorder: null,
      order_unit: 'ana',
      min_order: null,
      max_order: null,
      recipe_linked: true,
      daily_usage: null,
      auto_usage: false,
      supp_id: IDS.suppliers.sauces,
      purchase_price: 0.12,
      suppliers_list: [{ supp_id: IDS.suppliers.sauces, purchase_price: 0.12, is_default: true }],
      saleable: false,
      sale_name: null,
      sale_group: null,
      deleted_at: null,
    },
    {
      id: IDS.stockItems.mustard,
      sku: 'STK-HRD-ML',
      auto_sku: false,
      name: 'Hardal',
      short_name: 'Hardal',
      location: locationScope,
      acc_cat: null,
      acc_code: null,
      cat_l1: IDS.stockCategories.root,
      cat_l2: IDS.stockCategories.sauces,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      unit: 'mililitre',
      packaging_units: [],
      min_stock: 0,
      max_stock: 1000,
      reorder: null,
      order_unit: 'ana',
      min_order: null,
      max_order: null,
      recipe_linked: true,
      daily_usage: null,
      auto_usage: false,
      supp_id: IDS.suppliers.sauces,
      purchase_price: 0.15,
      suppliers_list: [{ supp_id: IDS.suppliers.sauces, purchase_price: 0.15, is_default: true }],
      saleable: false,
      sale_name: null,
      sale_group: null,
      deleted_at: null,
    },
    {
      id: IDS.stockItems.mayo,
      sku: 'STK-MYN-ML',
      auto_sku: false,
      name: 'Mayonez',
      short_name: 'Mayonez',
      location: locationScope,
      acc_cat: null,
      acc_code: null,
      cat_l1: IDS.stockCategories.root,
      cat_l2: IDS.stockCategories.sauces,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      unit: 'mililitre',
      packaging_units: [],
      min_stock: 0,
      max_stock: 1000,
      reorder: null,
      order_unit: 'ana',
      min_order: null,
      max_order: null,
      recipe_linked: true,
      daily_usage: null,
      auto_usage: false,
      supp_id: IDS.suppliers.sauces,
      purchase_price: 0.18,
      suppliers_list: [{ supp_id: IDS.suppliers.sauces, purchase_price: 0.18, is_default: true }],
      saleable: false,
      sale_name: null,
      sale_group: null,
      deleted_at: null,
    },
  ]

  const semiItems = [
    {
      id: IDS.semiItems.burgerSauce,
      sku: 'SEM-HMB-SOS',
      auto_sku: false,
      name: 'Hamburger Sosu',
      short_name: 'Burger Sosu',
      location: locationScope,
      acc_cat: null,
      acc_code: null,
      sale_cat_l1: IDS.semiCategories.root,
      sale_cat_l2: IDS.semiCategories.sauces,
      sale_cat_l3: null,
      sale_cat_l4: null,
      sale_cat_l5: null,
      channel_prices: [],
      portions: [],
      option_groups: [],
      recipe_rows: [
        {
          id: '26f1844d-c4bb-4ff4-84a3-bff2f9fed9a0',
          ingredient_type: 'stock',
          ingredient_id: IDS.stockItems.ketchup,
          stock_item_id: IDS.stockItems.ketchup,
          semi_item_id: null,
          sku: 'STK-KTC-ML',
          unit: 'mililitre',
          qty: '500.0000',
          cost: '0.1200',
          waste_pct: '0',
          channels: [],
          portions: ['__standart__'],
        },
        {
          id: 'd4f36715-f744-43e3-aa81-abaa57c5da9b',
          ingredient_type: 'stock',
          ingredient_id: IDS.stockItems.mustard,
          stock_item_id: IDS.stockItems.mustard,
          semi_item_id: null,
          sku: 'STK-HRD-ML',
          unit: 'mililitre',
          qty: '150.0000',
          cost: '0.1500',
          waste_pct: '0',
          channels: [],
          portions: ['__standart__'],
        },
        {
          id: '33c9320e-7768-4b50-aa8a-426d0979c95c',
          ingredient_type: 'stock',
          ingredient_id: IDS.stockItems.mayo,
          stock_item_id: IDS.stockItems.mayo,
          semi_item_id: null,
          sku: 'STK-MYN-ML',
          unit: 'mililitre',
          qty: '350.0000',
          cost: '0.1800',
          waste_pct: '0',
          channels: [],
          portions: ['__standart__'],
        },
      ],
      recipe_output_qty: 1000,
      recipe_output_unit: 'mililitre',
      recipe_is_template: false,
      same_price: false,
      setting_active: true,
      sale_status: true,
      is_favorite: false,
      split_payment: false,
      print_note: false,
      hide_kitchen: false,
      substitute_id: null,
      pos_image: null,
      pos_color: '#1e293b',
      pos_text_color: '#ffffff',
      channel_image: null,
      channel_description: 'Hamburger ve benzeri urunler icin temel sos bazidir.',
      deleted_at: null,
    },
  ]

  const saleOptions = [
    {
      id: IDS.saleOptions.ketchup,
      name: 'Ketçap',
      description: null,
      short_name: 'Ketçap',
      sku: 'OPT-KTC',
      channel_prices: [],
      portions: [],
      same_price: false,
      recipe_rows: [],
      sale_status: true,
      deleted_at: null,
    },
    {
      id: IDS.saleOptions.mustard,
      name: 'Hardal',
      description: null,
      short_name: 'Hardal',
      sku: 'OPT-HRD',
      channel_prices: [],
      portions: [],
      same_price: false,
      recipe_rows: [],
      sale_status: true,
      deleted_at: null,
    },
  ]

  const optionGroups = [
    {
      id: IDS.optionGroups.sauceChoice,
      name: 'Sos Seçimi',
      category_id: IDS.saleCategories.burgers,
      options: buildGroupOptionsPayload([
        { option_id: IDS.saleOptions.ketchup, name: 'Ketçap', price: 0 },
        { option_id: IDS.saleOptions.mustard, name: 'Hardal', price: 0 },
      ], 1, 2),
      deleted_at: null,
      updated_at: now,
    },
  ]

  const saleItemPortions = [
    { id: IDS.portions.medium, name: 'Orta', price_offset: 35 },
    { id: IDS.portions.large, name: 'Büyük', price_offset: 70 },
  ]

  const saleItemRecipeRows = [
    {
      id: 'af631cca-e26a-422a-921e-a286198ee86d',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.bread,
      stock_item_id: IDS.stockItems.bread,
      semi_item_id: null,
      sku: 'STK-HMB-EKM',
      unit: 'adet',
      qty: '1.0000',
      cost: '6.5000',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: ['__standart__'],
    },
    {
      id: 'f07d2261-410d-4575-98b8-5da9a46d65dd',
      ingredient_type: 'semi',
      ingredient_id: IDS.semiItems.burgerSauce,
      stock_item_id: null,
      semi_item_id: IDS.semiItems.burgerSauce,
      sku: 'SEM-HMB-SOS',
      unit: 'mililitre',
      qty: '20.0000',
      cost: '0.1560',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: ['__standart__'],
    },
    {
      id: 'ad4bcd9c-71cc-40ad-bd4e-2c739d8911cf',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.cheddar,
      stock_item_id: IDS.stockItems.cheddar,
      semi_item_id: null,
      sku: 'STK-CHD-GRM',
      unit: 'gram',
      qty: '15.0000',
      cost: '0.8500',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: ['__standart__'],
    },
    {
      id: 'd86ac37e-6bdf-47bb-b220-b91e5f79b7f2',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.patty,
      stock_item_id: IDS.stockItems.patty,
      semi_item_id: null,
      sku: 'STK-HMB-KFT',
      unit: 'adet',
      qty: '1.0000',
      cost: '38.0000',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: ['__standart__'],
    },
    {
      id: '841f57bf-8c04-4c33-b098-db14f59531e7',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.bread,
      stock_item_id: IDS.stockItems.bread,
      semi_item_id: null,
      sku: 'STK-HMB-EKM',
      unit: 'adet',
      qty: '1.0000',
      cost: '6.5000',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.medium],
    },
    {
      id: '3a8d36c3-4f5e-4a9a-a2df-62a2ba3d77ca',
      ingredient_type: 'semi',
      ingredient_id: IDS.semiItems.burgerSauce,
      stock_item_id: null,
      semi_item_id: IDS.semiItems.burgerSauce,
      sku: 'SEM-HMB-SOS',
      unit: 'mililitre',
      qty: '25.0000',
      cost: '0.1560',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.medium],
    },
    {
      id: 'a3f3120a-7485-4432-b834-2c179334bac1',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.cheddar,
      stock_item_id: IDS.stockItems.cheddar,
      semi_item_id: null,
      sku: 'STK-CHD-GRM',
      unit: 'gram',
      qty: '20.0000',
      cost: '0.8500',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.medium],
    },
    {
      id: 'f561eb2c-0881-4949-b0e9-99fef3dab88e',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.patty,
      stock_item_id: IDS.stockItems.patty,
      semi_item_id: null,
      sku: 'STK-HMB-KFT',
      unit: 'adet',
      qty: '1.0000',
      cost: '38.0000',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.medium],
    },
    {
      id: '6dc882fe-acb7-4d1f-b1e4-1a0f116cc260',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.bread,
      stock_item_id: IDS.stockItems.bread,
      semi_item_id: null,
      sku: 'STK-HMB-EKM',
      unit: 'adet',
      qty: '1.0000',
      cost: '6.5000',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.large],
    },
    {
      id: '33f9f53f-3fcc-4d3f-b7c5-854866370654',
      ingredient_type: 'semi',
      ingredient_id: IDS.semiItems.burgerSauce,
      stock_item_id: null,
      semi_item_id: IDS.semiItems.burgerSauce,
      sku: 'SEM-HMB-SOS',
      unit: 'mililitre',
      qty: '35.0000',
      cost: '0.1560',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.large],
    },
    {
      id: '57741c17-eec4-4322-aecd-8cc92b3a2ccc',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.cheddar,
      stock_item_id: IDS.stockItems.cheddar,
      semi_item_id: null,
      sku: 'STK-CHD-GRM',
      unit: 'gram',
      qty: '30.0000',
      cost: '0.8500',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.large],
    },
    {
      id: '6bceddb9-c950-4504-ab5b-fa52f642b801',
      ingredient_type: 'stock',
      ingredient_id: IDS.stockItems.patty,
      stock_item_id: IDS.stockItems.patty,
      semi_item_id: null,
      sku: 'STK-HMB-KFT',
      unit: 'adet',
      qty: '2.0000',
      cost: '38.0000',
      waste_pct: '0',
      channels: salesChannels.map(channel => channel.id),
      portions: [IDS.portions.large],
    },
  ]

  const saleItems = [
    {
      id: IDS.saleItems.burger,
      sku: 'SAL-HMB-STD',
      auto_sku: false,
      name: 'Hamburger',
      short_name: 'Hamburger',
      description: 'Pilot katalog icin temel hamburger satis mali.',
      location: locationScope,
      cat_l1: null,
      cat_l2: null,
      cat_l3: null,
      cat_l4: null,
      cat_l5: null,
      acc_cat: null,
      acc_code: null,
      unit: null,
      sale_price: 245,
      cost_price: null,
      tax_id: vatTax.id,
      stock_item_id: null,
      recipe_linked: true,
      active: true,
      deleted_at: null,
      channel_prices: salesChannels.map(channel => ({
        channel_id: channel.id,
        active: true,
        price: 245,
        tax_id: vatTax.id,
      })),
      same_price: true,
      pos_image: null,
      pos_color: '#1e293b',
      pos_text_color: '#ffffff',
      channel_image: null,
      channel_description: 'Temel hamburger urunu.',
      setting_active: true,
      sale_status: true,
      is_favorite: false,
      split_payment: false,
      print_note: false,
      hide_kitchen: false,
      substitute_id: null,
      portions: saleItemPortions,
      option_groups: [
        {
          id: '6f618f8a-aaf7-4693-bf02-f49f1735db2d',
          group_def_id: IDS.optionGroups.sauceChoice,
          group_name: 'Sos Seçimi',
          required: true,
          min_select: 1,
          max_select: 2,
          options: [
            { option_id: IDS.saleOptions.ketchup, name: 'Ketçap', price: 0 },
            { option_id: IDS.saleOptions.mustard, name: 'Hardal', price: 0 },
          ],
        },
      ],
      sale_cat_l1: IDS.saleCategories.root,
      sale_cat_l2: IDS.saleCategories.burgers,
      sale_cat_l3: null,
      sale_cat_l4: null,
      sale_cat_l5: null,
      recipe_rows: saleItemRecipeRows,
      recipe_output_qty: 1,
      recipe_output_unit: 'adet',
      recipe_is_template: false,
      standard_price: 245,
      prep_time_minutes: 8,
    },
  ]

  const stockTemplates = [
    {
      id: IDS.templates.stockAll,
      name: 'Hamburger Hammaddeleri',
      description: 'Hamburger pilotu icin gerekli tum ana stok kartlari.',
      stock_ids: Object.values(IDS.stockItems),
      deleted_at: null,
    },
    {
      id: IDS.templates.stockSauces,
      name: 'Sos ve Yardımcı Ürünler',
      description: 'Hamburger sos recetesi ve secenekleri icin gerekli sos stoklari.',
      stock_ids: [IDS.stockItems.ketchup, IDS.stockItems.mustard, IDS.stockItems.mayo],
      deleted_at: null,
    },
  ]

  const saleTemplates = [
    {
      id: IDS.templates.saleBurgers,
      name: 'Hamburgerler',
      description: 'Pilot hamburger satis kartlari.',
      sale_ids: [IDS.saleItems.burger],
      deleted_at: null,
    },
  ]

  return {
    stockCategories,
    semiCategories,
    saleCategories,
    suppliers,
    stockItems,
    semiItems,
    saleOptions,
    optionGroups,
    saleItems,
    stockTemplates,
    saleTemplates,
  }
}

async function verifySeed(client, seed) {
  const checks = [
    ['categories', seed.stockCategories.map(row => row.id), 5],
    ['semi_categories', seed.semiCategories.map(row => row.id), 2],
    ['sale_categories', seed.saleCategories.map(row => row.id), 3],
    ['suppliers', seed.suppliers.map(row => row.id), 4],
    ['stock_items', seed.stockItems.map(row => row.id), 6],
    ['semi_items', seed.semiItems.map(row => row.id), 1],
    ['sale_options', seed.saleOptions.map(row => row.id), 2],
    ['option_groups', seed.optionGroups.map(row => row.id), 1],
    ['sale_items', seed.saleItems.map(row => row.id), 1],
    ['stock_templates', seed.stockTemplates.map(row => row.id), 2],
    ['sale_templates', seed.saleTemplates.map(row => row.id), 1],
  ]

  for (const [table, ids, expected] of checks) {
    const row = await selectSingle(
      client,
      `select count(*)::int as count from "${table}" where id = any($1::uuid[])`,
      [ids],
    )
    if ((row?.count || 0) !== expected) {
      throw new Error(`${table} seed dogrulamasi basarisiz. Beklenen=${expected}, bulunan=${row?.count || 0}`)
    }
  }

  const saleItem = await selectSingle(
    client,
    'select name, channel_prices, portions, option_groups, recipe_rows from sale_items where id = $1',
    [IDS.saleItems.burger],
  )
  if (!saleItem) {
    throw new Error('Hamburger satis mali readback basarisiz.')
  }

  const activeChannelPrices = Array.isArray(saleItem.channel_prices)
    ? saleItem.channel_prices.filter(item => item?.active)
    : []
  if (activeChannelPrices.length === 0 || !activeChannelPrices.every(item => Number(item.price) === 245)) {
    throw new Error('Hamburger kanal fiyatlari 245.00 olarak dogrulanamadi.')
  }

  const portionOffsets = new Map((saleItem.portions || []).map(item => [item.name, Number(item.price_offset)]))
  if (portionOffsets.get('Orta') !== 35 || portionOffsets.get('Büyük') !== 70) {
    throw new Error('Hamburger porsiyon offsetleri beklenen degerlerle uyusmuyor.')
  }

  const recipeRows = Array.isArray(saleItem.recipe_rows) ? saleItem.recipe_rows : []
  const hasSemiRow = recipeRows.some(row => row?.ingredient_type === 'semi' && row?.semi_item_id === IDS.semiItems.burgerSauce)
  const hasStockRow = recipeRows.some(row => row?.ingredient_type === 'stock' && row?.stock_item_id === IDS.stockItems.patty)
  if (!hasSemiRow || !hasStockRow) {
    throw new Error('Hamburger recetesi stock + semi karmasini icermiyor.')
  }

  const semiItem = await selectSingle(
    client,
    'select name, recipe_rows from semi_items where id = $1',
    [IDS.semiItems.burgerSauce],
  )
  const semiRecipeRows = Array.isArray(semiItem?.recipe_rows) ? semiItem.recipe_rows : []
  if (!semiRecipeRows.length || semiRecipeRows.some(row => row?.ingredient_type !== 'stock')) {
    throw new Error('Hamburger Sosu yalniz stok girdileriyle dogrulanamadi.')
  }
}

async function verifySchema(client) {
  const expectedTables = ['categories', 'suppliers', 'stock_items']
  const rows = await selectRows(
    client,
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
    [expectedTables],
  )
  const names = new Set(rows.map(row => row.table_name))
  for (const table of expectedTables) {
    if (!names.has(table)) {
      throw new Error(`Beklenen tablo olusmadi: ${table}`)
    }
  }
}

async function seedPilot(client) {
  const taxes = await selectRows(
    client,
    'select id, name, rate from taxes where deleted_at is null order by rate asc, name asc',
  )
  const salesChannels = await selectRows(
    client,
    'select id, name, sort_order from sales_channels where deleted_at is null and active is true order by sort_order asc, name asc',
  )
  const branchTemplate = await selectSingle(
    client,
    'select id, name, branch_ids from branch_templates where deleted_at is null and name = $1 limit 1',
    ['Tüm Şubeler'],
  )
  const companyTree = await selectSingle(
    client,
    "select value from settings where key = 'company_tree' limit 1",
  )

  const vatTax = taxes.find(row => row.name === 'KDV Gıda') || null
  if (!vatTax) {
    throw new Error('KDV Gıda vergisi bulunamadi.')
  }
  if (!salesChannels.length) {
    throw new Error('Aktif sales_channels kaydi bulunamadi.')
  }
  if (!branchTemplate) {
    throw new Error('Tüm Şubeler branch template kaydi bulunamadi.')
  }
  if (!Array.isArray(branchTemplate.branch_ids) || branchTemplate.branch_ids.length === 0) {
    throw new Error('Tüm Şubeler branch template icinde branch_ids bos.')
  }
  if (!Array.isArray(companyTree?.value) || companyTree.value.length === 0) {
    throw new Error('settings.company_tree bos. Katalog seed durduruldu.')
  }

  const seed = buildSeedData({ branchTemplate, salesChannels, vatTax })

  await upsertRows(client, 'categories', seed.stockCategories)
  await upsertRows(client, 'semi_categories', seed.semiCategories)
  await upsertRows(client, 'sale_categories', seed.saleCategories)
  await upsertRows(client, 'suppliers', seed.suppliers)
  await upsertRows(client, 'stock_items', seed.stockItems)
  await upsertRows(client, 'semi_items', seed.semiItems)
  await upsertRows(client, 'sale_options', seed.saleOptions)
  await upsertRows(client, 'option_groups', seed.optionGroups)
  await upsertRows(client, 'sale_items', seed.saleItems)
  await upsertRows(client, 'stock_templates', seed.stockTemplates)
  await upsertRows(client, 'sale_templates', seed.saleTemplates)

  await verifySeed(client, seed)

  return {
    categories: seed.stockCategories.length,
    semi_categories: seed.semiCategories.length,
    sale_categories: seed.saleCategories.length,
    suppliers: seed.suppliers.length,
    stock_items: seed.stockItems.length,
    semi_items: seed.semiItems.length,
    sale_options: seed.saleOptions.length,
    option_groups: seed.optionGroups.length,
    sale_items: seed.saleItems.length,
    stock_templates: seed.stockTemplates.length,
    sale_templates: seed.saleTemplates.length,
  }
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  try {
    if (!seedOnly) {
      logStep(`Schema uygulaniyor: ${schemaPath}`)
      await applySchema(client)
      await verifySchema(client)
    }

    if (!schemaOnly) {
      logStep('Seed transaction basliyor')
      await client.query('begin')
      try {
        const summary = await seedPilot(client)
        await client.query('commit')
        console.log(JSON.stringify(summary, null, 2))
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

main().catch(error => {
  console.error(`[hamburger-pilot-bootstrap] ${error.message}`)
  process.exit(1)
})
