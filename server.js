const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET = process.env.BACKEND_SECRET || 'otakuworld-secret-2025';

const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Authentication Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${SECRET}`) {
    return res.status(403).json({ success: false, error: 'غير مصرح بالدخول' });
  }
  next();
}

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

// Recursive reviver for ISO Dates in query arguments
function reviveDates(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    if (isoDateRegex.test(obj)) {
      return new Date(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(reviveDates);
  }
  if (typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = reviveDates(obj[key]);
      }
    }
  }
  return obj;
}

// ─────────── Routes ───────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.send('Otakuworld Backend API is running.');
});

// Execute DB Query
app.post('/api/db-query', authenticate, async (req, res) => {
  const { model, method, args } = req.body;
  if (!model || !method) {
    return res.status(400).send('Missing model or method');
  }

  try {
    if (!prisma[model]) {
      return res.status(400).send(`Model "${model}" not found in Prisma client`);
    }
    if (typeof prisma[model][method] !== 'function') {
      return res.status(400).send(`Method "${method}" not found on model "${model}"`);
    }

    const revivedArgs = reviveDates(args) || [];
    const result = await prisma[model][method](...revivedArgs);
    res.json(result);
  } catch (error) {
    console.error(`[Prisma Query Error] ${model}.${method}:`, error);
    res.status(500).send(error.message || 'Database query failed');
  }
});

// GET /scraper/status
app.get('/scraper/status', authenticate, (req, res) => {
  res.json({
    success: true,
    scrapers: {
      animeScraper: getStatus('anime_scraper'),
      moviesScraper: getStatus('movies_scraper'),
      scheduleSync: getStatus('schedule_sync')
    }
  });
});

// GET /scraper/logs
app.get('/scraper/logs', authenticate, (req, res) => {
  const type = req.query.type;
  const logFiles = {
    anime: 'anime_scraper.log',
    movies: 'movies_scraper.log',
    sync: 'schedule_sync.log'
  };

  const logFile = logFiles[type];
  if (!logFile) return res.status(400).json({ success: false, error: 'نوع سكربت غير صالح' });

  const logPath = path.join(__dirname, logFile);
  if (!fs.existsSync(logPath)) {
    const statusMap = { anime: 'anime_scraper', movies: 'movies_scraper', sync: 'schedule_sync' };
    return res.json({ success: true, running: getStatus(statusMap[type]).running, logs: 'لا توجد سجلات بعد لهذا السكربت.' });
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  const lastLines = lines.slice(-150).join('\n');

  const statusMap = { anime: 'anime_scraper', movies: 'movies_scraper', sync: 'schedule_sync' };
  res.json({ success: true, running: getStatus(statusMap[type]).running, logs: lastLines });
});

// POST /scraper/trigger
app.post('/scraper/trigger', authenticate, (req, res) => {
  const type = req.body.type;
  const scripts = {
    anime:  { script: 'scraper.js',         pid: 'anime_scraper',  log: 'anime_scraper.log'  },
    movies: { script: 'scraper_movies.js',   pid: 'movies_scraper', log: 'movies_scraper.log' },
    sync:   { script: 'sync_schedule.js',    pid: 'schedule_sync',  log: 'schedule_sync.log'  }
  };

  const cfg = scripts[type];
  if (!cfg) return res.status(400).json({ success: false, error: 'نوع سكربت غير صالح' });

  const status = getStatus(cfg.pid);
  if (status.running) return res.status(400).json({ success: false, error: 'هذا السكربت يعمل بالفعل حالياً' });

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

  res.json({ success: true, message: `تم إطلاق السكربت بنجاح في الخلفية`, pid: child.pid });
});

app.listen(PORT, () => {
  console.log(`[Server] Backend API listening on port ${PORT}`);
});
