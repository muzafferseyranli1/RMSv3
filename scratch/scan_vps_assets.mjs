import fetch from 'node-fetch';

async function main() {
  console.log('Fetching main bundle from http://188.132.198.144:3000/assets/index-l6QO7bfX.js ...');
  try {
    const jsRes = await fetch('http://188.132.198.144:3000/assets/index-l6QO7bfX.js');
    const jsText = await jsRes.text();
    
    // Find all asset URLs referenced in main bundle
    const matches = [...jsText.matchAll(/assets\/[a-zA-Z0-9_\-]+\.js/g)].map(m => m[0]);
    const uniqueAssets = [...new Set(matches)];
    console.log(`Found ${uniqueAssets.length} chunk files referenced in main bundle:`);
    console.log(uniqueAssets.filter(a => a.includes('TableManagement') || a.includes('posTableCatalogService') || a.includes('uuid')));

    for (const assetPath of uniqueAssets) {
      if (!assetPath.includes('TableManagement') && !assetPath.includes('posTableCatalogService') && !assetPath.includes('uuid')) {
        continue;
      }
      const fullUrl = `http://188.132.198.144:3000/${assetPath}`;
      console.log(`\nFetching chunk: ${fullUrl}`);
      const chunkRes = await fetch(fullUrl);
      const chunkText = await chunkRes.text();
      console.log(`Chunk status: ${chunkRes.status}, size: ${chunkText.length}`);

      const hasOld = chunkText.includes('slice(2, 12)');
      const hasNew = chunkText.includes('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
      console.log(`-> Has OLD code (slice(2, 12)): ${hasOld}`);
      console.log(`-> Has NEW code (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx): ${hasNew}`);
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
