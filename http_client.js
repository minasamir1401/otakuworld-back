const fs = require('fs');
const path = require('path');

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

  if (!sharedBrowser || !sharedBrowser.isConnected()) {
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

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

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

module.exports = {
  get
};
