import fetch from 'node-fetch';

async function main() {
  console.log('Checking Coolify panel at http://188.132.198.144:8000 ...');
  try {
    const res = await fetch('http://188.132.198.144:8000/api/v1/deploy', { method: 'GET' });
    console.log('Coolify deploy endpoint HTTP Status:', res.status);
    const text = await res.text();
    console.log('Response:', text.slice(0, 300));
  } catch (err) {
    console.error('Coolify check error:', err.message);
  }
}

main();
