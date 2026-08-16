async function test() {
  const html80 = await fetch('http://188.132.198.144').then(r => r.text());
  const match80 = html80.match(/src="\/assets\/(index-[^"]+)"/);
  console.log('Live Port 80 Script:', match80 ? match80[1] : 'unknown');

  try {
    const html3000 = await fetch('http://188.132.198.144:3000', { signal: AbortSignal.timeout(3000) }).then(r => r.text());
    const match3000 = html3000.match(/src="\/assets\/(index-[^"]+)"/);
    console.log('Live Port 3000 Script:', match3000 ? match3000[1] : 'unknown');
  } catch(e) {
    console.log('Port 3000 status:', e.message);
  }
}

test();
