import fetch from 'node-fetch';

async function testCoolifyApi() {
  console.log('Testing Coolify API at http://188.132.198.144:8000 ...');
  
  // 1. Test GET /
  try {
    const res = await fetch('http://188.132.198.144:8000/');
    console.log('GET / status:', res.status);
  } catch (err) {
    console.error('Error fetching GET /:', err.message);
  }

  // 2. Test GET /api/v1/projects
  try {
    const res = await fetch('http://188.132.198.144:8000/api/v1/projects');
    console.log('GET /api/v1/projects status:', res.status);
    const text = await res.text();
    console.log('Response:', text.slice(0, 200));
  } catch (err) {
    console.error('Error fetching projects:', err.message);
  }
}

testCoolifyApi();
