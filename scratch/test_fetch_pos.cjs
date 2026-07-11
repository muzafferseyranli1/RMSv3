const http = require('http');

http.get('http://localhost:5173/src/components/pages/POS.jsx', (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Content (first 200 chars):');
    console.log(data.substring(0, 200));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
