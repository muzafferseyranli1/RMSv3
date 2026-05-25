const fetch = globalThis.fetch;

async function check() {
  const API_URL = 'https://rms-api-production-219d.up.railway.app';
  
  // 1. Fetch first 10 customers
  const customersRes = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: 'musteriler',
      operation: 'select',
      select: 'id,ad_soyad,telefon,telefon_ulke,normalized_phone',
      limit: 10
    })
  });
  const customers = await customersRes.json();
  console.log('Customers sample:', JSON.stringify(customers.data, null, 2));

  // 2. Fetch personnel records from settings
  const settingsRes = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: 'settings',
      operation: 'select',
      select: 'key,value',
      filters: [{ type: 'eq', col: 'key', val: 'personnel_records' }]
    })
  });
  const settings = await settingsRes.json();
  const personnel = settings.data?.[0]?.value || [];
  console.log('Personnel count:', personnel.length);
  if (personnel.length > 0) {
    console.log('Personnel sample:', JSON.stringify(personnel.slice(0, 3).map(p => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      mobilePhone: p.mobilePhone
    })), null, 2));
  }
}

check().catch(console.error);
