import fetch from 'node-fetch';

async function main() {
  console.log('Fetching GET http://188.132.198.144:3001/ ...');
  try {
    const res = await fetch('http://188.132.198.144:3001/');
    console.log('Status:', res.status);
    const body = await res.text();
    console.log('Body:', body.slice(0, 300));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
