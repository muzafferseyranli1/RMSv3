const sqliteStore = require('../desktop/sqliteStore.cjs');
const syncWorker = require('../desktop/syncWorker.cjs');

async function test() {
  console.log('--- STARTING SYNC WORKER VERIFICATION TESTS ---');

  const db = sqliteStore.getDb();
  
  // Clean tables
  db.exec('DELETE FROM offline_queue');

  // Insert 3 test query writes
  sqliteStore.enqueueWrite({ query: 'INSERT 1' }, 'term_1');
  sqliteStore.enqueueWrite({ query: 'INSERT 2' }, 'term_1');
  sqliteStore.enqueueWrite({ query: 'INSERT 3' }, 'term_1');

  let size = sqliteStore.getQueueSize();
  if (size !== 3) {
    throw new Error(`Expected queue size to be 3, got: ${size}`);
  }
  console.log('✓ Test Setup: Enqueued 3 test writes.');

  // Test 1: Successful Sync Case
  const resolvedQueries = [];
  const mockSuccessFn = async (queryObj) => {
    resolvedQueries.push(queryObj);
    return { data: 'success', error: null };
  };

  await syncWorker.flushQueue(mockSuccessFn);

  size = sqliteStore.getQueueSize();
  if (size !== 0) {
    throw new Error(`Expected queue size to be 0 after successful sync, got: ${size}`);
  }
  if (resolvedQueries.length !== 3 || resolvedQueries[0].query !== 'INSERT 1') {
    throw new Error(`Unexpected resolved queries: ${JSON.stringify(resolvedQueries)}`);
  }
  console.log('✓ Test 1 Passed: flushQueue successfully flushes all pending queries to Railway.');

  // Test 2: Query Business Error Case
  db.exec('DELETE FROM offline_queue');
  const errId = sqliteStore.enqueueWrite({ query: 'INSERT ERROR' }, 'term_1');

  const mockFailFn = async (queryObj) => {
    return { data: null, error: { message: 'Constraint Violation' } };
  };

  await syncWorker.flushQueue(mockFailFn);

  // Status should be pending since it failed only once (not locked to failed yet)
  size = sqliteStore.getQueueSize();
  if (size !== 1) {
    throw new Error(`Expected queue size to be 1 after single failure, got: ${size}`);
  }
  const failedRow = db.prepare('SELECT * FROM offline_queue WHERE id = ?').get(errId);
  if (failedRow.retry_count !== 1 || failedRow.last_error !== 'Constraint Violation' || failedRow.status !== 'pending') {
    throw new Error(`Unexpected failed row: ${JSON.stringify(failedRow)}`);
  }
  console.log('✓ Test 2 Passed: flushQueue handles query business errors and marks writes failed correctly.');

  // Test 3: Network Connection Lost Case (Break loop)
  db.exec('DELETE FROM offline_queue');
  const id1 = sqliteStore.enqueueWrite({ query: 'NET 1' }, 'term_1');
  const id2 = sqliteStore.enqueueWrite({ query: 'NET 2' }, 'term_1');

  let callCount = 0;
  const mockNetworkErrorFn = async (queryObj) => {
    callCount++;
    throw new Error('connect ENOTFOUND api.railway.app');
  };

  await syncWorker.flushQueue(mockNetworkErrorFn);

  // The sync loop should immediately stop on the first entry due to ENOTFOUND!
  // Therefore callCount should be exactly 1, even though there are 2 pending writes!
  if (callCount !== 1) {
    throw new Error(`Expected callCount to be 1 due to loop breaking, got: ${callCount}`);
  }

  const row1 = db.prepare('SELECT * FROM offline_queue WHERE id = ?').get(id1);
  const row2 = db.prepare('SELECT * FROM offline_queue WHERE id = ?').get(id2);

  if (row1.retry_count !== 1 || !row1.last_error.includes('ENOTFOUND')) {
    throw new Error(`Expected write 1 to fail, got: ${JSON.stringify(row1)}`);
  }
  if (row2.retry_count !== 0 || row2.last_error !== null) {
    throw new Error(`Expected write 2 to be skipped entirely, got: ${JSON.stringify(row2)}`);
  }
  console.log('✓ Test 3 Passed: flushQueue immediately breaks the loop when a network error (ENOTFOUND) occurs.');

  console.log('\n--- ALL SYNC WORKER VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
}

test().catch(e => {
  console.error('\n❌ SYNC WORKER VERIFICATION TESTS FAILED:');
  console.error(e);
  process.exit(1);
});
