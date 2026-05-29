const dns = require('dns');
const { 
  getPendingWrites, 
  markWriteDone, 
  markWriteFailed 
} = require('./sqliteStore.cjs');

let wasOnline = true; // başlangıç
let syncInProgress = false;

async function flushQueue(railwayQueryFn) {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    const pending = getPendingWrites(50);
    for (const entry of pending) {
      let queryObj;
      try {
        queryObj = JSON.parse(entry.query_json);
      } catch (e) {
        queryObj = entry.query_json;
      }

      try {
        const result = await railwayQueryFn(queryObj);
        
        if (result && result.error) {
          // If query fails on server-side logic
          const errMsg = result.error.message || JSON.stringify(result.error);
          markWriteFailed(entry.id, errMsg);
        } else {
          markWriteDone(entry.id);
        }
      } catch (err) {
        const errMsg = err.message || '';
        markWriteFailed(entry.id, errMsg);

        // Network error detection: ENOTFOUND or ECONNREFUSED
        if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED')) {
          console.log(`[SyncWorker] Network error detected: ${errMsg}. Stopping flush loop.`);
          break; // Stop processing the queue
        }
      }
    }
  } catch (err) {
    console.error('[SyncWorker] Error during flushQueue:', err);
  } finally {
    syncInProgress = false;
  }
}

function initSyncWorker(railwayQueryFn) {
  const host = 'rms-api-production-219d.up.railway.app';

  function check() {
    dns.lookup(host, (err) => {
      const isOnline = !err;

      // isOnline status transition logic
      if (wasOnline && !isOnline) {
        console.log('[SyncWorker] Network connection lost. Offline mode active.');
        wasOnline = false;
      } else if (!wasOnline && isOnline) {
        console.log('[SyncWorker] Network connection restored. Online mode active. Flushing queue...');
        wasOnline = true;
        flushQueue(railwayQueryFn);
      } else if (isOnline) {
        wasOnline = true;
      } else {
        wasOnline = false;
      }

      setTimeout(check, 30000);
    });
  }

  // Initial check start
  setTimeout(check, 30000);
}

module.exports = { initSyncWorker, flushQueue };
