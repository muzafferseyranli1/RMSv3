const http = require('http');
const url = require('url');

const visited = new Set();
const errors = [];

function fetchUrl(targetUrl) {
  if (visited.has(targetUrl)) return Promise.resolve();
  visited.add(targetUrl);

  return new Promise((resolve) => {
    http.get(targetUrl, (res) => {
      if (res.statusCode !== 200) {
        errors.push({ url: targetUrl, status: res.statusCode });
        resolve();
        return;
      }

      // We only parse local files in src or node_modules that are JS/JSX/TS/TSX
      const isLocalJs = targetUrl.includes('/src/') || targetUrl.includes('/node_modules/.vite/deps/');
      if (!isLocalJs) {
        resolve();
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const importRegex = /import\s+[\s\S]*?from\s+["']([^"']+)["']/g;
        const dynamicImportRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
        
        const promises = [];
        let match;

        // Helper to queue child fetches
        const queueFetch = (importPath) => {
          if (importPath.startsWith('.') || importPath.startsWith('/')) {
            const absoluteUrl = new url.URL(importPath, targetUrl).toString();
            promises.push(fetchUrl(absoluteUrl));
          }
        };

        while ((match = importRegex.exec(data)) !== null) {
          queueFetch(match[1]);
        }
        while ((match = dynamicImportRegex.exec(data)) !== null) {
          queueFetch(match[1]);
        }

        Promise.all(promises).then(() => resolve());
      });
    }).on('error', (err) => {
      errors.push({ url: targetUrl, error: err.message });
      resolve();
    });
  });
}

const startUrl = 'http://localhost:5173/src/components/pages/POS.jsx';
console.log('Starting recursive dependency check from:', startUrl);

fetchUrl(startUrl).then(() => {
  console.log('\n--- SCAN COMPLETE ---');
  console.log(`Visited ${visited.size} modules.`);
  if (errors.length > 0) {
    console.error('\nFound errors:');
    errors.forEach((err) => {
      console.error(`- URL: ${err.url}`);
      if (err.status) console.error(`  Status: ${err.status}`);
      if (err.error) console.error(`  Error: ${err.error}`);
    });
  } else {
    console.log('\nAll dependencies resolved successfully (200 OK)!');
  }
});
