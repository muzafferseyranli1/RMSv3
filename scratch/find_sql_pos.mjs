import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlPath = path.join(__dirname, '..', 'schema-railway-master.sql');
const content = fs.readFileSync(sqlPath, 'utf8');

const pos = 109496;
const snippet = content.substring(pos - 200, pos + 200);
console.log('Snippet around position 109496:');
console.log(snippet);
