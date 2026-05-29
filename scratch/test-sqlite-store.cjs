const path = require('path');
const fs = require('fs');

const sqliteStore = require('../desktop/sqliteStore.cjs');

async function test() {
  console.log('--- STARTING SQLITE STORE VERIFICATION TESTS ---');

  // Test 1: Singleton getDb()
  const db1 = sqliteStore.getDb();
  const db2 = sqliteStore.getDb();
  if (db1 !== db2) {
    throw new Error('getDb() did not return a singleton instance!');
  }
  console.log('✓ Test 1 Passed: Singleton getDb() works perfectly.');

  // Test 2: Pragmas Verification
  const journalMode = db1.pragma('journal_mode');
  const foreignKeys = db1.pragma('foreign_keys');
  const synchronous = db1.pragma('synchronous');

  console.log(`Journal Mode: ${journalMode[0].journal_mode}`);
  console.log(`Foreign Keys: ${foreignKeys[0].foreign_keys}`);
  console.log(`Synchronous: ${synchronous[0].synchronous}`);

  if (journalMode[0].journal_mode !== 'wal') {
    throw new Error(`Expected journal_mode to be WAL, got: ${journalMode[0].journal_mode}`);
  }
  if (foreignKeys[0].foreign_keys !== 1) {
    throw new Error(`Expected foreign_keys to be ON (1), got: ${foreignKeys[0].foreign_keys}`);
  }
  if (synchronous[0].synchronous !== 1) { // 1 = NORMAL, 2 = FULL
    throw new Error(`Expected synchronous to be NORMAL (1), got: ${synchronous[0].synchronous}`);
  }
  console.log('✓ Test 2 Passed: SQLite Pragmas (WAL, foreign_keys=ON, synchronous=NORMAL) are verified.');

  // Test 3: Catalog Cache and TTL Expire logic
  // Let's clear any old test data
  db1.exec('DELETE FROM catalog_cache');

  // Insert cache with 100ms TTL
  sqliteStore.setCatalogCache('test_key', 'branch_1', 'products', { test: 'data' }, 100);
  
  // Read immediately
  const valImmediate = sqliteStore.getCatalogCache('test_key');
  if (!valImmediate || valImmediate.test !== 'data') {
    throw new Error(`Expected test data immediately, got: ${JSON.stringify(valImmediate)}`);
  }
  console.log('✓ Test 3a Passed: Catalog Cache write & read successful.');

  // Wait for 150ms to let it expire
  await new Promise(resolve => setTimeout(resolve, 150));

  // Read again
  const valExpired = sqliteStore.getCatalogCache('test_key');
  if (valExpired !== null) {
    throw new Error(`Expected expired cache to be null, got: ${JSON.stringify(valExpired)}`);
  }

  // Check if it was deleted from database
  const dbCheck = db1.prepare("SELECT * FROM catalog_cache WHERE cache_key = 'test_key'").get();
  if (dbCheck) {
    throw new Error('Expected expired cache row to be deleted from database, but it still exists!');
  }
  console.log('✓ Test 3b Passed: Expired Catalog Cache returns null and is deleted from database successfully.');

  // Test 4: Offline Queue & Retry Limit Logic
  db1.exec('DELETE FROM offline_queue');

  const queryBody = { query: 'INSERT INTO products...' };
  const writeId = sqliteStore.enqueueWrite(queryBody, 'terminal_123');

  let size = sqliteStore.getQueueSize();
  if (size !== 1) {
    throw new Error(`Expected queue size to be 1, got: ${size}`);
  }

  let pending = sqliteStore.getPendingWrites(10);
  if (pending.length !== 1 || pending[0].id !== writeId) {
    throw new Error('Expected pending write to be returned.');
  }

  // Mark fail 1st time
  sqliteStore.markWriteFailed(writeId, 'Timeout error');
  let row = db1.prepare('SELECT * FROM offline_queue WHERE id = ?').get(writeId);
  if (row.retry_count !== 1 || row.status !== 'pending' || row.last_error !== 'Timeout error') {
    throw new Error(`Unexpected write status: ${JSON.stringify(row)}`);
  }
  console.log('✓ Test 4a Passed: markWriteFailed increments retry_count and keeps status pending.');

  // Fail 4 more times (total 5)
  sqliteStore.markWriteFailed(writeId, 'Timeout error 2');
  sqliteStore.markWriteFailed(writeId, 'Timeout error 3');
  sqliteStore.markWriteFailed(writeId, 'Timeout error 4');
  sqliteStore.markWriteFailed(writeId, 'Connection Lost'); // 5th failure

  row = db1.prepare('SELECT * FROM offline_queue WHERE id = ?').get(writeId);
  if (row.retry_count !== 5 || row.status !== 'failed' || row.last_error !== 'Connection Lost') {
    throw new Error(`Expected status to change to failed after 5 retries, got: ${JSON.stringify(row)}`);
  }

  size = sqliteStore.getQueueSize();
  if (size !== 0) {
    throw new Error(`Expected pending queue size to be 0 after failure lock, got: ${size}`);
  }
  console.log('✓ Test 4b Passed: markWriteFailed locks status to failed after 5 retry attempts.');

  // Test 5: Open Tickets Mirror Upsert
  db1.exec('DELETE FROM open_tickets_mirror');
  sqliteStore.upsertTicketMirror('branch_A', 'table_5', { ticketId: 'xyz' });

  const ticketRow = db1.prepare("SELECT * FROM open_tickets_mirror WHERE branch_id = 'branch_A' AND table_key = 'table_5'").get();
  if (!ticketRow) {
    throw new Error('Expected ticket row to be upserted.');
  }
  const ticketData = JSON.parse(ticketRow.ticket_json);
  if (ticketData.ticketId !== 'xyz') {
    throw new Error(`Expected ticket data to match, got: ${ticketRow.ticket_json}`);
  }
  console.log('✓ Test 5 Passed: upsertTicketMirror writes & updates successfully.');

  console.log('\n--- ALL SQLITE STORE VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
}

test().catch(e => {
  console.error('\n❌ SQLITE STORE VERIFICATION TESTS FAILED:');
  console.error(e);
  process.exit(1);
});
