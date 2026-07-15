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

// Fetch fresh list of public free proxies using got-scraping
async function fetchFreeProxies() {
  try {
    const got = await getGot();
    const res = await got.get('https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', { timeout: { request: 10000 } });
    return res.body.split('\n').map(p => p.trim()).filter(p => p);
  } catch (e) {
    return [];
  }
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

// Find working proxy concurrently in batches (prioritizing Webshare pool)
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

  console.log('[Proxy Finder] Webshare pool blocked or unreachable, trying public proxies...');
  const proxies = await fetchFreeProxies();
  if (proxies.length === 0) return null;

  const shuffled = proxies.sort(() => 0.5 - Math.random());
  const BATCH_SIZE = 10;
  for (let i = 0; i < Math.min(shuffled.length, 100); i += BATCH_SIZE) {
    const batch = shuffled.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (p) => {
      const fullUrl = `http://${p}`;
      return (await testProxy(fullUrl, targetUrl)) ? fullUrl : null;
    }));
    const working = results.filter(r => r);
    if (working.length > 0) {
      const selected = working[0];
      console.log(`[Proxy Finder] Found working public proxy: ${selected}`);
      cacheProxy(selected);
      return selected;
    }
  }
  return null;
}

async function get(url, options = {}) {
  const got = await getGot();

  // If user defined a custom proxy in environment, prioritize it
  const customProxy = process.env.SCRAPER_PROXY;
  if (customProxy) {
    console.log(`[HTTP Client] Using custom proxy: ${customProxy.replace(/:[^:@]+@/, ':***@')}`);
    const response = await makeProxyRequest(url, customProxy, options);
    if (isCloudflareBlocked(response.statusCode, response.body)) {
      throw new Error(`🚨 [حظر Cloudflare] تم رفض الطلب عبر البروكسي المخصص (الحالة: ${response.statusCode}).`);
    }
    return { data: response.body, status: response.statusCode, headers: response.headers };
  }

  // Try cached proxy first (if exists)
  let currentProxy = getCachedProxy();
  if (currentProxy) {
    try {
      console.log(`[HTTP Client] Trying cached proxy...`);
      const response = await makeProxyRequest(url, currentProxy, options);
      if (isCloudflareBlocked(response.statusCode, response.body)) {
        throw new Error('Cached proxy blocked by Cloudflare');
      }
      return { data: response.body, status: response.statusCode, headers: response.headers };
    } catch (err) {
      console.log(`[Proxy] Cached proxy failed, selecting a fresh proxy from pool...`);
      cacheProxy(null); // invalidate
    }
  }

  // Try direct connection using got-scraping (TLS Fingerprint Spoofing)
  try {
    console.log('[HTTP Client] Requesting directly with TLS spoofing...');
    const response = await got.get(url, {
      timeout: { request: 8000 },
      ...options
    });
    if (isCloudflareBlocked(response.statusCode, response.body)) {
      const blockErr = new Error(`Cloudflare blocked direct request (Status: ${response.statusCode})`);
      blockErr.statusCode = response.statusCode;
      blockErr.isBlocked = true;
      throw blockErr;
    }
    return { data: response.body, status: response.statusCode, headers: response.headers };
  } catch (err) {
    const isBlocked = err.isBlocked || (err.response && (err.response.statusCode === 403 || isCloudflareBlocked(err.response.statusCode, err.response.body))) || err.code === 'ETIMEDOUT' || err.message.includes('403');
    if (isBlocked) {
      console.log('[Proxy] Direct request blocked or timed out. Switching to Webshare proxy rotator...');
      const newProxy = await findWorkingProxy(url);
      if (newProxy) {
        const response = await makeProxyRequest(url, newProxy, options);
        if (!isCloudflareBlocked(response.statusCode, response.body)) {
          return { data: response.body, status: response.statusCode, headers: response.headers };
        }
      }
      throw new Error(`🚨 [حظر Cloudflare من السيرفر] خادم الاستضافة (VPS / Dokploy) محظور بالكامل من قِبل نظام حماية Cloudflare لموقع animerco.org (الحالة: 403 / تحدي الأمان). وجميع البروكسيات في القائمة لم تنجح في التخطي حالياً.`);
    }
    throw err;
  }
}

module.exports = {
  get
};
