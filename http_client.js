const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://eta.animerco.org/',
  'Connection': 'keep-alive'
};

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

// Fetch fresh list of public free proxies
async function fetchFreeProxies() {
  try {
    const res = await axios.get('https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', { timeout: 10000 });
    return res.data.split('\n').map(p => p.trim()).filter(p => p);
  } catch (e) {
    console.error('[Proxy Finder] Failed to fetch free proxy list:', e.message);
    return [];
  }
}

// Test if a proxy works for animerco.org
async function testProxy(proxyStr, targetUrl) {
  const [host, port] = proxyStr.split(':');
  try {
    const res = await axios.get(targetUrl, {
      headers: HEADERS,
      timeout: 5000,
      proxy: {
        protocol: 'http',
        host: host,
        port: parseInt(port, 10)
      }
    });
    if (res.status === 200) {
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

  // Shuffle proxies to avoid everyone using the first one
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
  // If user defined a custom proxy in environment, prioritize it
  const customProxy = process.env.SCRAPER_PROXY;
  if (customProxy) {
    const u = new URL(customProxy);
    const config = {
      headers: HEADERS,
      timeout: 15000,
      proxy: {
        protocol: u.protocol.replace(':', ''),
        host: u.hostname,
        port: parseInt(u.port, 10)
      }
    };
    if (u.username && u.password) {
      config.proxy.auth = {
        username: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password)
      };
    }
    return axios.get(url, config);
  }

  // Otherwise, use our automatic free proxy rotater!
  let currentProxy = getCachedProxy();
  
  // Try with cached proxy first (if exists)
  if (currentProxy) {
    try {
      const u = new URL(currentProxy);
      return await axios.get(url, {
        headers: HEADERS,
        timeout: 10000,
        proxy: {
          protocol: 'http',
          host: u.hostname,
          port: parseInt(u.port, 10)
        }
      });
    } catch (err) {
      console.log(`[Proxy] Cached proxy ${currentProxy} failed, finding a new one...`);
      cacheProxy(null); // invalidate
    }
  }

  // If no cached proxy or it failed, try without proxy (in case it is local)
  try {
    return await axios.get(url, { headers: HEADERS, timeout: 8000 });
  } catch (err) {
    const isBlocked = err.response && err.response.status === 403 || err.code === 'ECONNABORTED' || err.message.includes('403');
    if (isBlocked) {
      console.log('[Proxy] Request blocked (403/Timeout). Initiating automatic bypass...');
      const newProxy = await findWorkingProxy(url);
      if (newProxy) {
        const u = new URL(newProxy);
        return await axios.get(url, {
          headers: HEADERS,
          timeout: 15000,
          proxy: {
            protocol: 'http',
            host: u.hostname,
            port: parseInt(u.port, 10)
          }
        });
      }
    }
    throw err;
  }
}

module.exports = {
  get,
  HEADERS
};
