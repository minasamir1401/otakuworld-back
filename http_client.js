const fs = require('fs');
const path = require('path');

const proxyCacheFile = path.join(__dirname, 'working_proxy.txt');

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

// Lazy load gotScraping (since it is ESM only)
let gotInstance = null;
async function getGot() {
  if (!gotInstance) {
    const { gotScraping } = await import('got-scraping');
    gotInstance = gotScraping;
  }
  return gotInstance;
}

// Fetch fresh list of public free proxies using got-scraping
async function fetchFreeProxies() {
  try {
    const got = await getGot();
    const res = await got.get('https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', { timeout: { request: 10000 } });
    return res.body.split('\n').map(p => p.trim()).filter(p => p);
  } catch (e) {
    console.error('[Proxy Finder] Failed to fetch free proxy list:', e.message);
    return [];
  }
}

// Test if a proxy works for animerco.org
async function testProxy(proxyStr, targetUrl) {
  try {
    const got = await getGot();
    const res = await got.get(targetUrl, {
      proxyUrl: `http://${proxyStr}`,
      timeout: { request: 6000 },
      retry: { limit: 0 }
    });
    if (res.statusCode === 200) {
      return true;
    }
  } catch (e) {}
  return false;
}

// Find working proxy concurrently in batches
async function findWorkingProxy(targetUrl) {
  console.log('[Proxy Finder] Searching for a working free proxy...');
  const proxies = await fetchFreeProxies();
  if (proxies.length === 0) return null;

  // Shuffle proxies
  const shuffled = proxies.sort(() => 0.5 - Math.random());
  
  const BATCH_SIZE = 10;
  for (let i = 0; i < Math.min(shuffled.length, 250); i += BATCH_SIZE) {
    const batch = shuffled.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (p) => {
      const works = await testProxy(p, targetUrl);
      return works ? p : null;
    });
    const results = await Promise.all(promises);
    const working = results.filter(r => r);
    if (working.length > 0) {
      const selected = `http://${working[0]}`;
      console.log(`[Proxy Finder] Found working proxy: ${selected}`);
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
    console.log(`[HTTP Client] Using custom proxy: ${customProxy}`);
    const response = await got.get(url, {
      proxyUrl: customProxy,
      timeout: { request: 20000 },
      ...options
    });
    return { data: response.body, status: response.statusCode, headers: response.headers };
  }

  // Otherwise, try with cached proxy first (if exists)
  let currentProxy = getCachedProxy();
  if (currentProxy) {
    try {
      console.log(`[HTTP Client] Trying cached proxy: ${currentProxy}`);
      const response = await got.get(url, {
        proxyUrl: currentProxy,
        timeout: { request: 12000 },
        ...options
      });
      return { data: response.body, status: response.statusCode, headers: response.headers };
    } catch (err) {
      console.log(`[Proxy] Cached proxy ${currentProxy} failed, finding a new one...`);
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
    return { data: response.body, status: response.statusCode, headers: response.headers };
  } catch (err) {
    const isBlocked = err.response && err.response.statusCode === 403 || err.code === 'ETIMEDOUT' || err.message.includes('403');
    if (isBlocked) {
      console.log('[Proxy] Direct request blocked (403/Timeout). Initiating automatic free proxy rotator...');
      const newProxy = await findWorkingProxy(url);
      if (newProxy) {
        const response = await got.get(url, {
          proxyUrl: newProxy,
          timeout: { request: 20000 },
          ...options
        });
        return { data: response.body, status: response.statusCode, headers: response.headers };
      }
    }
    throw err;
  }
}

module.exports = {
  get
};
