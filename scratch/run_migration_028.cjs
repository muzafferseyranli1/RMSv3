const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway'

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  await client.connect()
  console.log('✅ Railway DB bağlantısı kuruldu.')

  const sql = fs.readFileSync(
    path.join(__dirname, '../migrations/028_equipment_management_phase1.sql'),
    'utf8'
  )

  try {
    await client.query(sql)
    console.log('✅ Migration 028 başarıyla uygulandı.')
  } catch (err) {
    console.error('❌ Migration hatası:', err.message)
    process.exit(1)
  }

  // Doğrulama sorguları
  const checks = [
    { label: 'equipment_definitions sütunlar',    q: "SELECT column_name FROM information_schema.columns WHERE table_name='equipment_definitions' ORDER BY ordinal_position" },
    { label: 'equipment_instances tablosu',         q: "SELECT column_name FROM information_schema.columns WHERE table_name='equipment_instances' ORDER BY ordinal_position" },
    { label: 'equipment_transfers tablosu',         q: "SELECT column_name FROM information_schema.columns WHERE table_name='equipment_transfers' ORDER BY ordinal_position" },
    { label: 'maintenance_tickets yeni sütunlar',  q: "SELECT column_name FROM information_schema.columns WHERE table_name='maintenance_tickets' AND column_name IN ('equipment_instance_id','reported_by_pin','issue_description','resolved_at')" },
    { label: 'Arıza Formu şablonu',                q: "SELECT id, title, requires_cost_input, linked_entity_table FROM form_templates WHERE linked_entity_table='maintenance_tickets' AND deleted_at IS NULL" },
  ]

  for (const check of checks) {
    const res = await client.query(check.q)
    console.log(`\n📋 ${check.label}:`)
    res.rows.forEach(r => console.log('  -', Object.values(r).join(' | ')))
  }

  await client.end()
  console.log('\n✅ Tüm kontroller tamamlandı.')
}

run().catch(err => { console.error(err); process.exit(1) })
