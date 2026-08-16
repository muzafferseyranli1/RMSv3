const token = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const deployUuid = '98svqiyabcufqomem3vpeczw';

async function monitor() {
  console.log('Sunucudaki Dockerfile derlemesi ve canlı versiyon güncellemesi izleniyor...');
  const start = Date.now();

  while (Date.now() - start < 240000) {
    await new Promise(r => setTimeout(r, 6000));
    try {
      const res = await fetch('http://188.132.198.144:8000/api/v1/deployments/' + deployUuid, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[${elapsed}s] Coolify Derleme Durumu: ${data.status}`);

      const htmlRes = await fetch('http://188.132.198.144:3000', { signal: AbortSignal.timeout(4000) });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const scriptMatch = html.match(/src="\/assets\/(index-[^"]+)"/);
        const currentScript = scriptMatch ? scriptMatch[1] : 'unknown';
        console.log(`    Canlıdaki Aktif Script: ${currentScript}`);

        if (currentScript !== 'index-l6QO7bfX.js') {
          console.log('\n🎉 BAŞARILI! Canlı ortam yenilendi ve güncel koda geçiş yaptı!');
          console.log(`Yeni Canlı Script: ${currentScript}`);
          return;
        }
      }
    } catch (e) {
      console.log('Bekleniyor...', e.message);
    }
  }
}

monitor();
