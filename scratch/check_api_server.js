async function checkApiServer() {
  try {
    // Check if table e_invoices exists in DB via API
    const res = await fetch('http://188.132.198.144:3001/api/e_invoices?limit=1');
    console.log('API /api/e_invoices status:', res.status);
    const data = await res.json();
    console.log('API data:', data);
  } catch (err) {
    console.error('API check error:', err);
  }
}

checkApiServer();
