
const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '');

const argv = new Set(process.argv.slice(2));
const dryRun = argv.has('--dry-run');
const verifyOnly = argv.has('--verify-only');

const DEMO_TIMESTAMP = '2026-05-23T00:00:00.000Z';

const REFERRAL_PROGRAMS = [
  {
    id: 'demo-prog-arkadasini-getir',
    name: 'Arkadaşını Getir Programı',
    mode: 'unique_multiple',
    allowed_referrer_categories: [],
    success_criteria: 'registration',
    success_purchase_count: 1,
    active: true,
    config_json: { max_unique_codes: 4 },
    scope: 'global'
  },
  {
    id: 'demo-prog-yaz-senligi',
    name: 'Yaz Şenliği Referans Programı',
    mode: 'single_reusable_date',
    allowed_referrer_categories: [],
    success_criteria: 'nth_purchase',
    success_purchase_count: 2,
    active: true,
    config_json: {
      valid_from: '2026-05-01T00:00:00.000Z',
      valid_to: '2026-06-30T23:59:59.000Z'
    },
    scope: 'global'
  },
  {
    id: 'demo-prog-sinirli-paylasim',
    name: 'Sınırlı Paylaşım Referansı',
    mode: 'single_reusable_limit',
    allowed_referrer_categories: [],
    success_criteria: 'registration',
    success_purchase_count: 1,
    active: true,
    config_json: { use_limit: 5 },
    scope: 'global'
  }
];

async function apiQuery(payload) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
  return result.data;
}

function eq(col, val) {
  return { type: 'eq', col, val };
}

function ilike(col, val) {
  return { type: 'ilike', col, val };
}

function inFilter(col, val) {
  return { type: 'in', col, val };
}

async function selectRows(table, select = '*', filters = []) {
  return apiQuery({ table, operation: 'select', select, filters });
}

async function deleteRows(table, filters) {
  return apiQuery({ table, operation: 'delete', filters });
}

async function insertRows(table, rows) {
  if (!rows.length) return [];
  // For JSONB columns, we need to stringify them before sending to API
  const stringifiedRows = rows.map(row => {
    const copy = { ...row };
    if (copy.config_json && typeof copy.config_json === 'object') {
      copy.config_json = JSON.stringify(copy.config_json);
    }
    if (copy.allowed_referrer_categories && typeof copy.allowed_referrer_categories === 'object') {
      copy.allowed_referrer_categories = JSON.stringify(copy.allowed_referrer_categories);
    }
    return copy;
  });

  return apiQuery({
    table,
    operation: 'insert',
    data: stringifiedRows,
  });
}

