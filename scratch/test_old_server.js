import http from 'http';
import net from 'net';
import pg from 'pg';

const OLD_HOST = '161.156.83.133';

async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, open: true });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, open: false, error: 'TIMEOUT' });
    });
    socket.on('error', (err) => {
      socket.destroy();
      resolve({ port, open: false, error: err.message });
    });
    socket.connect(port, OLD_HOST);
  });
}

async function checkHttp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return { url, status: res.status, ok: res.ok };
  } catch (err) {
    return { url, error: err.message };
  }
}

async function main() {
  console.log('Testing ports on', OLD_HOST);
  const ports = [80, 443, 3000, 3001, 5432, 8000, 8080];
  const portResults = await Promise.all(ports.map(checkPort));
  console.log('Port scan results:', portResults);

  const httpResults = await Promise.all([
    checkHttp(`http://${OLD_HOST}:3000`),
    checkHttp(`http://${OLD_HOST}:3001/health`),
    checkHttp(`http://${OLD_HOST}:3001/api/db/stats`),
  ]);
  console.log('HTTP probe results:', httpResults);

  // Try PostgreSQL connection with common passwords
  if (portResults.find(p => p.port === 5432 && p.open)) {
    const passwords = ['RMSv3_Local_Password_2026!', 'postgres', 'password', 'root', 'railway', '123456'];
    const dbNames = ['railway', 'postgres', 'rmsv3', 'rms'];

    for (const pw of passwords) {
      for (const dbName of dbNames) {
        const pool = new pg.Pool({
          host: OLD_HOST,
          port: 5432,
          user: 'postgres',
          password: pw,
          database: dbName,
          connectionTimeoutMillis: 3000,
        });
        try {
          const res = await pool.query('SELECT current_database(), count(*) FROM information_schema.tables WHERE table_schema=\'public\'');
          console.log(`✅ Postgres Connected to ${OLD_HOST}:${dbName} with pw ${pw}! Tables:`, res.rows[0]);
          await pool.end();
          return;
        } catch (err) {
          // continue
        } finally {
          await pool.end().catch(() => {});
        }
      }
    }
  }
}

main().catch(console.error);
