const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

const DEFAULT_BRANDS = [
  {
    name: 'Burger Lab (Virtual)',
    code: 'BL-VIRTUAL',
    description: 'Gurme el yapımı smash burger & çıtır patates markası',
    kitchen_station: 'Mutfak (KDS) - SUT-QMSUN2',
    platforms: JSON.stringify(['Yemeksepeti', 'Getir', 'Trendyol Yemek']),
    active: true,
    min_order_amount: 180,
    avg_prep_time_mins: 12,
  },
  {
    name: 'Taco & Burrito Co.',
    code: 'TB-VIRTUAL',
    description: 'Meksika lezzetleri, bol malzemeli burrito ve quesadilla',
    kitchen_station: 'Mutfak (KDS) - SUT-QMSUN2',
    platforms: JSON.stringify(['Yemeksepeti', 'Trendyol Yemek', 'Migros Yemek']),
    active: true,
    min_order_amount: 220,
    avg_prep_time_mins: 15,
  },
  {
    name: 'Bowl & Green Lab',
    code: 'BG-VIRTUAL',
    description: 'Taze salata, kinoa bowllar ve sağlıklı beslenme markası',
    kitchen_station: 'Mutfak (KDS) - SUT-QMSUN2',
    platforms: JSON.stringify(['Getir', 'Trendyol Yemek']),
    active: true,
    min_order_amount: 200,
    avg_prep_time_mins: 10,
  },
];

async function main() {
  const pool = new Pool({ connectionString, ssl: false });
  try {
    console.log('Seeding cloud_kitchen_brands...');
    for (const b of DEFAULT_BRANDS) {
      await pool.query(
        `INSERT INTO cloud_kitchen_brands (name, code, description, kitchen_station, platforms, active, min_order_amount, avg_prep_time_mins)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [b.name, b.code, b.description, b.kitchen_station, b.platforms, b.active, b.min_order_amount, b.avg_prep_time_mins]
      );
    }
    console.log('Successfully seeded default virtual brands!');
  } catch (err) {
    console.error('Err:', err);
  } finally {
    await pool.end();
  }
}
main();
