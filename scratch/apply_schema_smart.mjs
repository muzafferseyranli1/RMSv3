import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

// Helper to split SQL by semicolon, respecting dollar quotes and single quotes
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inDollar = false;
  let dollarTag = '';

  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inString) {
      current += char;
      if (char === stringChar && sql[i - 1] !== '\\') {
        inString = false;
      }
      i++;
      continue;
    }

    if (inDollar) {
      current += char;
      if (char === '$') {
        const remaining = sql.slice(i);
        if (remaining.startsWith(dollarTag)) {
          current += dollarTag.slice(1);
          i += dollarTag.length;
          inDollar = false;
          continue;
        }
      }
      i++;
      continue;
    }

    // Check for string start
    if (char === "'" || char === '"') {
      inString = true;
      stringChar = char;
      current += char;
      i++;
      continue;
    }

    // Check for dollar quote start ($$ or $tag$)
    if (char === '$') {
      const match = sql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        inDollar = true;
        dollarTag = match[1];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    // Check for statement terminator
    if (char === ';') {
      if (current.trim().length > 0) {
        statements.push(current.trim());
      }
      current = '';
      i++;
      continue;
    }

    current += char;
    i++;
  }

  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements;
}

async function applyMasterSchemaSmart() {
  const dbUrl = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';
  console.log(`Connecting to VPS DB: ${dbUrl}`);
  
  const client = new Client({
    connectionString: dbUrl,
    ssl: false,
  });

  try {
    await client.connect();
    console.log('Connected successfully!');

    const sqlPath = path.join(__dirname, '..', 'schema-railway-master.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Splitting SQL statements...');
    const rawStatements = splitSqlStatements(sqlContent);
    console.log(`Total statements found: ${rawStatements.length}`);

    // Separate CREATE TABLE / CREATE EXTENSION vs rest
    const tableStmts = [];
    const alterStmts = [];
    const indexStmts = [];
    const policyStmts = [];
    const funcStmts = [];
    const otherStmts = [];

    for (const stmt of rawStatements) {
      const s = stmt.toUpperCase().trim();
      if (s.startsWith('--') || s.startsWith('COMMENT ON')) continue;
      if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE EXTENSION')) {
        tableStmts.push(stmt);
      } else if (s.startsWith('ALTER TABLE')) {
        alterStmts.push(stmt);
      } else if (s.startsWith('CREATE INDEX') || s.startsWith('CREATE UNIQUE INDEX')) {
        indexStmts.push(stmt);
      } else if (s.startsWith('CREATE POLICY')) {
        policyStmts.push(stmt);
      } else if (s.startsWith('CREATE FUNCTION') || s.startsWith('CREATE OR REPLACE FUNCTION')) {
        funcStmts.push(stmt);
      } else {
        otherStmts.push(stmt);
      }
    }

    console.log(`Categorized:
    Tables: ${tableStmts.length}
    Functions: ${funcStmts.length}
    Alters: ${alterStmts.length}
    Indexes: ${indexStmts.length}
    Policies: ${policyStmts.length}
    Others: ${otherStmts.length}`);

    const runBatch = async (label, stmts) => {
      console.log(`\nExecuting ${label}...`);
      let success = 0;
      let errors = 0;
      for (const stmt of stmts) {
        try {
          await client.query(stmt);
          success++;
        } catch (err) {
          errors++;
          if (!err.message.includes('already exists')) {
            console.log(`⚠️ Warning in ${label}: ${err.message.split('\n')[0]}`);
          }
        }
      }
      console.log(`Completed ${label}: ${success} succeeded, ${errors} warnings/errors.`);
    };

    await runBatch('1. Tables & Extensions', tableStmts);
    await runBatch('2. Functions & Triggers', funcStmts);
    await runBatch('3. Table Alters', alterStmts);
    await runBatch('4. Indexes', indexStmts);
    await runBatch('5. Policies', policyStmts);
    await runBatch('6. Other Statements', otherStmts);

    console.log('\n✅ Smart schema execution completed!');

  } catch (err) {
    console.error('❌ Error executing master schema:', err);
  } finally {
    await client.end();
  }
}

applyMasterSchemaSmart();
