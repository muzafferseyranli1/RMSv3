const token = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const deployUuid = 'gkhdowoafjq9q9e3ifaeouzj';

async function test() {
  const res = await fetch('http://188.132.198.144:8000/api/v1/deployments/' + deployUuid, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  console.log('Status:', data.status, 'Finished at:', data.finished_at);

  const html80 = await fetch('http://188.132.198.144').then(r => r.text());
  const match80 = html80.match(/src="\/assets\/(index-[^"]+)"/);
  console.log('Live Port 80 Script:', match80 ? match80[1] : 'unknown');

  const html3000 = await fetch('http://188.132.198.144:3000').then(r => r.text());
  const match3000 = html3000.match(/src="\/assets\/(index-[^"]+)"/);
  console.log('Live Port 3000 Script:', match3000 ? match3000[1] : 'unknown');
}

test();