async function main() {
  // 1. Dependency Preflight Check
  console.log('Checking dependencies...');
  
  // Verify target tables exist
  let tablesReady = false;
  try {
    await selectRows('loyalty_referral_programs', 'id', [], { limit: 1 });
    await selectRows('loyalty_referral_codes', 'id', [], { limit: 1 });
    await selectRows('loyalty_referral_tracking', 'id', [], { limit: 1 });
    tablesReady = true;
    console.log('[PASS] Target tables exist in Railway Postgres.');
  } catch (err) {
    console.error('[FAIL] Missing referral schema tables. Make sure migration 015 has been applied.', err.message);
    process.exit(1);
  }

  // Fetch some customers from the DB to link to referral codes
  const customers = await selectRows('musteriler', 'id, ad_soyad, referral_code', [
    ilike('external_customer_ref', 'DEMO-MUS-%')
  ]);

  if (!customers || customers.length < 10) {
    console.error('[FAIL] Not enough demo customers found. Run customer bootstrap first.');
    process.exit(1);
  }
  console.log(`[PASS] Found ${customers.length} demo customers.`);

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : (verifyOnly ? 'verify-only' : 'apply'),
    apiUrl: API_URL,
    programsToSeed: REFERRAL_PROGRAMS.length,
  }, null, 2));

  if (dryRun) return;

  if (!verifyOnly) {
    // Cleanup existing demo referral tracking & codes & programs
    console.log('Cleaning up existing demo referral data...');
    const programIds = REFERRAL_PROGRAMS.map(p => p.id);
    
    await deleteRows('loyalty_referral_tracking', [inFilter('program_id', programIds)]);
    await deleteRows('loyalty_referral_codes', [inFilter('program_id', programIds)]);
    await deleteRows('loyalty_referral_programs', [inFilter('id', programIds)]);

    // Insert programs
    console.log('Inserting referral programs...');
    await insertRows('loyalty_referral_programs', REFERRAL_PROGRAMS);
    console.log('Referral programs inserted successfully.');

    // Generate codes for some customers
    console.log('Generating referral codes for demo customers...');
    const codesToInsert = [];
    
    // Customer 1 gets 2 unique codes for Program 1
    codesToInsert.push({
      program_id: 'demo-prog-arkadasini-getir',
      referrer_customer_id: customers[0].id,
      referral_code: 'REF-AYSE-ARK1',
      is_used: true, // Marked as used
      created_at: DEMO_TIMESTAMP
    });
    codesToInsert.push({
      program_id: 'demo-prog-arkadasini-getir',
      referrer_customer_id: customers[0].id,
      referral_code: 'REF-AYSE-ARK2',
      is_used: false,
      created_at: DEMO_TIMESTAMP
    });

    // Customer 2 gets a single reusable date-limited code for Program 2
    codesToInsert.push({
      program_id: 'demo-prog-yaz-senligi',
      referrer_customer_id: customers[1].id,
      referral_code: 'REF-MEHMET-YAZ',
      is_used: false,
      created_at: DEMO_TIMESTAMP
    });

    // Customer 3 gets a single reusable limit-limited code for Program 3
    codesToInsert.push({
      program_id: 'demo-prog-sinirli-paylasim',
      referrer_customer_id: customers[2].id,
      referral_code: 'REF-ZEYNEP-LMT',
      is_used: true,
      created_at: DEMO_TIMESTAMP
    });

    await insertRows('loyalty_referral_codes', codesToInsert);
    console.log('Referral codes inserted.');

    // Setup tracking records
    console.log('Inserting referral tracking logs...');
    const trackingToInsert = [
      {
        program_id: 'demo-prog-arkadasini-getir',
        referrer_customer_id: customers[0].id, // Ayse
        referee_customer_id: customers[4].id, // Elif
        referral_code: 'REF-AYSE-ARK1',
        status: 'successful',
        created_at: DEMO_TIMESTAMP,
        success_at: DEMO_TIMESTAMP
      },
      {
        program_id: 'demo-prog-yaz-senligi',
        referrer_customer_id: customers[1].id, // Mehmet
        referee_customer_id: customers[5].id, // Mustafa
        referral_code: 'REF-MEHMET-YAZ',
        status: 'pending',
        created_at: DEMO_TIMESTAMP
      },
      {
        program_id: 'demo-prog-sinirli-paylasim',
        referrer_customer_id: customers[2].id, // Zeynep
        referee_customer_id: customers[6].id, // Fatma
        referral_code: 'REF-ZEYNEP-LMT',
        status: 'successful',
        created_at: DEMO_TIMESTAMP,
        success_at: DEMO_TIMESTAMP
      }
    ];

    await insertRows('loyalty_referral_tracking', trackingToInsert);
    console.log('Tracking logs inserted.');
  }

  // Verification read-backs
  console.log('Running verification read-backs...');
  const seededPrograms = await selectRows('loyalty_referral_programs', 'id, name, active', [
    inFilter('id', REFERRAL_PROGRAMS.map(p => p.id))
  ]);
  const seededCodes = await selectRows('loyalty_referral_codes', 'id, referral_code, is_used', [
    inFilter('program_id', REFERRAL_PROGRAMS.map(p => p.id))
  ]);
  const seededTracking = await selectRows('loyalty_referral_tracking', 'id, status', [
    inFilter('program_id', REFERRAL_PROGRAMS.map(p => p.id))
  ]);

  console.log(JSON.stringify({
    verification: {
      programsCount: seededPrograms.length,
      codesCount: seededCodes.length,
      trackingCount: seededTracking.length,
      ok: seededPrograms.length === 3 && seededCodes.length === 4 && seededTracking.length === 3
    }
  }, null, 2));

  if (seededPrograms.length === 3 && seededCodes.length === 4 && seededTracking.length === 3) {
    console.log('DEMO_READY_WITH_NOTES: Referral system demo data successfully seeded.');
  } else {
    throw new Error('Verification failed. Seeding counts do not match expected values.');
  }
}

main().catch(err => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
