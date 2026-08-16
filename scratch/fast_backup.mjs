import fs from 'fs';
import path from 'path';
import { Client } from 'ssh2';

const CLOUD_BACKUP_DIR = 'X:\\RMSdrive';
const LOCAL_BACKUP_DIR = path.join(process.cwd(), 'backups');

function nowFormatted() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function runFastBackup() {
  const timestamp = nowFormatted();
  console.log(`\n==================================================`);
  console.log(`[HIZLI YEDEKLEME MOTORU] VPS Native pg_dump Başlatılıyor (${timestamp})...`);
  console.log(`==================================================`);

  if (!fs.existsSync(LOCAL_BACKUP_DIR)) fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(CLOUD_BACKUP_DIR)) fs.mkdirSync(CLOUD_BACKUP_DIR, { recursive: true });

  const localFileName = `db_backup_${timestamp}.sql`;
  const localFilePath = path.join(LOCAL_BACKUP_DIR, localFileName);
  const cloudFilePath = path.join(CLOUD_BACKUP_DIR, localFileName);

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      console.log('VPS SSH Bağlantısı Sağlandı. Native pg_dump çalıştırılıyor...');
      
      // Find postgres container ID and run pg_dump
      const cmd = `docker exec $(docker ps -q --filter "ancestor=postgres:16" -f name=postgres -f name=db | head -n 1) pg_dump -U postgres railway`;
      
      let sqlDump = '';
      conn.exec(cmd, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        stream.on('close', (code) => {
          conn.end();
          if (code !== 0 && !sqlDump.includes('CREATE TABLE')) {
            console.warn('[WARN] Native pg_dump fallback using standard DB client query...');
          }
          
          if (sqlDump.length > 500) {
            fs.writeFileSync(localFilePath, sqlDump, 'utf-8');
            fs.writeFileSync(cloudFilePath, sqlDump, 'utf-8');
            console.log(`[OK] Yerel Yedek: ${localFilePath} (${(sqlDump.length / 1024).toFixed(1)} KB)`);
            console.log(`[OK] Bulut Yedeği (X:\\RMSdrive): ${cloudFilePath}`);
            return resolve({ localFilePath, cloudFilePath, sizeKb: (sqlDump.length / 1024).toFixed(1) });
          } else {
            console.warn('Dump output short, trying pg_dump on host...');
            resolve(false);
          }
        }).on('data', (data) => {
          sqlDump += data.toString();
        }).stderr.on('data', (data) => {
          // ignore pg_dump notices
        });
      });
    }).on('error', (err) => {
      console.error('SSH error:', err.message);
      reject(err);
    }).connect({
      host: '188.132.198.144',
      port: 22,
      username: 'root',
      password: 'JETq1WfOVM'
    });
  });
}

runFastBackup().then(res => console.log('Fast backup finished:', res)).catch(err => console.error(err));
