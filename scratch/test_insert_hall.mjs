import fetch from 'node-fetch';
import { generateUuid } from '../src/lib/uuid.js';

async function main() {
  const branchId = '4e488f4b-669d-4279-8f0d-0fd382fe1d87';
  const hallId = generateUuid();
  console.log(`Generated UUID for new hall: ${hallId}`);

  const payload = {
    table: 'pos_table_halls',
    operation: 'insert',
    data: {
      id: hallId,
      branch_id: branchId,
      name: 'Test Salon ' + Date.now().toString(36),
      code: '007',
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
