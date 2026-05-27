const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  try {
    await client.connect();
    
    // test different strings to see which gives "time zone "zt00:00:00+03:00" not recognized"
    const tests = [
      '2026-05-27zt00:00:00+03:00',
      '2026-05-27 zt00:00:00+03:00',
      'zt00:00:00+03:00',
    ];
    
    for (const str of tests) {
      try {
        await client.query(`SELECT $1::timestamptz`, [str]);
        console.log(`OK: ${str}`);
      } catch (e) {
        console.log(`ERROR for ${str}: ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

run();
