import fetch from 'node-fetch';

async function main() {
  console.log('Testing VPS API: http://188.132.198.144:3001/api/query ...');
  try {
    const res = await fetch('http://188.132.198.144:3001/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'sale_lines',
        operation: 'select',
        select: '*',
        options: { limit: 5 }
      })
    });
    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    console.log('API Response data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error fetching API:', err.message);
  }
}

main();
