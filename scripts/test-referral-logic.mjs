import { createRequire } from 'module';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const requireFromProject = createRequire(path.resolve(projectRoot, 'package.json'));
const jiti = requireFromProject('jiti');

// Resolve database URL from server/.env
async function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.resolve(projectRoot, 'server', '.env');
    const content = await fs.readFile(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      if (key === 'DATABASE_URL') {
        let value = line.slice(separatorIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return value;
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

const DATABASE_URL = await getDatabaseUrl();
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Please set it in server/.env.');
  process.exit(1);
}

// Inject DATABASE_URL into process.env before loading the library
process.env.DATABASE_URL = DATABASE_URL;

const loader = jiti(projectRoot, {
  alias: {
    '@': path.resolve(projectRoot, 'src')
  },
  esmResolve: true
});

const mobileApp = loader('./src/lib/mobileCustomerApp.js');
const pg = requireFromProject('pg');
const { Client } = pg;

let failedTests = 0;
let passedTests = 0;

function assert(condition, message, details) {
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${message}`);
    if (details) console.error('Details:', details);
  }
}

async function cleanMockData(client) {
  console.log('Cleaning up mock referral data and test customer data...');
  
  await client.query(`
    DELETE FROM loyalty_transactions 
    WHERE customer_id IN (
      SELECT id FROM musteriler WHERE email LIKE '%@test-referral.com'
    )
  `);
  
  await client.query(`
    DELETE FROM loyalty_wallets 
    WHERE customer_id IN (
      SELECT id FROM musteriler WHERE email LIKE '%@test-referral.com'
    )
  `);

  await client.query(`
    DELETE FROM loyalty_coupons
    WHERE customer_id IN (
      SELECT id FROM musteriler WHERE email LIKE '%@test-referral.com'
    )
  `);

  await client.query(`
    DELETE FROM loyalty_referral_tracking
    WHERE program_id LIKE 'TEST-REF-%'
  `);

  await client.query(`
    DELETE FROM loyalty_referral_codes 
    WHERE program_id LIKE 'TEST-REF-%' OR campaign_id LIKE 'TEST-REF-%'
  `);

  await client.query(`
    DELETE FROM loyalty_referral_programs
    WHERE id LIKE 'TEST-REF-%'
  `);

  await client.query(`
    DELETE FROM loyalty_campaigns 
    WHERE id LIKE 'TEST-REF-%'
  `);

  await client.query(`
    DELETE FROM musteriler 
    WHERE email LIKE '%@test-referral.com'
  `);
}

async function runTests() {
  console.log('Spawning local API server on port 3001...');
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.VITE_API_URL = 'http://localhost:3001';

  const serverProcess = spawn('node', [path.resolve(projectRoot, 'server', 'index.js')], {
    env: { ...process.env, NODE_ENV: 'test', PORT: '3001' }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server] ${data}`);
  });

  // Wait 1.5 seconds for the server to start
  await new Promise(resolve => setTimeout(resolve, 1500));

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('rlwy.net') || DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  let deactivatedIds = [];
  let deactivatedProgIds = [];

  try {
    await cleanMockData(client);

    // Deactivate existing referral campaigns to avoid test interference
    console.log('Deactivating existing active referral campaigns to prevent test interference...');
    const { rows: deactivatedCampaigns } = await client.query(`
      UPDATE loyalty_campaigns
      SET active = false
      WHERE active = true AND id NOT LIKE 'TEST-REF-%' AND (
        conditions_json::text LIKE '%referred_customer%' OR 
        conditions_json::text LIKE '%gave_referral%' OR
        conditions_json::text LIKE '%referral_source%'
      )
      RETURNING id
    `);
    deactivatedIds = deactivatedCampaigns.map(r => r.id);
    console.log('Deactivated campaign IDs:', deactivatedIds);

    // Deactivate existing active referral programs to prevent test interference
    console.log('Deactivating existing active referral programs to prevent test interference...');
    const { rows: deactivatedPrograms } = await client.query(`
      UPDATE loyalty_referral_programs
      SET active = false
      WHERE active = true AND id NOT LIKE 'TEST-REF-%'
      RETURNING id
    `);
    deactivatedProgIds = deactivatedPrograms.map(r => r.id);
    console.log('Deactivated program IDs:', deactivatedProgIds);

    console.log('\n--- Starting Referral System Integration Verification Tests ---\n');

    // Create a mock customer category
    const catVip = 'cat-vip-test';
    const catGold = 'cat-gold-test';

    // 1. Referral Eligibility & Allowed Categories Test
    console.log('--- Test Scenario 1: Referrer Category Eligibility ---');
    
    // Create eligible and ineligible referrers
    const { rows: eligibleReferrers } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, tags, created_at)
      VALUES ('Eligible Referrer', '+905555550001', 'eligible@test-referral.com', 'member', '["${catVip}", "${catGold}"]', now())
      RETURNING id, ad_soyad, tags
    `);
    const eligibleReferrer = eligibleReferrers[0];

    const { rows: ineligibleReferrers } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, tags, created_at)
      VALUES ('Ineligible Referrer', '+905555550002', 'ineligible@test-referral.com', 'member', '["cat-bronze"]', now())
      RETURNING id, ad_soyad, tags
    `);
    const ineligibleReferrer = ineligibleReferrers[0];

    // Create a program restricting referrer categories
    const programId1 = 'TEST-REF-PROG-1';
    await client.query(`
      INSERT INTO loyalty_referral_programs (id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active)
      VALUES ($1, 'VIP Referral Program', 'unique_multiple', $2, $3, 'registration', 1, true)
    `, [
      programId1,
      JSON.stringify({ max_unique_codes: 3 }),
      JSON.stringify([catVip, 'cat-gold-test'])
    ]);

    // Check active programs loading
    const activePrograms = await mobileApp.getActiveReferralPrograms();
    assert(activePrograms.length > 0, 'getActiveReferralPrograms: should load active referral programs');
    const program1 = activePrograms.find(p => p.id === programId1);
    assert(program1 !== undefined, 'getActiveReferralPrograms: loads the created program');

    // Compatibility check
    const activeCamp = await mobileApp.getActiveReferralCampaign();
    assert(activeCamp !== null, 'getActiveReferralCampaign: should load active referral campaign fallback', { activeCamp });
    assert(activeCamp.campaign.id === programId1, 'getActiveReferralCampaign: compatibility campaign id maps to program id');

    // Check eligibility
    const eligibleRes = mobileApp.checkReferralEligibility(eligibleReferrer, program1);
    assert(eligibleRes.eligible === true, 'checkReferralEligibility: should allow customer with allowed category tag', { eligibleRes });

    const ineligibleRes = mobileApp.checkReferralEligibility(ineligibleReferrer, program1);
    assert(ineligibleRes.eligible === false, 'checkReferralEligibility: should deny customer without allowed category tag', { ineligibleRes });


    // 2. Mode 1 (unique_multiple) limit bounds test
    console.log('\n--- Test Scenario 2: Mode 1 (Unique Multiple Codes) Limits & Flow ---');
    
    // Generate codes up to limit (3)
    const code1 = await mobileApp.generateReferralCode(eligibleReferrer.id, programId1);
    const code2 = await mobileApp.generateReferralCode(eligibleReferrer.id, programId1);
    const code3 = await mobileApp.generateReferralCode(eligibleReferrer.id, programId1);
    
    assert(typeof code1 === 'string' && code1.startsWith('REF-'), `generateReferralCode: generated code 1 (${code1})`);
    assert(code1 !== code2 && code2 !== code3, 'generateReferralCode: generated unique multiple codes');

    const codes = await mobileApp.getReferrerCodes(eligibleReferrer.id, programId1);
    assert(codes.length === 3, 'getReferrerCodes: returns correct count of codes');

    // Attempt to generate 4th code (should throw error because max_unique_codes = 3)
    let exceeded = false;
    try {
      await mobileApp.generateReferralCode(eligibleReferrer.id, programId1);
    } catch (err) {
      exceeded = true;
      assert(err.message.includes('Limitiniz dolmuştur'), 'generateReferralCode: throws limit exceeded error', { message: err.message });
    }
    assert(exceeded === true, 'generateReferralCode: blocked 4th code generation under mode 1');

    // Create a new customer and sign up with code1
    const referee1 = await mobileApp.registerCustomer('Referee One', '+905555550101', 'referee1@test-referral.com', code1);
    assert(referee1.id !== undefined, 'registerCustomer: signed up new customer with referral code');
    assert(referee1.referred_by_customer_id === eligibleReferrer.id, 'registerCustomer: linked referee to referrer correctly');

    // Verify code1 is used
    const checkCodes = await mobileApp.getReferrerCodes(eligibleReferrer.id, programId1);
    const usedCodeRow = checkCodes.find(c => c.referral_code === code1);
    assert(usedCodeRow.is_used === true && usedCodeRow.referee_customer_id === referee1.id, 'applyReferralCode: marked code as used and stored referee customer ID');

    // Attempt to use code1 again (should fail)
    const referee2 = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, created_at)
      VALUES ('Referee Two', '+905555550102', 'referee2@test-referral.com', 'member', now())
      RETURNING id
    `);
    
    let reuseFailed = false;
    try {
      await mobileApp.validateReferralCode(referee2.rows[0].id, code1);
    } catch (err) {
      reuseFailed = true;
      assert(err.message.includes('zaten kullanılmış'), 'validateReferralCode: rejects already used code', { message: err.message });
    }
    assert(reuseFailed === true, 'validateReferralCode: code reuse blocked');


    // 3. Mode 2 (single_reusable_date) validity bounds test
    console.log('\n--- Test Scenario 3: Mode 2 (Single Reusable Date-Limited Code) ---');
    
    // Deactivate previous test programs to isolate Scenario 3
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId1]);

    const programId2 = 'TEST-REF-PROG-2';
    // Program active, but date window for referral is in the future
    await client.query(`
      INSERT INTO loyalty_referral_programs (id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active)
      VALUES ($1, 'Date Restricted Referral', 'single_reusable_date', $2, '[]', 'registration', 1, true)
    `, [
      programId2,
      JSON.stringify({
        valid_from: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // starts tomorrow
        valid_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      })
    ]);

    const referrerCode = await mobileApp.generateReferralCode(eligibleReferrer.id, programId2);
    assert(typeof referrerCode === 'string', 'generateReferralCode: returns single reusable code for referrer');

    const { rows: testCustRows } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, created_at)
      VALUES ('Test Customer', '+905555550201', 'test_cust@test-referral.com', 'member', now())
      RETURNING id
    `);
    const testCustId = testCustRows[0].id;

    let dateFail = false;
    try {
      await mobileApp.validateReferralCode(testCustId, referrerCode);
    } catch (err) {
      dateFail = true;
      assert(err.message.includes('geçerlilik süresi henüz başlamamış') || err.message.includes('aktif bir referans programı bulunamadı'), 'validateReferralCode: rejects validation if current date is before valid_from', { message: err.message });
    }
    assert(dateFail === true, 'validateReferralCode: date-restricted referral validation blocks out-of-bounds attempt');


    // 4. Mode 3 (single_reusable_limit) redemption limit test
    console.log('\n--- Test Scenario 4: Mode 3 (Single Reusable Limit-Limited Code) ---');
    
    // Deactivate Scenario 3 program to prevent date validation error interference
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId2]);

    const programId3 = 'TEST-REF-PROG-3';
    // Max redemptions per referrer = 2
    await client.query(`
      INSERT INTO loyalty_referral_programs (id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active)
      VALUES ($1, 'Limit Restricted Referral', 'single_reusable_limit', $2, '[]', 'registration', 1, true)
    `, [
      programId3,
      JSON.stringify({
        max_redemptions_per_referrer: 2
      })
    ]);

    const limitCode = await mobileApp.generateReferralCode(eligibleReferrer.id, programId3);
    assert(limitCode === referrerCode, 'generateReferralCode: keeps same single referral code for referrer across reusable programs');

    // 1st redemption
    const referee3_1 = await mobileApp.registerCustomer('Referee 3-1', '+905555550301', 'referee3_1@test-referral.com', limitCode);
    assert(referee3_1.referred_by_customer_id === eligibleReferrer.id, 'registerCustomer: 1st customer successfully referred');

    // 2nd redemption
    const referee3_2 = await mobileApp.registerCustomer('Referee 3-2', '+905555550302', 'referee3_2@test-referral.com', limitCode);
    assert(referee3_2.referred_by_customer_id === eligibleReferrer.id, 'registerCustomer: 2nd customer successfully referred');

    // 3rd redemption should fail (limit = 2)
    const { rows: testCust3Rows } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, created_at)
      VALUES ('Referee 3-3-Fail', '+905555550303', 'referee3_3@test-referral.com', 'member', now())
      RETURNING id
    `);
    const testCust3Id = testCust3Rows[0].id;

    let limitFail = false;
    try {
      await mobileApp.validateReferralCode(testCust3Id, limitCode);
    } catch (err) {
      limitFail = true;
      assert(err.message.includes('limitine ulaşmış') || err.message.includes('aktif bir referans programı bulunamadı'), 'validateReferralCode: rejects validation if code use limit reached', { message: err.message });
    }
    assert(limitFail === true, 'validateReferralCode: limit-restricted referral validation blocks exceeding attempt');


    // 5. Retrospective Referral Entry bounds (orders & days)
    console.log('\n--- Test Scenario 5: Retrospective Referral Entry Constraints ---');
    
    // Deactivate Program 3
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId3]);

    const programId4 = 'TEST-REF-PROG-4';
    await client.query(`
      INSERT INTO loyalty_referral_programs (id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active)
      VALUES ($1, 'Normal Referral Program', 'single_reusable_limit', $2, '[]', 'registration', 1, true)
    `, [
      programId4,
      JSON.stringify({
        max_redemptions_per_referrer: 10
      })
    ]);

    const standardCode = await mobileApp.generateReferralCode(eligibleReferrer.id, programId4);

    // Case 5a: User has orders (should fail)
    const { rows: orderCustRows } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, created_at, total_order_count)
      VALUES ('User With Orders', '+905555550401', 'orders@test-referral.com', 'member', now(), 2)
      RETURNING id
    `);
    const orderCustId = orderCustRows[0].id;

    let orderCustFail = false;
    try {
      await mobileApp.validateReferralCode(orderCustId, standardCode);
    } catch (err) {
      orderCustFail = true;
      assert(err.message.includes('sipariş vermemiş olmanız gerekir'), 'validateReferralCode: rejects user who has order count > 0', { message: err.message });
    }
    assert(orderCustFail === true, 'validateReferralCode: retrospective entry fails for customer with orders');

    // Case 5b: User signed up > 7 days ago (should fail)
    const { rows: oldCustRows } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, created_at, total_order_count)
      VALUES ('Old Member', '+905555550402', 'old@test-referral.com', 'member', now() - interval '8 days', 0)
      RETURNING id
    `);
    const oldCustId = oldCustRows[0].id;

    let oldCustFail = false;
    try {
      await mobileApp.validateReferralCode(oldCustId, standardCode);
    } catch (err) {
      oldCustFail = true;
      assert(err.message.includes('ilk 7 gün içinde yapılabilir'), 'validateReferralCode: rejects user signed up > 7 days ago', { message: err.message });
    }
    assert(oldCustFail === true, 'validateReferralCode: retrospective entry fails for customer registered > 7 days ago');

    // Case 5c: Eligible retrospective entry (0 orders, <= 7 days) (should pass)
    const { rows: retroCustRows } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, created_at, total_order_count)
      VALUES ('Eligible Retro User', '+905555550403', 'retro@test-referral.com', 'member', now() - interval '3 days', 0)
      RETURNING id
    `);
    const retroCustId = retroCustRows[0].id;

    const valResult = await mobileApp.validateReferralCode(retroCustId, standardCode);
    assert(valResult.isValid === true, 'validateReferralCode: passes for eligible retro customer (3 days old, 0 orders)');

    const applied = await mobileApp.applyReferralCode(retroCustId, valResult);
    assert(applied === true, 'applyReferralCode: successfully applied code to retro customer');

    const { rows: appliedCust } = await client.query(`SELECT referred_by_customer_id FROM musteriler WHERE id = $1`, [retroCustId]);
    assert(appliedCust[0].referred_by_customer_id === eligibleReferrer.id, 'applyReferralCode: successfully linked customer referred_by field in DB');


    // 6. Referral Success Criteria: registration vs nth_purchase
    console.log('\n--- Test Scenario 6: Success Criteria (registration vs nth_purchase) ---');

    // Deactivate Program 4
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId4]);

    const programId6A = 'TEST-REF-PROG-6A'; // registration
    const programId6B = 'TEST-REF-PROG-6B'; // 2nd purchase

    await client.query(`
      INSERT INTO loyalty_referral_programs (id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active)
      VALUES 
      ($1, 'Program 6A (Registration)', 'single_reusable_limit', '{"max_redemptions_per_referrer": 10}', '[]', 'registration', 1, true),
      ($2, 'Program 6B (2nd Purchase)', 'single_reusable_limit', '{"max_redemptions_per_referrer": 10}', '[]', 'nth_purchase', 2, true)
    `, [programId6A, programId6B]);

    const code6A = await mobileApp.generateReferralCode(eligibleReferrer.id, programId6A);
    const code6B = await mobileApp.generateReferralCode(eligibleReferrer.id, programId6B);

    // Sequence 6A: Activate 6A, deactivate 6B
    await client.query(`UPDATE loyalty_referral_programs SET active = true WHERE id = $1`, [programId6A]);
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId6B]);

    // Register 6A
    const referee6A = await mobileApp.registerCustomer('Referee 6A', '+905555550601', 'referee6a@test-referral.com', code6A);
    const { rows: tracking6ARows } = await client.query(`SELECT status FROM loyalty_referral_tracking WHERE program_id = $1 AND referee_customer_id = $2`, [programId6A, referee6A.id]);
    assert(tracking6ARows[0]?.status === 'successful', 'success_criteria registration: status is immediately successful on signup');

    // Sequence 6B: Activate 6B, deactivate 6A
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId6A]);
    await client.query(`UPDATE loyalty_referral_programs SET active = true WHERE id = $1`, [programId6B]);

    // Register 6B
    const referee6B = await mobileApp.registerCustomer('Referee 6B', '+905555550602', 'referee6b@test-referral.com', code6B);
    const { rows: tracking6BRows } = await client.query(`SELECT status FROM loyalty_referral_tracking WHERE program_id = $1 AND referee_customer_id = $2`, [programId6B, referee6B.id]);
    assert(tracking6BRows[0]?.status === 'pending', 'success_criteria nth_purchase: status is pending on signup');

    // Make 1st order (count = 1)
    await client.query(`UPDATE musteriler SET total_order_count = 1 WHERE id = $1`, [referee6B.id]);
    await mobileApp.checkReferralSuccess(referee6B.id);
    const { rows: tracking6BRowsAfter1 } = await client.query(`SELECT status FROM loyalty_referral_tracking WHERE program_id = $1 AND referee_customer_id = $2`, [programId6B, referee6B.id]);
    assert(tracking6BRowsAfter1[0]?.status === 'pending', 'checkReferralSuccess: remains pending when order count (1) < threshold (2)');

    // Make 2nd order (count = 2)
    await client.query(`UPDATE musteriler SET total_order_count = 2 WHERE id = $1`, [referee6B.id]);
    await mobileApp.checkReferralSuccess(referee6B.id);
    const { rows: tracking6BRowsAfter2 } = await client.query(`SELECT status FROM loyalty_referral_tracking WHERE program_id = $1 AND referee_customer_id = $2`, [programId6B, referee6B.id]);
    assert(tracking6BRowsAfter2[0]?.status === 'successful', 'checkReferralSuccess: becomes successful when order count (2) >= threshold (2)');


    // 7. Referee Rewards Evaluation (referred_customer condition)
    console.log('\n--- Test Scenario 7: Referee Rewards (referred_customer) ---');

    const campaignId7A = 'TEST-REF-CAMP-7A'; // triggers on registration
    const campaignId7B = 'TEST-REF-CAMP-7B'; // triggers on nth_purchase

    await client.query(`
      INSERT INTO loyalty_campaigns (id, name, conditions_json, actions_json, starts_at, ends_at, active)
      VALUES 
      ($1, 'Welcome Campaign', $2, $3, now() - interval '1 hour', now() + interval '1 day', true),
      ($4, 'Purchase Milestone Campaign', $5, $6, now() - interval '1 hour', now() + interval '1 day', true)
    `, [
      campaignId7A,
      JSON.stringify([{ condition_key: 'referred_customer', config: { program_ids: [programId6A], trigger: 'registration' } }]),
      JSON.stringify([{ action_type: 'bonus_points', action_config: { points: 100 } }]),
      campaignId7B,
      JSON.stringify([{ condition_key: 'referred_customer', config: { program_ids: [programId6B], trigger: 'nth_purchase', trigger_purchase_count: 2 } }]),
      JSON.stringify([{ action_type: 'bonus_points', action_config: { points: 200 } }])
    ]);

    // Sequence 7A: Activate 6A, deactivate 6B
    await client.query(`UPDATE loyalty_referral_programs SET active = true WHERE id = $1`, [programId6A]);
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId6B]);

    // Register Referee 7A using code 6A (registration trigger)
    const referee7A = await mobileApp.registerCustomer('Referee 7A', '+905555550701', 'referee7a@test-referral.com', code6A);
    const { rows: wallet7A } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referee7A.id]);
    assert(Number(wallet7A[0]?.current_points_balance) === 100, 'evaluateRefereeRewards: referee rewarded on registration', { points: wallet7A[0]?.current_points_balance });

    // Sequence 7B: Activate 6B, deactivate 6A
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId6A]);
    await client.query(`UPDATE loyalty_referral_programs SET active = true WHERE id = $1`, [programId6B]);

    // Register Referee 7B using code 6B (nth_purchase trigger)
    const referee7B = await mobileApp.registerCustomer('Referee 7B', '+905555550702', 'referee7b@test-referral.com', code6B);
    const { rows: wallet7BBefore } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referee7B.id]);
    assert(!wallet7BBefore[0], 'evaluateRefereeRewards: referee not rewarded on registration for nth_purchase trigger');

    // Simulate 2 orders
    await client.query(`UPDATE musteriler SET total_order_count = 2 WHERE id = $1`, [referee7B.id]);
    await mobileApp.checkReferralSuccess(referee7B.id);
    const { rows: wallet7BAfter } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referee7B.id]);
    assert(Number(wallet7BAfter[0]?.current_points_balance) === 200, 'evaluateRefereeRewards: referee rewarded when nth_purchase criteria is met', { points: wallet7BAfter[0]?.current_points_balance });


    // 8. Referrer Rewards: per_each
    console.log('\n--- Test Scenario 8: Referrer Rewards (per_each) ---');

    // Deactivate 6B program and campaigns to isolate
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId6B]);
    await client.query(`UPDATE loyalty_campaigns SET active = false WHERE id IN ($1, $2)`, [campaignId7A, campaignId7B]);

    const programId8 = 'TEST-REF-PROG-8';
    const campaignId8 = 'TEST-REF-CAMP-8';

    await client.query(`
      INSERT INTO loyalty_referral_programs (id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active)
      VALUES ($1, 'Program 8 (Per Each)', 'single_reusable_limit', '{"max_redemptions_per_referrer": 10}', '[]', 'registration', 1, true)
    `, [programId8]);

    await client.query(`
      INSERT INTO loyalty_campaigns (id, name, conditions_json, actions_json, starts_at, ends_at, active)
      VALUES ($1, 'Per Each Referrer Campaign', $2, $3, now() - interval '1 hour', now() + interval '1 day', true)
    `, [
      campaignId8,
      JSON.stringify([{ condition_key: 'gave_referral', config: { program_id: programId8, reward_type: 'per_each', max_rewards: 2 } }]),
      JSON.stringify([{ action_type: 'bonus_points', action_config: { points: 50 } }])
    ]);

    // Create a new distinct referrer to avoid wallet pollution
    const { rows: referrers8 } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, tags, created_at)
      VALUES ('Referrer Eight', '+905555550800', 'referrer8@test-referral.com', 'member', '[]', now())
      RETURNING id
    `);
    const referrer8 = referrers8[0];
    const code8 = await mobileApp.generateReferralCode(referrer8.id, programId8);

    // 1st referral
    const ref8_1 = await mobileApp.registerCustomer('Referee 8-1', '+905555550801', 'ref8_1@test-referral.com', code8);
    const { rows: wallet8_1 } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referrer8.id]);
    assert(Number(wallet8_1[0]?.current_points_balance) === 50, 'per_each: referrer rewarded for first successful referral');

    // 2nd referral
    const ref8_2 = await mobileApp.registerCustomer('Referee 8-2', '+905555550802', 'ref8_2@test-referral.com', code8);
    const { rows: wallet8_2 } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referrer8.id]);
    assert(Number(wallet8_2[0]?.current_points_balance) === 100, 'per_each: referrer rewarded for second successful referral');

    // 3rd referral (exceeds max_rewards = 2)
    const ref8_3 = await mobileApp.registerCustomer('Referee 8-3', '+905555550803', 'ref8_3@test-referral.com', code8);
    const { rows: wallet8_3 } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referrer8.id]);
    assert(Number(wallet8_3[0]?.current_points_balance) === 100, 'per_each: referrer rewards capped at max_rewards limit', { points: wallet8_3[0]?.current_points_balance });


    // 9. Referrer Rewards: threshold
    console.log('\n--- Test Scenario 9: Referrer Rewards (threshold) ---');

    // Deactivate Program 8 and Campaign 8
    await client.query(`UPDATE loyalty_referral_programs SET active = false WHERE id = $1`, [programId8]);
    await client.query(`UPDATE loyalty_campaigns SET active = false WHERE id = $1`, [campaignId8]);

    const programId9 = 'TEST-REF-PROG-9';
    const campaignId9 = 'TEST-REF-CAMP-9';

    await client.query(`
      INSERT INTO loyalty_referral_programs (id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active)
      VALUES ($1, 'Program 9 (Threshold)', 'single_reusable_limit', '{"max_redemptions_per_referrer": 10}', '[]', 'registration', 1, true)
    `, [programId9]);

    await client.query(`
      INSERT INTO loyalty_campaigns (id, name, conditions_json, actions_json, starts_at, ends_at, active)
      VALUES ($1, 'Threshold Referrer Campaign', $2, $3, now() - interval '1 hour', now() + interval '1 day', true)
    `, [
      campaignId9,
      JSON.stringify([{ condition_key: 'gave_referral', config: { program_id: programId9, reward_type: 'threshold', threshold_count: 3 } }]),
      JSON.stringify([{ action_type: 'bonus_points', action_config: { points: 300 } }])
    ]);

    // Create another distinct referrer
    const { rows: referrers9 } = await client.query(`
      INSERT INTO musteriler (ad_soyad, telefon, email, loyalty_status, tags, created_at)
      VALUES ('Referrer Nine', '+905555550900', 'referrer9@test-referral.com', 'member', '[]', now())
      RETURNING id
    `);
    const referrer9 = referrers9[0];
    const code9 = await mobileApp.generateReferralCode(referrer9.id, programId9);

    // 1st referral
    await mobileApp.registerCustomer('Referee 9-1', '+905555550901', 'ref9_1@test-referral.com', code9);
    const { rows: wallet9_1 } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referrer9.id]);
    assert(!wallet9_1[0], 'threshold: referrer not rewarded after 1 referral');

    // 2nd referral
    await mobileApp.registerCustomer('Referee 9-2', '+905555550902', 'ref9_2@test-referral.com', code9);
    const { rows: wallet9_2 } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referrer9.id]);
    assert(!wallet9_2[0] || Number(wallet9_2[0].current_points_balance) === 0, 'threshold: referrer not rewarded after 2 referrals');

    // 3rd referral (reaches threshold of 3)
    await mobileApp.registerCustomer('Referee 9-3', '+905555550903', 'ref9_3@test-referral.com', code9);
    const { rows: wallet9_3 } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referrer9.id]);
    assert(Number(wallet9_3[0]?.current_points_balance) === 300, 'threshold: referrer rewarded with threshold points on 3rd successful referral', { points: wallet9_3[0]?.current_points_balance });

    // 4th referral (should not reward again)
    await mobileApp.registerCustomer('Referee 9-4', '+905555550904', 'ref9_4@test-referral.com', code9);
    const { rows: wallet9_4 } = await client.query(`SELECT current_points_balance FROM loyalty_wallets WHERE customer_id = $1`, [referrer9.id]);
    assert(Number(wallet9_4[0]?.current_points_balance) === 300, 'threshold: referrer threshold reward is only given once', { points: wallet9_4[0]?.current_points_balance });


    // 10. Double Reward Prevention
    console.log('\n--- Test Scenario 10: Double Reward Prevention ---');

    // Reactivate programs & campaigns to allow reward evaluation checks
    await client.query(`UPDATE loyalty_referral_programs SET active = true WHERE id LIKE 'TEST-REF-%'`);
    await client.query(`UPDATE loyalty_campaigns SET active = true WHERE id LIKE 'TEST-REF-%'`);

    // Referee double reward prevention
    const { rows: txs7A_before } = await client.query(`SELECT count(*)::int as cnt FROM loyalty_transactions WHERE customer_id = $1`, [referee7A.id]);
    await mobileApp.evaluateRefereeRewards(referee7A.id, 'registration');
    const { rows: txs7A_after } = await client.query(`SELECT count(*)::int as cnt FROM loyalty_transactions WHERE customer_id = $1`, [referee7A.id]);
    assert(txs7A_before[0].cnt === txs7A_after[0].cnt, 'double reward: referee does not receive duplicate welcome bonus points');

    // Referrer double reward prevention (per_each)
    const { rows: txs8_before } = await client.query(`SELECT count(*)::int as cnt FROM loyalty_transactions WHERE customer_id = $1 AND campaign_id = $2`, [referrer8.id, campaignId8]);
    await mobileApp.evaluateReferrerRewards(referrer8.id, programId8, ref8_1.id);
    const { rows: txs8_after } = await client.query(`SELECT count(*)::int as cnt FROM loyalty_transactions WHERE customer_id = $1 AND campaign_id = $2`, [referrer8.id, campaignId8]);
    assert(txs8_before[0].cnt === txs8_after[0].cnt, 'double reward: referrer does not receive duplicate points for the same referee');

    console.log('\nCleaning up verification mock data...');
    await cleanMockData(client);
    
  } finally {
    if (deactivatedIds && deactivatedIds.length > 0) {
      console.log('Restoring deactivated campaigns:', deactivatedIds);
      try {
        await client.query(`
          UPDATE loyalty_campaigns
          SET active = true
          WHERE id = ANY($1)
        `, [deactivatedIds]);
      } catch (err) {
        console.error('Failed to restore deactivated campaigns:', err.message);
      }
    }
    if (deactivatedProgIds && deactivatedProgIds.length > 0) {
      console.log('Restoring deactivated programs:', deactivatedProgIds);
      try {
        await client.query(`
          UPDATE loyalty_referral_programs
          SET active = true
          WHERE id = ANY($1)
        `, [deactivatedProgIds]);
      } catch (err) {
        console.error('Failed to restore deactivated programs:', err.message);
      }
    }
    try {
      await client.end();
    } catch (err) {
      // ignore
    }
    if (serverProcess) {
      console.log('Stopping local API server...');
      serverProcess.kill();
    }
  }

  console.log('\n--- Verification Finished ---');
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Test runner encountered an error:', error);
  process.exit(1);
});
