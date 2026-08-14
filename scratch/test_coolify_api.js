async function testCoolifyApi() {
  try {
    const urls = [
      'http://188.132.198.144:8000/api/v1/applications',
      'http://188.132.198.144:8000/api/v1/projects',
      'http://188.132.198.144:8000/api/v1/deployments',
      'http://188.132.198.144:8000/api/v1/servers',
    ];

    for (const url of urls) {
      console.log('Testing endpoint:', url);
      const res = await fetch(url);
      console.log('Status:', res.status);
      const text = await res.text();
      console.log('Response:', text.slice(0, 300));
    }
  } catch (err) {
    console.error('Coolify API test error:', err);
  }
}

testCoolifyApi();
