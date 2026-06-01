const fetch = globalThis.fetch;

async function run() {
  const API_URL = 'https://rms-api-production-219d.up.railway.app';
  const targetPhone = '5332760534';
  
  console.log(`--- RESEARCH FOR PHONE: ${targetPhone} ---`);
  
  // 1. Find the customer in 'musteriler'
  const customerRes = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: 'musteriler',
      operation: 'select',
      filters: [
        { type: 'eq', col: 'telefon', val: targetPhone }
      ]
    })
  });
  const customerData = await customerRes.json();
  console.log('Customer matching phone:', JSON.stringify(customerData.data, null, 2));
  
  if (!customerData.data || customerData.data.length === 0) {
    // Try normalized or other queries if not found
    console.log('Trying loose filter...');
    const customerRes2 = await fetch(`${API_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'musteriler',
        operation: 'select',
        filters: [
          { type: 'ilike', col: 'telefon', val: `%${targetPhone}` }
        ]
      })
    });
    const customerData2 = await customerRes2.json();
    console.log('Loose match result:', JSON.stringify(customerData2.data, null, 2));
    if (customerData2.data && customerData2.data.length > 0) {
      customerData.data = customerData2.data;
    }
  }

  if (customerData.data && customerData.data.length > 0) {
    const customer = customerData.data[0];
    const customerId = customer.id;
    
    // 2. Fetch loyalty wallets
    const walletRes = await fetch(`${API_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'loyalty_wallets',
        operation: 'select',
        filters: [{ type: 'eq', col: 'customer_id', val: customerId }]
      })
    });
    const walletData = await walletRes.json();
    console.log('Loyalty Wallets:', JSON.stringify(walletData.data, null, 2));
    
    // 3. Fetch frequency progress (stamps)
    const progressRes = await fetch(`${API_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'loyalty_frequency_progress',
        operation: 'select',
        filters: [{ type: 'eq', col: 'customer_id', val: customerId }]
      })
    });
    const progressData = await progressRes.json();
    console.log('Frequency Progress (Stamps):', JSON.stringify(progressData.data, null, 2));
    
    // 4. Fetch loyalty coupons
    const couponsRes = await fetch(`${API_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'loyalty_coupons',
        operation: 'select',
        filters: [{ type: 'eq', col: 'customer_id', val: customerId }]
      })
    });
    const couponsData = await couponsRes.json();
    console.log('Loyalty Coupons:', JSON.stringify(couponsData.data, null, 2));
  } else {
    console.log('Customer not found in database!');
  }
}

run().catch(console.error);
