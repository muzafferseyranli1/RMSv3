const fs = require('fs');
const glob = require('glob');
const files = glob.sync('X:/RMSv3/src/**/*.{js,jsx}');
let changed = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/([a-zA-Z0-9_]+)(\??)\.type\s*===\s*'sube'/g, (match, p1, p2) => {
    if (content.includes('anadepo')) return match;
    return `${match} || ${p1}${p2}.type === 'anadepo' || ${p1}${p2}.type === 'mutfak'`;
  });
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated', file);
    changed++;
  }
}
console.log('Total files changed:', changed);

