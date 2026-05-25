const fetch = globalThis.fetch;

const API_URL = 'https://rms-api-production-219d.up.railway.app';

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

function cleanLocalPhone(phone) {
  if (!phone) return phone;
  let cleaned = phone.trim();
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1).trim();
  }
  return cleaned;
}

function cleanNormalizedPhone(phone) {
  if (!phone) return phone;
  let cleaned = phone.trim().replace(/\D/g, '');
  if (cleaned.startsWith('900')) {
    cleaned = '90' + cleaned.slice(3);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

async function migrateCustomers() {
  console.log('--- Migrating Customers (using exact batch upsert) ---');
  const customers = await apiQuery({
    table: 'musteriler',
    operation: 'select',
    select: 'id,ad_soyad,telefon,normalized_phone,telefon_ulke',
    limit: 1000,
  });

  console.log(`Found ${customers.length} customers in database.`);
  const updates = [];

  for (const customer of customers) {
    const originalPhone = customer.telefon;
    const originalNormalized = customer.normalized_phone;

    const newPhone = cleanLocalPhone(originalPhone);
    const newNormalized = cleanNormalizedPhone(originalNormalized || (customer.telefon_ulke === '+90' && newPhone ? '90' + newPhone : null));

    if (originalPhone !== newPhone || originalNormalized !== newNormalized) {
      console.log(`Queueing customer update for ${customer.ad_soyad} (${customer.id}):`);
      console.log(`  Phone: "${originalPhone}" -> "${newPhone}"`);
      console.log(`  Normalized: "${originalNormalized}" -> "${newNormalized}"`);

      updates.push({
        id: customer.id,
        ad_soyad: customer.ad_soyad,
        telefon: newPhone,
        normalized_phone: newNormalized,
      });
    }
  }

  if (updates.length > 0) {
    // Send in batches of 25 to be traffic-friendly and compliant with Controlled Write Rules
    const batchSize = 25;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      console.log(`Upserting customer batch of size ${batch.length}...`);
      await apiQuery({
        table: 'musteriler',
        operation: 'upsert',
        data: batch,
        options: { onConflict: 'id' },
      });
    }
    console.log(`Customers migration completed. Updated ${updates.length} customers.`);
  } else {
    console.log('No customers needed update.');
  }
}

async function migratePersonnel() {
  console.log('--- Migrating Personnel ---');
  const settingsRows = await apiQuery({
    table: 'settings',
    operation: 'select',
    select: 'key,value',
    filters: [{ type: 'eq', col: 'key', val: 'personnel_records' }],
  });

  if (!settingsRows || settingsRows.length === 0) {
    console.log('No personnel records found in settings table.');
    return;
  }

  const personnel = settingsRows[0].value || [];
  console.log(`Found ${personnel.length} personnel records in settings.`);
  let updatedCount = 0;

  const nextPersonnel = personnel.map(employee => {
    const originalPhone = employee.phone;
    const originalMobile = employee.mobilePhone;

    const newPhone = cleanLocalPhone(originalPhone);
    const newMobile = cleanLocalPhone(originalMobile);

    if (originalPhone !== newPhone || originalMobile !== newMobile) {
      console.log(`Cleaning phone for employee: ${employee.firstName} ${employee.lastName}`);
      console.log(`  Phone: "${originalPhone}" -> "${newPhone}"`);
      console.log(`  Mobile: "${originalMobile}" -> "${newMobile}"`);
      updatedCount++;
      return {
        ...employee,
        phone: newPhone,
        mobilePhone: newMobile,
      };
    }
    return employee;
  });

  if (updatedCount > 0) {
    console.log(`Upserting ${nextPersonnel.length} personnel records back to settings...`);
    await apiQuery({
      table: 'settings',
      operation: 'upsert',
      data: {
        key: 'personnel_records',
        value: nextPersonnel,
      },
      options: { onConflict: 'key' },
    });
    console.log(`Personnel migration completed. Cleaned ${updatedCount} records.`);
  } else {
    console.log('No personnel records needed update.');
  }
}

async function main() {
  await migrateCustomers();
  await migratePersonnel();
}

main().catch(console.error);
