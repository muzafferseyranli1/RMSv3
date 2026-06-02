const pg = require('pg');
const fs = require('fs');
const path = require('path');

const API_UPLOAD_URL = 'https://rms-api-production-219d.up.railway.app/api/upload';

async function run() {
  const envContent = fs.readFileSync(path.resolve(__dirname, '..', 'server', '.env'), 'utf8');
  let dbUrl;
  for (const line of envContent.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const sep = l.indexOf('=');
    if (sep === -1) continue;
    if (l.slice(0, sep).trim() === 'DATABASE_URL') {
      let v = l.slice(sep + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      dbUrl = v;
      break;
    }
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rlwy.net') ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  const keysToClean = ['kiosk_settings_v2', 'garson_open_table_tickets_v2'];
  
  for (const key of keysToClean) {
    console.log(`\nProcessing key: ${key}...`);
    const { rows } = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length === 0) {
      console.log(`Key ${key} not found.`);
      continue;
    }
    
    let valueObj = rows[0].value;
    let uploadCount = 0;
    
    async function walkAndReplace(obj) {
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'string') {
        if (obj.startsWith('data:image') && obj.includes('base64,')) {
          try {
            const matches = obj.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
            if (matches) {
              const mimeType = matches[1];
              const base64Data = matches[2];
              const buffer = Buffer.from(base64Data, 'base64');
              
              let ext = '.png';
              if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
              else if (mimeType.includes('webp')) ext = '.webp';
              
              const filename = `extracted_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
              
              // Build FormData
              const formData = new FormData();
              const blob = new Blob([buffer], { type: mimeType });
              formData.append('file', blob, filename);
              
              // Upload to API
              const res = await fetch(API_UPLOAD_URL, {
                method: 'POST',
                body: formData,
              });
              
              if (!res.ok) {
                console.error(`Failed to upload image for ${key}: ${res.statusText}`);
                return obj;
              }
              
              const jsonResult = await res.json();
              if (jsonResult && jsonResult.data && jsonResult.data.file_url) {
                console.log(`Successfully uploaded: ${filename} -> ${jsonResult.data.file_url}`);
                uploadCount++;
                return jsonResult.data.file_url;
              }
            }
          } catch (err) {
            console.error(`Error processing base64 image:`, err);
          }
        }
        return obj;
      }
      
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          obj[i] = await walkAndReplace(obj[i]);
        }
        return obj;
      }
      
      if (typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          obj[k] = await walkAndReplace(obj[k]);
        }
        return obj;
      }
      
      return obj;
    }
    
    valueObj = await walkAndReplace(valueObj);
    
    if (uploadCount > 0) {
      await client.query('UPDATE settings SET value = $1 WHERE key = $2', [JSON.stringify(valueObj), key]);
      console.log(`Updated database for ${key}. Extracted and replaced ${uploadCount} base64 images.`);
    } else {
      console.log(`No base64 images needed extraction for ${key}.`);
    }
  }

  // Final size report
  const { rows: newSizes } = await client.query('SELECT key, octet_length(value::text) as size_bytes FROM settings WHERE key = ANY($1)', [keysToClean]);
  console.log('\n=== UPDATED SETTINGS TABLE SIZE ===');
  for (const row of newSizes) {
    console.log(`Key: ${row.key.padEnd(35)} Size: ${(row.size_bytes / 1024).toFixed(2).padStart(8)} KB`);
  }

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
