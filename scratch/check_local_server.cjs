const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    }).on('error', reject);
  });
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
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
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
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
    const health = await get('http://localhost:3001/health');
    console.log('Local server health status:', health);
    
    if (health.status === 200) {
      const selectRes = await post('http://localhost:3001/api/query', {
        table: 'tasks',
        operation: 'select',
        select: '*',
        filters: [{ type: 'limit', val: 1 }]
      });
      console.log('Keys from local server tasks query:');
      if (selectRes.body && selectRes.body.data && selectRes.body.data.length > 0) {
        console.log(Object.keys(selectRes.body.data[0]));
        console.log('Full row:', selectRes.body.data[0]);
      } else {
        console.log(selectRes);
      }
    }
  } catch (e) {
    console.log('Local server is not running or error connecting:', e.message);
  }
}

main();
