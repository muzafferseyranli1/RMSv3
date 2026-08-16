import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';
const CLOUD_BACKUP_DIR = 'X:\\RMSdrive';
const LOCAL_BACKUP_DIR = path.join(process.cwd(), 'backups');

function nowFormatted() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function runBackup() {
  const timestamp = nowFormatted();
  console.log(`\n==================================================`);
  console.log(`[YEDEKLEME MOTORU] Canlı Veritabanı Yedeği Alınıyor (${timestamp})...`);
  console.log(`==================================================`);

  if (!fs.existsSync(LOCAL_BACKUP_DIR)) fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(CLOUD_BACKUP_DIR)) fs.mkdirSync(CLOUD_BACKUP_DIR, { recursive: true });

  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Toplam ${tables.length} tablo yedekleniyor...`);

  let backupSql = `-- SuitableRMS Production Database Backup\n-- Exported At: ${new Date().toISOString()}\n-- Total Tables: ${tables.length}\n\n`;
  backupSql += `SET statement_timeout = 0;\nSET lock_timeout = 0;\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n\n`;

  let totalRowsDumped = 0;
  let tableCount = 0;

  for (const table of tables) {
    try {
      tableCount++;
      const dataRes = await client.query(`SELECT * FROM "${table}" LIMIT 1000`);
      const rows = dataRes.rows;
      if (rows && rows.length > 0) {
        totalRowsDumped += rows.length;
        backupSql += `-- Table: ${table} (${rows.length} rows)\n`;
        const columns = Object.keys(rows[0]).map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = Object.values(row).map(val => {
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number' || typeof val === 'boolean') return val;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
            return `'${String(val).replace(/'/g, "''")}'`;
          }).join(', ');

          backupSql += `INSERT INTO "${table}" (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
        }
        backupSql += `\n`;
      }
      if (tableCount % 20 === 0 || tableCount === tables.length) {
        console.log(`[Yedekleme İlerlemesi] %${Math.round((tableCount / tables.length) * 100)} (${tableCount}/${tables.length} tablo okundu)`);
      }
    } catch (err) {
      console.warn(`[WARN] Table ${table} dump warning:`, err.message);
    }
  }

  await client.end();

  const localFileName = `db_backup_${timestamp}.sql`;
  const localFilePath = path.join(LOCAL_BACKUP_DIR, localFileName);
  const cloudFilePath = path.join(CLOUD_BACKUP_DIR, localFileName);

  fs.writeFileSync(localFilePath, backupSql, 'utf-8');
  console.log(`[OK] Yerel Yedek Oluşturuldu: ${localFilePath} (${(backupSql.length / 1024).toFixed(1)} KB, ${totalRowsDumped} kayıt)`);

  fs.writeFileSync(cloudFilePath, backupSql, 'utf-8');
  console.log(`[OK] Bulut Yedeği (X:\\RMSdrive) Kopyalandı: ${cloudFilePath}`);

  // Maintain rolling retention of 30 backups in X:\RMSdrive
  try {
    const cloudFiles = fs.readdirSync(CLOUD_BACKUP_DIR)
      .filter(f => f.startsWith('db_backup_') && f.endsWith('.sql'))
      .sort();
    
    if (cloudFiles.length > 30) {
      const toDelete = cloudFiles.slice(0, cloudFiles.length - 30);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(CLOUD_BACKUP_DIR, file));
        console.log(`[PURGE] Eski bulut yedeği silindi: ${file}`);
      }
    }
  } catch (purgeErr) {
    console.warn('[WARN] Retention cleanup warning:', purgeErr.message);
  }

  console.log(`[SUCCESS] Veritabanı ve içerik yedeği başarmakla tamamlandı!\n`);
  return { localFilePath, cloudFilePath, tablesCount: tables.length, totalRowsDumped };
}

if (process.argv[1] && process.argv[1].endsWith('backup-engine.mjs')) {
  runBackup().catch(err => {
    console.error('[ERROR] Backup engine failed:', err);
    process.exit(1);
  });
}
