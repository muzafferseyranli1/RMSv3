const token = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const uuid = 'l145ib0q8wdcd1s1xr2jtouc';

async function test() {
  console.log('Deploying via Coolify API...');
  const res = await fetch('http://188.132.198.144:8000/api/v1/deploy?uuid=' + uuid + '&force=true', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
  });
  console.log('Trigger status:', res.status);
  const data = await res.json();
  console.log('Deploy response:', data);
  const deployUuid = data.deployments?.[0]?.deployment_uuid;

  if (deployUuid) {
    console.log('Polling deployment UUID:', deployUuid);
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
        console.log('Logs Tail:\n', (sData.logs || '').slice(-2000));
        break;
      }
    }
  }
}

test();
