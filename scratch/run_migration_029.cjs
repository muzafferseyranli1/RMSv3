const { Pool } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('migrations/029_survey_qr_tokens.sql', 'utf8');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway', 
  ssl: { rejectUnauthorized: false } 
});
pool.query(sql)
  .then(() => { console.log('Migration 029 OK - survey_tokens tablosu oluşturuldu'); pool.end(); })
  .catch(e => { console.error('Migration ERROR:', e.message); pool.end(); process.exit(1); });
