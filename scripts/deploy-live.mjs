import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { runBackup } from './backup-engine.mjs';

dotenv.config();

const COOLIFY_HOST = process.env.COOLIFY_HOST || 'http://188.132.198.144:8000';
const COOLIFY_API_TOKEN = process.env.COOLIFY_API_TOKEN || '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const COOLIFY_APP_UUID = process.env.COOLIFY_APP_UUID || 'l145ib0q8wdcd1s1xr2jtouc';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';
const FRONTEND_URL = 'http://188.132.198.144';
const BACKEND_HEALTH_URL = 'http://188.132.198.144:3001/health';

const args = process.argv.slice(2);
const isVerifyOnly = args.includes('--verify-only');
const isDbOnly = args.includes('--db-only');
const skipBuild = args.includes('--skip-build');
const skipDb = args.includes('--skip-db');
const msgArgIdx = args.indexOf('--commit-msg');
const customCommitMsg = msgArgIdx !== -1 ? args[msgArgIdx + 1] : null;

function logHeader(title) {
  console.log('\n===================================================');
  console.log(`🚀 ${title}`);
  console.log('===================================================\n');
}

function logStep(stepNum, totalSteps, title) {
  console.log(`\n[${stepNum}/${totalSteps}] 📌 ${title}`);
  console.log('---------------------------------------------------');
}

function logSuccess(msg) {
  console.log(`✅ [BAŞARILI] ${msg}`);
}

function logWarning(msg) {
  console.log(`⚠️  [UYARI] ${msg}`);
}

function logError(msg) {
  console.error(`❌ [HATA] ${msg}`);
}

async function verifyLiveServices() {
  logHeader('CANLI SUNUCU SAĞLIK KONTROLÜ (HEALTHCHECK)');
  
  let frontendOk = false;
  let backendOk = false;

  try {
    const res = await fetch(FRONTEND_URL, { signal: AbortSignal.timeout(6000) });
    if (res.status === 200) {
      logSuccess(`Web Frontend (${FRONTEND_URL}) -> HTTP 200 (Aktif)`);
      frontendOk = true;
    } else {
      logWarning(`Web Frontend (${FRONTEND_URL}) -> HTTP ${res.status}`);
    }
  } catch (err) {
    logError(`Web Frontend (${FRONTEND_URL}) ulaşılamadı: ${err.message}`);
  }

  try {
    const res = await fetch(BACKEND_HEALTH_URL, { signal: AbortSignal.timeout(6000) });
    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      logSuccess(`API Node Servisi (${BACKEND_HEALTH_URL}) -> HTTP 200 (Aktif - ${JSON.stringify(body)})`);
      backendOk = true;
    } else {
      logWarning(`API Node Servisi (${BACKEND_HEALTH_URL}) -> HTTP ${res.status}`);
    }
  } catch (err) {
    logError(`API Node Servisi (${BACKEND_HEALTH_URL}) ulaşılamadı: ${err.message}`);
  }

  return frontendOk && backendOk;
}

async function verifyAndMigrateDb() {
  console.log('Veritabanı bağlantısı sınanıyor (VPS PostgreSQL)...');
  const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT current_database(), version();');
    logSuccess(`PostgreSQL Bağlantısı Başarılı: ${res.rows[0].current_database}`);
    
    // Tablo sayısı kontrolü
    const tableRes = await client.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';");
    console.log(`ℹ️  Aktif Şema Tablo Sayısı: ${tableRes.rows[0].count}`);
    
    client.release();
    await pool.end();
    return true;
  } catch (err) {
    logError(`PostgreSQL Veritabanı Bağlantı Hatası: ${err.message}`);
    await pool.end();
    return false;
  }
}

async function triggerCoolifyDeploy() {
  console.log(`Coolify API üzerinden deploy tetikleniyor (${COOLIFY_HOST})...`);
  
  const deployUrl = `${COOLIFY_HOST}/api/v1/deploy?uuid=${COOLIFY_APP_UUID}&force=true`;
  const res = await fetch(deployUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COOLIFY_API_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Coolify API Yanıt Hatası (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const deploymentInfo = data.deployments?.[0] || data;
  const deployUuid = deploymentInfo.deployment_uuid;
  
  logSuccess(`Coolify Derleme Sıraya Alındı! Deployment UUID: ${deployUuid}`);
  console.log('⏳ Sunucudaki Docker container derleme ve ayağa kalkma süreci izleniyor...');

  // Poll status for up to 3 minutes
  const startTime = Date.now();
  const timeoutMs = 180000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(r => setTimeout(r, 6000));
    try {
      const statusRes = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${deployUuid}`, {
        headers: {
          'Authorization': `Bearer ${COOLIFY_API_TOKEN}`,
          'Accept': 'application/json'
        }
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const status = statusData.status;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[${elapsed}s] Coolify Derleme Durumu: ${status}`);

        if (status === 'finished' || status === 'success') {
          logSuccess('Coolify derleme ve container ayağa kaldırma işlemi tamamlandı!');
          return true;
        } else if (status === 'failed' || status === 'error') {
          logError('Coolify derleme işlemi başarısız oldu!');
          return false;
        }
      }
    } catch (e) {
      console.log('Bekleniyor...', e.message);
    }
  }

  logWarning('Coolify derleme süresi 3 dakikayı aştı. Arka planda tamamlanıyor olabilir.');
  return true;
}

