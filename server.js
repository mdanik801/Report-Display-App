/**
 * ==============================================================================
 * AL MUSLIM GROUP - INDUSTRIAL MONITOR & DIGITAL SIGNAGE DASHBOARD
 * Local LAN Server (server.js) with Centralized Real-Time Data Synchronization
 * ==============================================================================
 * Features:
 *   - Serves static dashboard frontend from 'public/'
 *   - Serves media assets and logo from 'posters/'
 *   - Centralized persistent report storage in 'data/dashboard_data.json'
 *   - Real-time LAN synchronization via Server-Sent Events (SSE) & REST endpoints
 *   - Instant broadcast to all connected TV monitors / PCs on Excel paste
 *   - GET /api/data: Fetch current persistent dashboard state
 *   - POST /api/data: Save and broadcast updated finishing/fabric data & settings
 *   - POST /api/data/reset: Reset module data across all LAN monitors
 *   - GET /api/events: Live SSE event stream for real-time dashboard sync
 *   - GET /api/network: Host machine LAN IPv4 addresses
 *   - GET /api/posters: Auto-scans 'posters/' directory for notice images
 *   - Zero-dependency native Node.js HTTP fallback if Express is not installed
 * ==============================================================================
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const POSTERS_DIR = path.join(__dirname, 'posters');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'dashboard_data.json');

// Ensure directories exist
if (!fs.existsSync(POSTERS_DIR)) fs.mkdirSync(POSTERS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Supported image extensions for notice slideshow
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif']);

// Default Central Dashboard State
let dashboardState = {
  version: 1,
  lastUpdated: new Date().toISOString(),
  lastUpdatedBy: 'system',
  currentModule: 'finishing',
  finishingData: null,
  fabricData: null,
  timingSettings: {
    posterIntervalSeconds: 20,
    noticeDurationSeconds: 15,
    scrollSpeed: 30
  }
};

// Load persistent data from disk
function loadDashboardState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        dashboardState = {
          ...dashboardState,
          ...parsed,
          timingSettings: {
            ...dashboardState.timingSettings,
            ...(parsed.timingSettings || {})
          }
        };
        console.log(`📦 Loaded existing persistent dashboard data (v${dashboardState.version}, last updated: ${dashboardState.lastUpdated})`);
      }
    } else {
      saveDashboardState();
    }
  } catch (err) {
    console.error('⚠️ Could not read dashboard_data.json:', err.message);
  }
}

// Save persistent data to disk atomically
function saveDashboardState() {
  try {
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(dashboardState, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('⚠️ Failed to persist dashboard data to disk:', err.message);
  }
}

// Initial state load
loadDashboardState();

// Active SSE client connections
const sseClients = new Set();

// Broadcast event to all connected LAN monitors
function broadcastEvent(eventType, payload) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Keep SSE connections alive through routers/firewalls with 15s heartbeat
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch (err) {
      sseClients.delete(client);
    }
  }
}, 15000);

// Scan posters directory for slideshow notice images (excluding logo.png)
function getSlideshowPosters() {
  try {
    if (!fs.existsSync(POSTERS_DIR)) return [];
    const files = fs.readdirSync(POSTERS_DIR);
    return files.filter(file => {
      if (/^(logo|devlog)\.(png|jpe?g|webp|svg)$/i.test(file)) return false;
      const ext = path.extname(file).toLowerCase();
      return IMAGE_EXTENSIONS.has(ext);
    });
  } catch (err) {
    console.error('Error scanning posters directory:', err.message);
    return [];
  }
}

// Detect all local LAN IPv4 addresses
function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, address: net.address });
      }
    }
  }
  return addresses;
}

// Startup Banner
function printStartupBanner(port, mode) {
  const lanAddresses = getLanAddresses();

  console.log('\n' + '='.repeat(72));
  console.log('  🏭 AL MUSLIM GROUP - INDUSTRIAL MONITOR & DIGITAL SIGNAGE');
  console.log(`  ⚡ Server Engine:        ${mode} [Port: ${port}]`);
  console.log('  🔄 LAN Data Sync:       Enabled (Central Server Storage & SSE Broadcast)');
  console.log('='.repeat(72));
  console.log(`  🖥️  Local Host Access:   http://localhost:${port}`);
  console.log(`  📁 Public Directory:    ${PUBLIC_DIR}`);
  console.log(`  💾 Data Storage:        ${DATA_FILE}`);
  console.log('-'.repeat(72));
  console.log('  🌐 LAN / SMART TV DIRECT ACCESS URLS:');
  if (lanAddresses.length > 0) {
    lanAddresses.forEach(net => {
      console.log(`     👉 [${net.interface}]:  http://${net.address}:${port}`);
    });
  } else {
    console.log(`     👉 http://localhost:${port}`);
  }
  console.log('-'.repeat(72));
  console.log('  📌 Notice Timing:       Interval: ' + dashboardState.timingSettings.posterIntervalSeconds + 's | Duration: ' + dashboardState.timingSettings.noticeDurationSeconds + 's');
  console.log('  💡 Press Ctrl+C in terminal anytime to stop the server.');
  console.log('='.repeat(72) + '\n');
}

// Start Express server
function startServer() {
  try {
    const express = require('express');
    const app = express();

    // Body parsing middleware with 50MB limit for massive Excel sheets
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // CORS for LAN clients
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // 1. GET /api/data - Fetch latest central report data
    app.get('/api/data', (req, res) => {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.json({
        success: true,
        version: dashboardState.version,
        lastUpdated: dashboardState.lastUpdated,
        data: dashboardState
      });
    });

    // 2. POST /api/data - Save & broadcast updated data across LAN
    app.post('/api/data', (req, res) => {
      try {
        const body = req.body || {};
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

        if (!body || typeof body !== 'object') {
          return res.status(400).json({ success: false, error: 'Invalid JSON body' });
        }

        let updated = false;

        // Updating finishing floor data
        if (body.type === 'finishing' || body.finishingData !== undefined) {
          const payload = body.finishingData !== undefined ? body.finishingData : body.data;
          dashboardState.finishingData = payload;
          updated = true;
        }

        // Updating fabric store data
        if (body.type === 'fabric' || body.fabricData !== undefined) {
          const payload = body.fabricData !== undefined ? body.fabricData : body.data;
          dashboardState.fabricData = payload;
          updated = true;
        }

        // Updating active module view (supports finishing, fabric, store, cutting, swing, sewing)
        if (body.currentModule && typeof body.currentModule === 'string' && body.currentModule.trim()) {
          dashboardState.currentModule = body.currentModule.toLowerCase().trim();
          updated = true;
        }

        // Updating timing settings
        if (body.timingSettings && typeof body.timingSettings === 'object') {
          const interval = parseInt(body.timingSettings.posterIntervalSeconds, 10);
          const duration = parseInt(body.timingSettings.noticeDurationSeconds, 10);
          const scrollSpeed = parseInt(body.timingSettings.scrollSpeed, 10);
          if (!isNaN(interval) && interval >= 5) {
            dashboardState.timingSettings.posterIntervalSeconds = interval;
          }
          if (!isNaN(duration) && duration >= 3) {
            dashboardState.timingSettings.noticeDurationSeconds = duration;
          }
          if (!isNaN(scrollSpeed) && scrollSpeed >= 1 && scrollSpeed <= 100) {
            dashboardState.timingSettings.scrollSpeed = scrollSpeed;
          }
          updated = true;
        }

        if (updated) {
          dashboardState.version = (dashboardState.version || 0) + 1;
          dashboardState.lastUpdated = new Date().toISOString();
          dashboardState.lastUpdatedBy = clientIp;
          saveDashboardState();

          // Broadcast to all connected LAN screens immediately
          broadcastEvent('data_updated', {
            version: dashboardState.version,
            lastUpdated: dashboardState.lastUpdated,
            currentModule: dashboardState.currentModule,
            data: dashboardState
          });
        }

        return res.json({
          success: true,
          version: dashboardState.version,
          lastUpdated: dashboardState.lastUpdated,
          currentModule: dashboardState.currentModule
        });
      } catch (err) {
        console.error('Error in POST /api/data:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // 3. POST /api/data/reset - Reset module data
    app.post('/api/data/reset', (req, res) => {
      try {
        const { module } = req.body || {};
        if (module === 'finishing') {
          dashboardState.finishingData = null;
        } else if (module === 'fabric') {
          dashboardState.fabricData = null;
        } else {
          dashboardState.finishingData = null;
          dashboardState.fabricData = null;
        }

        dashboardState.version = (dashboardState.version || 0) + 1;
        dashboardState.lastUpdated = new Date().toISOString();
        saveDashboardState();

        broadcastEvent('data_reset', {
          module: module || 'all',
          version: dashboardState.version,
          lastUpdated: dashboardState.lastUpdated,
          data: dashboardState
        });

        return res.json({ success: true, version: dashboardState.version });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // 4. GET /api/events - Server-Sent Events (SSE) Real-Time Stream
    app.get('/api/events', (req, res) => {
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders();

      // Send initial state upon connection
      res.write(`event: connected\ndata: ${JSON.stringify({
        version: dashboardState.version,
        lastUpdated: dashboardState.lastUpdated,
        currentModule: dashboardState.currentModule,
        data: dashboardState
      })}\n\n`);

      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
    });

    // 5. GET /api/network - Network & LAN info for dashboard
    app.get('/api/network', (req, res) => {
      res.json({
        success: true,
        port: PORT,
        lanAddresses: getLanAddresses(),
        clientIp: req.ip || req.socket.remoteAddress
      });
    });

    // 6. GET /api/posters - Poster Slideshow list
    app.get('/api/posters', (req, res) => {
      const posters = getSlideshowPosters();
      res.json(posters);
    });

    // Static assets
    app.use('/posters', express.static(POSTERS_DIR));
    app.use(express.static(PUBLIC_DIR));

    // Fallback to index.html for SPA routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    app.listen(PORT, '0.0.0.0', () => {
      printStartupBanner(PORT, 'Express.js');
    }).on('error', handleServerError);

  } catch (err) {
    console.warn('⚠️  Express package not detected. Falling back to native Node.js HTTP server...');
    startNativeHttpServer();
  }
}

// Native Node.js HTTP server fallback (Zero Dependencies)
function startNativeHttpServer() {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Common CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 1. GET /api/data
    if (pathname === '/api/data' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify({
        success: true,
        version: dashboardState.version,
        lastUpdated: dashboardState.lastUpdated,
        data: dashboardState
      }));
      return;
    }

    // 2. POST /api/data
    if (pathname === '/api/data' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          let updated = false;

          if (parsed.type === 'finishing' || parsed.finishingData !== undefined) {
            dashboardState.finishingData = parsed.finishingData !== undefined ? parsed.finishingData : parsed.data;
            updated = true;
          }
          if (parsed.type === 'fabric' || parsed.fabricData !== undefined) {
            dashboardState.fabricData = parsed.fabricData !== undefined ? parsed.fabricData : parsed.data;
            updated = true;
          }
          if (parsed.currentModule && typeof parsed.currentModule === 'string' && parsed.currentModule.trim()) {
            dashboardState.currentModule = parsed.currentModule.toLowerCase().trim();
            updated = true;
          }
          if (parsed.timingSettings && typeof parsed.timingSettings === 'object') {
            const interval = parseInt(parsed.timingSettings.posterIntervalSeconds, 10);
            const duration = parseInt(parsed.timingSettings.noticeDurationSeconds, 10);
            const scrollSpeed = parseInt(parsed.timingSettings.scrollSpeed, 10);
            if (!isNaN(interval) && interval >= 5) dashboardState.timingSettings.posterIntervalSeconds = interval;
            if (!isNaN(duration) && duration >= 3) dashboardState.timingSettings.noticeDurationSeconds = duration;
            if (!isNaN(scrollSpeed) && scrollSpeed >= 1 && scrollSpeed <= 100) dashboardState.timingSettings.scrollSpeed = scrollSpeed;
            updated = true;
          }

          if (updated) {
            dashboardState.version = (dashboardState.version || 0) + 1;
            dashboardState.lastUpdated = new Date().toISOString();
            saveDashboardState();
            broadcastEvent('data_updated', {
              version: dashboardState.version,
              lastUpdated: dashboardState.lastUpdated,
              currentModule: dashboardState.currentModule,
              data: dashboardState
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, version: dashboardState.version }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 3. POST /api/data/reset
    if (pathname === '/api/data/reset' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { module } = JSON.parse(body || '{}');
          if (module === 'finishing') dashboardState.finishingData = null;
          else if (module === 'fabric') dashboardState.fabricData = null;
          else { dashboardState.finishingData = null; dashboardState.fabricData = null; }

          dashboardState.version = (dashboardState.version || 0) + 1;
          dashboardState.lastUpdated = new Date().toISOString();
          saveDashboardState();
          broadcastEvent('data_reset', { module: module || 'all', version: dashboardState.version, data: dashboardState });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, version: dashboardState.version }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 4. GET /api/events (SSE)
    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      res.write(`event: connected\ndata: ${JSON.stringify({
        version: dashboardState.version,
        lastUpdated: dashboardState.lastUpdated,
        currentModule: dashboardState.currentModule,
        data: dashboardState
      })}\n\n`);

      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // 5. GET /api/network
    if (pathname === '/api/network' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, port: PORT, lanAddresses: getLanAddresses() }));
      return;
    }

    // 6. GET /api/posters
    if (pathname === '/api/posters') {
      const posters = getSlideshowPosters();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify(posters));
      return;
    }

    // 7. Static route: /posters/*
    if (pathname.startsWith('/posters/')) {
      const relativeFile = pathname.replace(/^\/posters\//, '');
      const filePath = path.join(POSTERS_DIR, relativeFile);
      serveStaticFile(filePath, res);
      return;
    }

    // 8. Static route: / (Public directory)
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    serveStaticFile(filePath, res);
  });

  function serveStaticFile(filePath, res) {
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    printStartupBanner(PORT, 'Node.js Built-in HTTP (Native Fallback)');
  }).on('error', handleServerError);
}

function handleServerError(err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
    console.error(`👉 Try running on a different port: PORT=${PORT + 1} npm start\n`);
  } else {
    console.error(`\n❌ Server Error: ${err.message}\n`);
  }
  process.exit(1);
}

// Start Server
startServer();
