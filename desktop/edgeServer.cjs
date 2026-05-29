const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { readConfig } = require('./terminalConfig.cjs');
const { 
  getCatalogCache, 
  setCatalogCache, 
  enqueueWrite, 
  getQueueSize 
} = require('./sqliteStore.cjs');

let httpServer = null;
let wss = null;
let connectedSlaves = new Map();

// TTL policy based on table names
const TTL = {
  sale_items: 30 * 60 * 1000,
  sale_categories: 60 * 60 * 1000,
  pos_table_halls: 60 * 60 * 1000,
  pos_table_sections: 60 * 60 * 1000,
  pos_tables: 60 * 60 * 1000,
  sales_channels: 60 * 60 * 1000,
  taxes: 120 * 60 * 1000,
  settings: 2 * 60 * 1000,
  default: 15 * 60 * 1000
};

function getTtl(tableName) {
  return TTL[tableName] || TTL.default;
}

function startEdgeServer(railwayQueryFn) {
  // Setup Express App
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/lan/health', (req, res) => {
    const config = readConfig() || {};
    res.json({
      ok: true,
      role: config.terminalRole || 'master',
      branchId: config.branchId || null,
      queueSize: getQueueSize(),
      timestamp: Date.now()
    });
  });

  app.post('/lan/query', async (req, res) => {
    const config = readConfig() || {};
    const branchId = config.branchId;
    
    const reqBranchId = req.headers['x-branch-id'];
    const terminalId = req.headers['x-terminal-id'];

    if (!reqBranchId || reqBranchId !== branchId) {
      return res.status(403).json({ error: 'Branch ID mismatch or not provided' });
    }

    const body = req.body || {};
    const { table, operation, select = '*', filters = [] } = body;

    // READ işlemi
    if (operation === 'select') {
      const cacheKey = `table:${JSON.stringify(filters)}:${select}`;
      const cached = getCatalogCache(cacheKey);

      if (cached) {
        return res.json(cached);
      }

      try {
        const result = await railwayQueryFn(body);
        if (result && !result.error && result.data) {
          setCatalogCache(cacheKey, branchId, table, result, getTtl(table));
        }
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ error: err.message, data: null });
      }
    }

    // WRITE işlemi
    try {
      const result = await railwayQueryFn(body);
      
      if (result && !result.error) {
         broadcastTableUpdate(table, terminalId || 'master-proxy');
         return res.json(result);
      } else {
         return res.json(result);
      }
    } catch (err) {
      // Ağ hatası veya ulaşılamaz
      enqueueWrite(body, terminalId || 'master-proxy');
      return res.json({ data: null, error: null, queued: true });
    }
  });

  httpServer = app.listen(4000, '0.0.0.0', () => {
    console.log('[EdgeServer] HTTP Server listening on port 4000');
  });

  // Setup WebSocket Server
  wss = new WebSocketServer({ port: 4001, host: '0.0.0.0' });
  
  wss.on('connection', (ws, req) => {
    // ws.readyState checks happen natively when sending
    const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
    const terminalId = urlParams.get('terminalId') || `unknown-${Date.now()}`;
    
    connectedSlaves.set(terminalId, ws);
    console.log(`[EdgeServer] WS Connected: ${terminalId}`);

    ws.on('close', () => {
      connectedSlaves.delete(terminalId);
      console.log(`[EdgeServer] WS Disconnected: ${terminalId}`);
    });
  });

  console.log('[EdgeServer] WebSocket Server listening on port 4001');

  return { httpServer, wss };
}

function stopEdgeServer() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
}

function broadcastTableUpdate(table, sourceTerminalId) {
  if (!wss) return;

  const msg = JSON.stringify({
    type: 'TABLE_UPDATED',
    table,
    sourceTerminalId,
    timestamp: Date.now()
  });

  wss.clients.forEach(client => {
    if (client.readyState === 1 /* ws.OPEN */) {
      client.send(msg);
    }
  });
}

module.exports = { startEdgeServer, stopEdgeServer, broadcastTableUpdate };
