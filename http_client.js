const fs = require('fs');
const path = require('path');
const { CookieJar } = require('tough-cookie');

const cookieJar = new CookieJar();

const proxyCacheFile = path.join(__dirname, 'working_proxy.txt');

// 10 Webshare Proxies
const WEBSHARE_PROXIES = [
  'http://eepvcuhn:pak11kmxun9g@31.59.20.176:6754',
  'http://eepvcuhn:pak11kmxun9g@31.56.127.193:7684',
  'http://eepvcuhn:pak11kmxun9g@45.38.107.97:6014',
  'http://eepvcuhn:pak11kmxun9g@198.105.121.200:6462',
  'http://eepvcuhn:pak11kmxun9g@64.137.96.74:6641',
  'http://eepvcuhn:pak11kmxun9g@198.23.243.226:6361',
  'http://eepvcuhn:pak11kmxun9g@38.154.185.97:6370',
  'http://eepvcuhn:pak11kmxun9g@84.247.60.125:6095',
  'http://eepvcuhn:pak11kmxun9g@142.111.67.146:5611',
  'http://eepvcuhn:pak11kmxun9g@191.96.254.138:6185'
];

let _cachedBypassConfig = { cfCookie: '', userAgent: '' };

// Background sync from Prisma AppConfig
async function syncFromDb() {
  try {
    if (process.env.DATABASE_URL) {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
      await prisma.$disconnect();
      if (cfg && cfg.cfCookie) {
        _cachedBypassConfig = { cfCookie: cfg.cfCookie, userAgent: cfg.userAgent || '' };
      }
    }
  } catch (e) {}
}
syncFromDb();
setInterval(syncFromDb, 30000);

function getBypassConfig() {
  if (_cachedBypassConfig && _cachedBypassConfig.cfCookie) {
    return _cachedBypassConfig;
  }
  const localConfig = path.join(__dirname, 'admin_config.json');
  const parentConfig = path.join(__dirname, '..', 'FRONT END', 'admin_config.json');
  
  let targetPath = null;
  if (fs.existsSync(localConfig)) targetPath = localConfig;
  else if (fs.existsSync(parentConfig)) targetPath = parentConfig;

  if (targetPath) {
    try {
      const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      return {
        cfCookie: data.cfCookie || '',
        userAgent: data.userAgent || ''
      };
    } catch (e) {}
  }
  return { cfCookie: '', userAgent: '' };
}

// Load cached working proxy
function getCachedProxy() {
  if (fs.existsSync(proxyCacheFile)) {
    try {
      return fs.readFileSync(proxyCacheFile, 'utf8').trim() || null;
    } catch (e) {}
  }
  return null;
}

// Save working proxy
function cacheProxy(proxyUrl) {
  try {
    fs.writeFileSync(proxyCacheFile, proxyUrl || '', 'utf8');
  } catch (e) {}
}

// Lazy load gotScraping
let gotInstance = null;
async function getGot() {
  if (!gotInstance) {
    const { gotScraping } = await import('got-scraping');
    gotInstance = gotScraping;
  }
  return gotInstance;
}

// Lazy load Puppeteer Extra with Stealth
let puppeteerInstance = null;
async function getPuppeteer() {
  if (!puppeteerInstance) {
    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());
    puppeteerInstance = puppeteerExtra;
  }
  return puppeteerInstance;
}

