import fetch from 'node-fetch';

async function main() {
  const branchId = '4e488f4b-669d-4279-8f0d-0fd382fe1d87';
  const screenshotId = 'msralx82i87gfqwlmv';
  console.log(`Testing insert with exact screenshot ID: ${screenshotId}`);

  const payload = {
    table: 'pos_table_halls',
    operation: 'insert',
    data: {
      id: screenshotId,
      branch_id: branchId,
      name: 'salon',
      code: '1',
      sort_order: 0,
      is_active: true
    }
  };

  try {
    const res = await fetch('http://188.132.198.144:3001/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log(`HTTP Status: ${res.status}`);
    const resData = await res.json();
    console.log('Response:', JSON.stringify(resData, null, 2));
  } catch (err) {
    console.error('API Error:', err.message);
  }
}

main();
