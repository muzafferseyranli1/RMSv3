async function checkWeb() {
  try {
    const res = await fetch('http://188.132.198.144:3000/');
    const html = await res.text();
    console.log('Status:', res.status);
    console.log('HTML preview:\n', html.slice(0, 800));

    // Find script tags
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    let match;
    const scripts = [];
    while ((match = scriptRegex.exec(html)) !== null) {
      scripts.push(match[1]);
    }
    console.log('Scripts in HTML:', scripts);

    for (const src of scripts) {
      const fullUrl = src.startsWith('http') ? src : `http://188.132.198.144:3000${src}`;
      console.log('\nChecking asset:', fullUrl);
      const sRes = await fetch(fullUrl);
      if (sRes.ok) {
        const text = await sRes.text();
        console.log('Asset size:', text.length, 'bytes');
        console.log('Contains einvoice or EInvoice:', text.includes('einvoice') || text.includes('EInvoice') || text.includes('E-Fatura'));
        console.log('Contains matchingEngine:', text.includes('matchingEngine'));
      } else {
        console.log('Asset fetch failed with status:', sRes.status);
      }
    }
  } catch (err) {
    console.error('Error fetching web:', err);
  }
}

checkWeb();
