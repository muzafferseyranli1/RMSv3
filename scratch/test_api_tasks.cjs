const https = require('https');

function post(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(raw || `HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  try {
    // 1. Try to insert with created_by_personel_id (single 'l')
    const res = await post('https://rms-api-production-219d.up.railway.app/api/query', {
      table: 'tasks',
      operation: 'insert',
      data: {
        id: '00000000-0000-0000-0000-000000000003',
        title: 'REST API Test Single L Task',
        status: 'open',
        timezone: 'Europe/Istanbul',
        created_by_personel_id: 'system', // <--- Single 'l'
        updated_at: new Date().toISOString()
      }
    });
    console.log('Insert with created_by_personel_id (single l) result:');
    console.log(res);

    // If success, delete it
    if (res.data) {
      const delRes = await post('https://rms-api-production-219d.up.railway.app/api/query', {
        table: 'tasks',
        operation: 'delete',
        filters: [{ type: 'eq', col: 'id', val: '00000000-0000-0000-0000-000000000003' }]
      });
      console.log('Delete result:', delRes);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
