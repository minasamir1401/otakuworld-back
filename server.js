const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5000;
// Secret key shared with Frontend (set via env var BACKEND_SECRET)
const SECRET = process.env.BACKEND_SECRET || 'otakuworld-secret-2025';

// ─────────── Helpers ─────────────────────────────────────────────────────────

function isPidRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function getStatus(name) {
  const pidPath = path.join(__dirname, name + '.pid');
  if (fs.existsSync(pidPath)) {
    try {
      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      if (isPidRunning(pid)) return { running: true, pid };
    } catch (e) {}
  }
  return { running: false, pid: null };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { resolve({}); }
    });
  });
}

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(payload);
}

function auth(req) {
  const h = req.headers['authorization'] || '';
  return h === `Bearer ${SECRET}`;
}

// ─────────── Routes ───────────────────────────────────────────────────────────

function handleStatus(res) {
  json(res, 200, {
    success: true,
    scrapers: {
      animeScraper: getStatus('anime_scraper'),
      moviesScraper: getStatus('movies_scraper'),
      scheduleSync: getStatus('schedule_sync')
    }
  });
}

function handleLogs(res, type) {
  const logFiles = {
    anime: 'anime_scraper.log',
    movies: 'movies_scraper.log',
    sync: 'schedule_sync.log'
  };

  const logFile = logFiles[type];
  if (!logFile) return json(res, 400, { success: false, error: 'نوع سكربت غير صالح' });

  const logPath = path.join(__dirname, logFile);
  if (!fs.existsSync(logPath)) {
    return json(res, 200, { success: true, running: getStatus(logFile.replace('.log', '')).running, logs: 'لا توجد سجلات بعد لهذا السكربت.' });
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  const lastLines = lines.slice(-150).join('\n');

  const statusMap = {
    anime: 'anime_scraper',
    movies: 'movies_scraper',
    sync: 'schedule_sync'
  };
  json(res, 200, { success: true, running: getStatus(statusMap[type]).running, logs: lastLines });
}

function handleTrigger(res, type) {
  const scripts = {
    anime:  { script: 'scraper.js',         pid: 'anime_scraper',  log: 'anime_scraper.log'  },
    movies: { script: 'scraper_movies.js',   pid: 'movies_scraper', log: 'movies_scraper.log' },
    sync:   { script: 'sync_schedule.js',    pid: 'schedule_sync',  log: 'schedule_sync.log'  }
  };

  const cfg = scripts[type];
  if (!cfg) return json(res, 400, { success: false, error: 'نوع سكربت غير صالح' });

  const status = getStatus(cfg.pid);
  if (status.running) return json(res, 400, { success: false, error: 'هذا السكربت يعمل بالفعل حالياً' });

  const logPath = path.join(__dirname, cfg.log);
  const pidPath = path.join(__dirname, cfg.pid + '.pid');
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });

  const child = spawn('node', [cfg.script], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.unref();

  fs.writeFileSync(pidPath, String(child.pid), 'utf8');
  console.log(`[Scraper] Started ${cfg.script} with PID ${child.pid}`);

  json(res, 200, { success: true, message: `تم إطلاق السكربت بنجاح في الخلفية`, pid: child.pid });
}

// ─────────── HTTP Server ──────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  // Health check (no auth required)
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Otakuworld Backend API is running.');
  }

  // Auth check for all other routes
  if (!auth(req)) return json(res, 403, { success: false, error: 'غير مصرح بالدخول' });

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // GET /scraper/status  → status of all scrapers
  if (req.method === 'GET' && pathname === '/scraper/status') {
    return handleStatus(res);
  }

  // GET /scraper/logs?type=anime|movies|sync
  if (req.method === 'GET' && pathname === '/scraper/logs') {
    return handleLogs(res, url.searchParams.get('type'));
  }

  // POST /scraper/trigger  { type: 'anime'|'movies'|'sync' }
  if (req.method === 'POST' && pathname === '/scraper/trigger') {
    const body = await readBody(req);
    return handleTrigger(res, body.type);
  }

  json(res, 404, { success: false, error: 'المسار غير موجود' });
});

server.listen(PORT, () => {
  console.log(`[Server] Backend API listening on port ${PORT}`);
});
