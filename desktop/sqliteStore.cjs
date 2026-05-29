const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let dbInstance = null;

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  let userDataPath;
  try {
    userDataPath = app.getPath('userData');
  } catch (e) {
    // Regular Node.js environment fallback (tests, scripts, scratch runs)
    userDataPath = path.resolve(__dirname, '..', 'scratch');
  }

  const dbPath = path.join(userDataPath, 'pos-local.db');
  dbInstance = new Database(dbPath);

  // Set Pragmas
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('synchronous = NORMAL');

  // Initialize schema
  initSchema(dbInstance);

  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_cache (
      cache_key TEXT PRIMARY KEY,
      branch_id TEXT,
      table_name TEXT,
      data_json TEXT,
      fetched_at INTEGER,
      ttl_ms INTEGER DEFAULT 1800000
    );

    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_json TEXT,
      created_at INTEGER,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sending','done','failed')),
      terminal_id TEXT
    );

    CREATE TABLE IF NOT EXISTS terminal_registry (
      terminal_id TEXT PRIMARY KEY,
      terminal_role TEXT,
      terminal_name TEXT,
      lan_ip TEXT,
      last_seen_at INTEGER,
      is_connected INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS open_tickets_mirror (
      branch_id TEXT,
      table_key TEXT,
      ticket_json TEXT,
      updated_at INTEGER,
      PRIMARY KEY(branch_id, table_key)
    );
  `);
}

function setCatalogCache(cacheKey, branchId, tableName, data, ttlMs = 1800000) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO catalog_cache (cache_key, branch_id, table_name, data_json, fetched_at, ttl_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const dataJson = typeof data === 'string' ? data : JSON.stringify(data);
  stmt.run(cacheKey, branchId, tableName, dataJson, Date.now(), ttlMs);
}

function getCatalogCache(cacheKey) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM catalog_cache WHERE cache_key = ?').get(cacheKey);
  if (!row) {
    return null;
  }

  const now = Date.now();
  const isExpired = (now - row.fetched_at) > row.ttl_ms;
  if (isExpired) {
    db.prepare('DELETE FROM catalog_cache WHERE cache_key = ?').run(cacheKey);
    return null;
  }

  try {
    return JSON.parse(row.data_json);
  } catch (e) {
    return row.data_json;
  }
}

function enqueueWrite(queryBody, terminalId) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO offline_queue (query_json, created_at, status, terminal_id)
    VALUES (?, ?, 'pending', ?)
  `);
  const queryJson = typeof queryBody === 'string' ? queryBody : JSON.stringify(queryBody);
  const info = stmt.run(queryJson, Date.now(), terminalId);
  return info.lastInsertRowid;
}

function getPendingWrites(limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM offline_queue 
    WHERE status = 'pending' 
    ORDER BY id ASC 
    LIMIT ?
  `).all(limit);
}

function markWriteDone(id) {
  const db = getDb();
  db.prepare("UPDATE offline_queue SET status = 'done' WHERE id = ?").run(id);
}

function markWriteFailed(id, errorMsg) {
  const db = getDb();
  const row = db.prepare('SELECT retry_count FROM offline_queue WHERE id = ?').get(id);
  if (!row) return;

  const nextRetryCount = row.retry_count + 1;
  const nextStatus = nextRetryCount >= 5 ? 'failed' : 'pending';

  db.prepare(`
    UPDATE offline_queue 
    SET retry_count = ?, last_error = ?, status = ? 
    WHERE id = ?
  `).run(nextRetryCount, errorMsg, nextStatus, id);
}

function getQueueSize() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM offline_queue WHERE status = 'pending'").get();
  return row ? row.count : 0;
}

function upsertTicketMirror(branchId, tableKey, ticketData) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO open_tickets_mirror (branch_id, table_key, ticket_json, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  const ticketJson = typeof ticketData === 'string' ? ticketData : JSON.stringify(ticketData);
  stmt.run(branchId, tableKey, ticketJson, Date.now());
}

module.exports = {
  getDb,
  setCatalogCache,
  getCatalogCache,
  enqueueWrite,
  getPendingWrites,
  markWriteDone,
  markWriteFailed,
  getQueueSize,
  upsertTicketMirror
};