let sharedBrowser = null;
async function fetchWithPuppeteer(url, proxyUrl = null) {
  const puppeteer = await getPuppeteer();
  console.log(`[Puppeteer + Cheerio] 🛡️ جاري تشغيل المتصفح الخفي (Stealth Browser) لفتح الصفحة وتجاوز الحظر: ${url}`);
  
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ];
  if (proxyUrl) {
    const cleanProxy = proxyUrl.replace(/http:\/\/[^@]+@/, 'http://');
    args.push(`--proxy-server=${cleanProxy}`);
  }

  const isConnected = sharedBrowser && (typeof sharedBrowser.isConnected === 'function' ? sharedBrowser.isConnected() : sharedBrowser.connected);
  if (!sharedBrowser || !isConnected) {
    sharedBrowser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: 'new',
      args
    });
  }

  const page = await sharedBrowser.newPage();
  if (proxyUrl && proxyUrl.includes('@')) {
    const match = proxyUrl.match(/http:\/\/([^:]+):([^@]+)@/);
    if (match) {
      await page.authenticate({ username: match[1], password: match[2] });
    }
  }

  const bypass = getBypassConfig();
  if (bypass.userAgent) {
    await page.setUserAgent(bypass.userAgent);
  } else {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  }

  if (bypass.cfCookie) {
    const cookies = bypass.cfCookie.split(';').map(c => c.trim()).filter(Boolean);
    const parsedCookies = cookies.map(c => {
      const parts = c.split('=');
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      return {
        name,
        value,
        domain: '.animerco.org',
        path: '/'
      };
    });
    try {
      await page.setCookie(...parsedCookies);
    } catch (e) {}
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    
    // Check if Cloudflare JS challenge is currently running inside browser
    let title = await page.title();
    if (title && (title.includes('Just a moment') || title.includes('Attention Required') || title.includes('Cloudflare'))) {
      console.log('[Puppeteer + Cheerio] ⏳ اكتشاف تحدي Cloudflare... جاري الانتظار حتى يتم تخطيه تلقائياً...');
      try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (navErr) {
        // Fallback wait if navigation event missed
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    const html = await page.content();
    await page.close();
    return { data: html, status: 200, headers: {} };
  } catch (err) {
    try { await page.close(); } catch (e) {}
    throw err;
  }
}

// Helper to make request with proper HttpsProxyAgent when target is HTTPS
async function makeProxyRequest(url, proxyUrl, options = {}) {
  const got = await getGot();
  let HttpsProxyAgent = null;
  try {
    const hpagent = await import('hpagent');
    HttpsProxyAgent = hpagent.HttpsProxyAgent;
  } catch (e) {
    try {
      const httpsProxyAgentPkg = require('https-proxy-agent');
      HttpsProxyAgent = httpsProxyAgentPkg.HttpsProxyAgent;
    } catch (e2) {}
  }

  const agentOpts = HttpsProxyAgent && url.startsWith('https:')
    ? { agent: { https: new HttpsProxyAgent({ proxy: proxyUrl, timeout: 15000 }) } }
    : { proxyUrl };

  return await got.get(url, {
    ...agentOpts,
    timeout: { request: 20000 },
    cookieJar,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', ...options.headers },
    ...options
  });
}

function isCloudflareBlocked(status, body) {
  if (status === 403 || status === 503 || status === 429) return true;
  if (!body || typeof body !== 'string') return false;
  const lower = body.toLowerCase();
  return lower.includes('just a moment') ||
         lower.includes('attention required! | cloudflare') ||
         lower.includes('enable javascript and cookies to continue') ||
         lower.includes('chk_jschl') ||
         lower.includes('cf-turnstile') ||
         lower.includes('403 forbidden');
}

// Test if a proxy works for animerco.org
async function testProxy(proxyUrl, targetUrl) {
  try {
    const res = await makeProxyRequest(targetUrl, proxyUrl, { retry: { limit: 0 } });
    if (res.statusCode === 200 && !isCloudflareBlocked(res.statusCode, res.body)) {
      return true;
    }
  } catch (e) {}
  return false;
}

// Find working proxy in pool
async function findWorkingProxy(targetUrl) {
  console.log('[Proxy Finder] Testing high-speed Webshare proxies first...');
  const shuffledWebshare = [...WEBSHARE_PROXIES].sort(() => 0.5 - Math.random());
  for (const proxyUrl of shuffledWebshare) {
    if (await testProxy(proxyUrl, targetUrl)) {
      console.log(`[Proxy Finder] Found working Webshare proxy: ${proxyUrl.replace(/eepvcuhn:pak11kmxun9g@/, '***@')}`);
      cacheProxy(proxyUrl);
      return proxyUrl;
    }
  }
  return null;
}

async function get(url, options = {}) {
  const got = await getGot();

  const bypass = getBypassConfig();
  if (bypass.cfCookie && bypass.userAgent) {
    if (!options.headers) options.headers = {};
    options.headers['Cookie'] = bypass.cfCookie;
    options.headers['User-Agent'] = bypass.userAgent;
  }

  // 1. Try with custom proxy if explicitly set
  const customProxy = process.env.SCRAPER_PROXY;
  if (customProxy) {
    try {
      const response = await makeProxyRequest(url, customProxy, options);
      if (!isCloudflareBlocked(response.statusCode, response.body)) {
        return { data: response.body, status: response.statusCode, headers: response.headers };
      }
    } catch (err) {}
  }

  // 2. Try cached proxy from pool
  let currentProxy = getCachedProxy();
  if (currentProxy) {
    try {
      const response = await makeProxyRequest(url, currentProxy, options);
      if (!isCloudflareBlocked(response.statusCode, response.body)) {
        return { data: response.body, status: response.statusCode, headers: response.headers };
      }
    } catch (err) {
      cacheProxy(null);
    }
  }

  // 3. Try direct connection with TLS spoofing
  try {
    const response = await got.get(url, {
      timeout: { request: 8000 },
      cookieJar,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', ...options.headers },
      ...options
    });
    if (!isCloudflareBlocked(response.statusCode, response.body)) {
      return { data: response.body, status: response.statusCode, headers: response.headers };
    }
  } catch (err) {}

  // 4. Try rotating Webshare proxy pool
  const newProxy = await findWorkingProxy(url);
  if (newProxy) {
    try {
      const response = await makeProxyRequest(url, newProxy, options);
      if (!isCloudflareBlocked(response.statusCode, response.body)) {
        return { data: response.body, status: response.statusCode, headers: response.headers };
      }
    } catch (e) {}
  }

  // 5. ULTIMATE FALLBACK: Launch Puppeteer Stealth Browser to solve dynamic JS challenge & pass clean HTML to Cheerio
  console.log(`[HTTP Client] ⚡ تم تفعيل التحالف الأقوى (Puppeteer Stealth + Cheerio) لتجاوز تحديات الصفحة وتحليلها.`);
  return await fetchWithPuppeteer(url, newProxy || customProxy);
}

async function post(url, data, options = {}) {
  const got = await getGot();

  const bypass = getBypassConfig();
  if (bypass.cfCookie && bypass.userAgent) {
    if (!options.headers) options.headers = {};
    options.headers['Cookie'] = bypass.cfCookie;
    options.headers['User-Agent'] = bypass.userAgent;
  }

  let currentProxy = getCachedProxy();
  let agentOpts = {};
  if (currentProxy) {
     let HttpsProxyAgent = null;
     try {
       const hpagent = await import('hpagent');
       HttpsProxyAgent = hpagent.HttpsProxyAgent;
     } catch(e) {}
     if(HttpsProxyAgent && url.startsWith('https:')) {
        agentOpts = { agent: { https: new HttpsProxyAgent({ proxy: currentProxy, timeout: 15000 }) } };
     } else {
        agentOpts = { proxyUrl: currentProxy };
     }
  }
  
  try {
     const response = await got.post(url, {
        body: data,
        ...agentOpts,
        timeout: { request: 15000 },
        cookieJar,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', ...options.headers },
        ...options
     });
     return { data: response.body, status: response.statusCode, headers: response.headers };
  } catch(e) {
     throw e;
  }
}

module.exports = {
  get,
  post
};
