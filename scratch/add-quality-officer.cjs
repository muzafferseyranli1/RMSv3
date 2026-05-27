const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Read env for DATABASE_URL
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

async function run() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rlwy.net') ? { rejectUnauthorized: false } : false
  });
  await client.connect();

  try {
    console.log('Fetching personnel positions...');
    const posRes = await client.query("SELECT value FROM settings WHERE key = 'personnel_positions'");
    let positions = [];
    if (posRes.rows.length > 0 && Array.isArray(posRes.rows[0].value)) {
      positions = posRes.rows[0].value;
    }

    // Check if KLT position exists
    let kltPos = positions.find(p => p.shortCode === 'KLT' || p.id === 'pos_klt');
    if (!kltPos) {
      kltPos = {
        id: 'pos_klt',
        name: 'Kalite Sorumlusu',
        shortCode: 'KLT',
        parentId: '',
        lateToleranceMinutes: 15,
        contractTerms: {
          fixed_salary: { enabled: true, amount: 45000 },
          hourly: { enabled: false, amount: '' },
          part_time: { enabled: false, amount: '' }
        },
        notes: 'Sistem Kalite ve Standart dışı ürün bildirimleri sorumlusu',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };
      positions.push(kltPos);
      await client.query("INSERT INTO settings (key, value) VALUES ('personnel_positions', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(positions)]);
      console.log('Position "Kalite Sorumlusu" (KLT) added successfully.');
    } else {
      console.log('Position "Kalite Sorumlusu" already exists.');
    }

    console.log('Fetching personnel records...');
    const empRes = await client.query("SELECT value FROM settings WHERE key = 'personnel_records'");
    let employees = [];
    if (empRes.rows.length > 0 && Array.isArray(empRes.rows[0].value)) {
      employees = empRes.rows[0].value;
    }

    // Check if Kemal Kaliteci exists
    let kltEmp = employees.find(e => e.id === 'emp_kalite_sorumlusu' || e.username === 'kalite.sorumlusu');
    if (!kltEmp) {
      kltEmp = {
        id: 'emp_kalite_sorumlusu',
        firstName: 'Kemal',
        middleName: '',
        lastName: 'Kaliteci',
        registryNumber: 'PRS-KLT01',
        sgkNumber: 'SGK9999999999',
        gender: 'Erkek',
        birthDate: '1985-01-01',
        address: 'Genel Merkez Kalite Departmanı',
        phone: '',
        mobilePhone: '5551234567',
        telegramUsername: '',
        email: 'kemal.kalite@suitablerms.local',
        authorityLevel: 'Genel Merkez',
        positionId: 'pos_klt',
        contractType: 'fixed_salary',
        defaultBranchId: '',
        workingBranchIds: [],
        managedBranchIds: [],
        hireDate: '2026-05-27',
        terminationDate: '',
        username: 'kalite.sorumlusu',
        password: '', // Or password hash if needed
        pin: '9999',
        photo: '',
        salary: 45000,
        bankName: 'Garanti BBVA',
        iban: 'TR990006200000000099999999',
        notes: 'Sistem Kalite Sorumlusu',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };
      employees.push(kltEmp);
      await client.query("INSERT INTO settings (key, value) VALUES ('personnel_records', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(employees)]);
      console.log('Employee "Kemal Kaliteci" added successfully.');
    } else {
      console.log('Employee "Kemal Kaliteci" already exists.');
    }

  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    await client.end();
  }
}

run();
