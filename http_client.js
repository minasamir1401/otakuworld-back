const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://eta.animerco.org/',
  'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
  'Connection': 'keep-alive'
};

function getAxiosConfig() {
  const proxyUrl = process.env.SCRAPER_PROXY;
  let config = { headers: HEADERS, timeout: 15000 };
  
  if (proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      config.proxy = {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port, 10)
      };
      if (url.username && url.password) {
        config.proxy.auth = {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password)
        };
      }
      console.log(`[Proxy] Using scraper proxy: ${url.hostname}:${url.port}`);
    } catch (e) {
      console.error('⚠️ Failed to parse SCRAPER_PROXY environment variable:', e.message);
    }
  }
  return config;
}

async function get(url, options = {}) {
  const baseConfig = getAxiosConfig();
  const config = {
    ...baseConfig,
    ...options,
    headers: {
      ...baseConfig.headers,
      ...options.headers
    }
  };
  return axios.get(url, config);
}

module.exports = {
  get,
  HEADERS
};
