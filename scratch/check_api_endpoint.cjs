async function testEndpoint(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[${url}] Status: ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log(`[${url}] Success! Count:`, data?.data?.length, "Data sample:", data?.data?.slice(0, 2));
  } catch (e) {
    console.log(`[${url}] Error: ${e.message}`);
  }
}

async function main() {
  await testEndpoint('https://rms-api-production-219d.up.railway.app/api/equipment/instances');
  await testEndpoint('http://localhost:3001/api/equipment/instances');
  await testEndpoint('http://localhost:5173/api/equipment/instances');
}

main();
