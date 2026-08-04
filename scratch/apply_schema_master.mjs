import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

async function applyMasterSchema() {
  const dbUrl = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';
  console.log(`Connecting to VPS DB: ${dbUrl}`);
  
  const client = new Client({
    connectionString: dbUrl,
    ssl: false,
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    const sqlPath = path.join(__dirname, '..', 'schema-railway-master.sql');
    console.log(`Reading SQL file from: ${sqlPath}`);
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing schema-railway-master.sql...');
    const startTime = Date.now();
    
    // Execute the full SQL file
    await client.query(sqlContent);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Master schema executed successfully in ${duration}s!`);

  } catch (err) {
    console.error('❌ Error executing master schema:', err);
  } finally {
    await client.end();
  }
}

applyMasterSchema();
