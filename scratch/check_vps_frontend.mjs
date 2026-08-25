import fetch from 'node-fetch';

async function main() {
  console.log('Fetching live frontend index.html from http://188.132.198.144:3000 ...');
  try {
    const res = await fetch('http://188.132.198.144:3000/');
    const html = await res.text();
    console.log('HTML Length:', html.length);
    
    // Extract script tags
    const scriptMatches = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
    console.log('Script files referenced in index.html:', scriptMatches);

    for (const scriptPath of scriptMatches) {
      const fullUrl = scriptPath.startsWith('http') ? scriptPath : `http://188.132.198.144:3000${scriptPath}`;
      console.log(`\nFetching bundle: ${fullUrl}`);
      const jsRes = await fetch(fullUrl);
      const jsText = await jsRes.text();
      console.log(`Bundle size: ${jsText.length} bytes`);

      // Search for indicator of our new code vs old code
      const hasToString36Fallback = jsText.includes('toString(36).slice(2, 12)');
      const hasUuidV4Fallback = jsText.includes('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
      console.log(`- Has old fallback (toString(36).slice(2, 12)): ${hasToString36Fallback}`);
      console.log(`- Has new fallback (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx): ${hasUuidV4Fallback}`);
    }

  } catch (err) {
    console.error('Error fetching frontend:', err.message);
  }
}

main();
