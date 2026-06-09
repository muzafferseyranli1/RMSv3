const http = require('http');

const url = 'http://localhost:3001/api/manual/pages/1060c447-07d5-4aa1-9ee9-8c98343c4ec8/context';

http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      console.log('Status:', res.statusCode);
      console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
    } catch (err) {
      console.log('Raw output:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error calling local API:', err.message);
});
