import fs from 'fs';
import path from 'path';

const searchTerms = [
  "from('musteriler')",
  "from(\"musteriler\")",
  "personnel_records"
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      const isExcluded = 
        file.startsWith('.') || 
        file === 'node_modules' || 
        file === 'dist' || 
        file === 'dist_old' ||
        file.startsWith('temp-dist') || 
        file === 'release';
        
      if (!isExcluded) {
        results = results.concat(walk(fullPath));
      }
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const foldersToSearch = [
  'X:\\\\RMSv3\\src',
  'X:\\\\RMSv3\\scripts',
  'X:\\\\RMSv3\\server'
];

const allFiles = [];
foldersToSearch.forEach(folder => {
  if (fs.existsSync(folder)) {
    allFiles.push(...walk(folder));
  }
});

allFiles.forEach(file => {
  if (!file.endsWith('.js') && !file.endsWith('.jsx') && !file.endsWith('.mjs')) return;
  try {
    const content = fs.readFileSync(file, 'utf8');
    searchTerms.forEach(term => {
      if (content.includes(term)) {
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes(term)) {
            console.log(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    });
  } catch (err) {
    // Ignore read errors
  }
});

