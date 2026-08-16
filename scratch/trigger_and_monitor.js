const token = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const deployUuid = 'olwoki8he70mplre53jb6zyj';

async function monitor() {
  console.log('Monitoring domain update deployment:', deployUuid);
  const start = Date.now();
  while (Date.now() - start < 180000) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch('http://188.132.198.144:8000/api/v1/deployments/' + deployUuid, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const sData = await statusRes.json();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[${elapsed}s] Status: ${sData.status}`);

    if (sData.status === 'finished' || sData.status === 'failed') {
      console.log('\n=== FINAL BUILD RESULT ===');
      console.log('Status:', sData.status);
      console.log('Finished At:', sData.finished_at);
      break;
    }
  }
}

monitor();