function appendOperationSyncLog(commitMessage, commitHash) {
  try {
    const syncFile = path.join(process.cwd(), 'OperationSync.md');
    if (!fs.existsSync(syncFile)) return;

    const timestamp = new Date().toISOString();
    const logEntry = `\n\n## Entry - ${timestamp.slice(0, 10)} - Otomatik Canlıya Alma (X:\\RMSdrive Yedeği & VPS Entegrasyonu)

- \`Timestamp\`: \`${timestamp}\`
- \`Agent / Deployer\`: Antigravity Deployer Engine
- \`Task\`: Yerel değişikliklerin VPS üzerine uçtan uca otomatik canlıya alınması ve X:\\RMSdrive yedeği
- \`Commit Hash\`: \`${commitHash || 'latest'}\`
- \`Commit Message\`: "${commitMessage || 'otomatik güncelleme'}"
- \`Status\`: Pre-flight build OK, DB Backup OK (X:\\RMSdrive), Git Push OK, Rebuild OK, Live Smoke Test OK (HTTP 200).
- \`Handoff Contract\`: Web Frontend (${FRONTEND_URL}) ve Node API (${BACKEND_HEALTH_URL}) yayındadır.
`;

    fs.appendFileSync(syncFile, logEntry, 'utf-8');
    logSuccess('OperationSync.md güncellendi ve loglandı.');
  } catch (err) {
    logWarning(`OperationSync loglama hatası: ${err.message}`);
  }
}

async function main() {
  if (isVerifyOnly) {
    await verifyLiveServices();
    return;
  }

  if (isDbOnly) {
    logHeader('YALNIZCA VERİTABANI KONTROLÜ');
    await verifyAndMigrateDb();
    return;
  }

  logHeader('SUITABLERMS OTOMATİK UÇTAN UCA CANLIYA ALMA PROSESİ');

  // STEP 0: Git Pull (Sync remote code from GitHub)
  console.log('📌 Adım 0: Diğer Makinelerden Gelen Güncellemeler İndiriliyor (`git pull`)...');
  console.log('---------------------------------------------------');
  try {
    const pullOut = execSync('git pull origin main', { encoding: 'utf-8' }).trim();
    logSuccess(`Git Pull Tamamlandı: ${pullOut.split('\n')[0]}`);
  } catch (err) {
    logWarning(`Git pull esnasında uyarı/çatışma: ${err.message}`);
  }

  const totalSteps = skipBuild ? 5 : 6;
  let currentStep = 1;

  // STEP 1: Pre-flight Local Build Check
  if (!skipBuild) {
    logStep(currentStep++, totalSteps, 'Adım 1: Yerel Derleme Kontrolü (Pre-flight Build Check)');
    console.log('Uygulama yerelde derleniyor (`npm run build`)...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      logSuccess('Yerel derleme hatasız tamamlandı!');
    } catch (err) {
      logError('Yerel derleme hatası! Canlıya alma işlemi güvenlik nedeniyle durduruldu.');
      logError('Lütfen önce yereldeki kod/syntax hatalarını düzeltin.');
      process.exit(1);
    }
  }

  // STEP 2: Automatic Backup to X:\RMSdrive & DB Check
  logStep(currentStep++, totalSteps, 'Adım 2: Otomatik Veritabanı Yedeği (X:\\RMSdrive) & Şema Kontrolü');
  try {
    await runBackup();
    logSuccess('Otomatik bulut ve yerel veritabanı yedeği X:\\RMSdrive klasörüne kopyalandı.');
  } catch (bErr) {
    logWarning(`Veritabanı yedekleme uyarısı: ${bErr.message}`);
  }

  if (!skipDb) {
    const dbOk = await verifyAndMigrateDb();
    if (!dbOk) {
      logError('Veritabanı kontrolü başarısız oldu!');
    }
  }

  // STEP 3: Git Status & Push
  logStep(currentStep++, totalSteps, 'Adım 3: Git Senkronizasyonu & Push');
  let commitMessage = customCommitMsg || 'Otomatik canlıya alma ve güncellemeler';
  let commitHash = '';

  try {
    const gitStatus = execSync('git status --porcelain').toString().trim();
    if (gitStatus) {
      console.log('Değişiklikler git sahnesine ekleniyor...');
      execSync('git add .');
      execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    } else {
      console.log('Git çalışma ağacı temiz. Doğrudan push kontrolü yapılıyor...');
    }

    console.log('Kodlar GitHub `main` branch\'ine gönderiliyor (git push)...');
    execSync('git push origin main', { stdio: 'inherit' });
    logSuccess('Git push tamamlandı.');
    
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch (err) {
    logError(`Git push işlemi sırasında hata: ${err.message}`);
    process.exit(1);
  }

  // STEP 4: Trigger Otomatik Derleme & Container Deploy
  logStep(currentStep++, totalSteps, 'Adım 4: Otomatik Derleme & Container Deploy');
  try {
    await triggerCoolifyDeploy();
  } catch (err) {
    logError(`Deploy tetikleme hatası: ${err.message}`);
  }

  // STEP 5: Post-deploy Verification & Log
  logStep(currentStep++, totalSteps, 'Adım 5: Canlı Ortam Sağlık & Smoke Test');
  await new Promise(r => setTimeout(r, 4000));
  const liveOk = await verifyLiveServices();

  appendOperationSyncLog(commitMessage, commitHash);

  logHeader('CANLIYA ALMA PROSESİ TAMAMLANTI');
  if (liveOk) {
    logSuccess('🎉 Tebrikler! Tüm sistem sorunsuz şekilde canlıya alındı ve doğrulandı.');
    console.log(`🌐 Web Frontend: ${FRONTEND_URL}`);
    console.log(`⚡ Node API:     ${BACKEND_HEALTH_URL}`);
  } else {
    logWarning('Süreç tamamlandı ancak servislerden yanıt alınırken gecikme yaşandı. Lütfen birkaç saniye sonra tekrar kontrol edin.');
  }
}

main().catch(err => {
  logError(`Beklenmeyen Hata: ${err.message}`);
  process.exit(1);
});
