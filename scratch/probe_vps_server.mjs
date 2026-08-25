import fetch from 'node-fetch';

async function main() {
  console.log('Probing HTTP headers of http://188.132.198.144:3000 ...');
  try {
    const res = await fetch('http://188.132.198.144:3000/');
    console.log('Status:', res.status);
    console.log('Headers:');
    for (const [k, v] of res.headers.entries()) {
      console.log(`  ${k}: ${v}`);
    }
  } catch (err) {
    console.error('Error probing 3000:', err.message);
  }

  console.log('\nProbing HTTP headers of http://188.132.198.144:3001/health ...');
  try {
    const res = await fetch('http://188.132.198.144:3001/health');
    console.log('Status:', res.status);
    console.log('Headers:');
    for (const [k, v] of res.headers.entries()) {
      console.log(`  ${k}: ${v}`);
    }
    const body = await res.text();
    console.log('Health body:', body);
  } catch (err) {
    console.error('Error probing 3001:', err.message);
  }
}

main();
