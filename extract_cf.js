const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const PROXIES = [
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

async function tryProxy(proxyUrl) {
  let proxyHost = 'Direct Connection';
  let user = null, pass = null;
  
  if (proxyUrl) {
    const match = proxyUrl.match(/http:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
    if (!match) return null;
    const [_, username, password, host, port] = match;
    proxyHost = `${host}:${port}`;
    user = username;
    pass = password;
  }

  console.log(`⏳ Trying connection: ${proxyHost}...`);
  let browser;
  try {
    const launchArgs = [
      '--no-sandbox', 
      '--disable-setuid-sandbox'
    ];
    if (proxyUrl) {
      launchArgs.push(`--proxy-server=${proxyHost}`);
    }

    browser = await puppeteer.launch({
      headless: false, // Show browser to solve challenge
      args: launchArgs
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    if (proxyUrl && user && pass) {
      await page.authenticate({ username: user, password: pass });
    }

    await page.goto('https://eta.animerco.org', { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    console.log(`⏳ Waiting for Cloudflare clearance cookie (up to 60s). Please solve Turnstile in the browser if requested...`);
    
    let cfClearanceCookie = null;
    let userAgent = '';
    
    for (let i = 0; i < 60; i++) {
      const cookies = await page.cookies();
      cfClearanceCookie = cookies.find(c => c.name === 'cf_clearance');
      if (cfClearanceCookie) {
        userAgent = await page.evaluate(() => navigator.userAgent);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (cfClearanceCookie) {
      return {
        cookie: `cf_clearance=${cfClearanceCookie.value}`,
        userAgent,
        browser
      };
    } else {
      console.warn(`⚠️ Connection (${proxyHost}) completed but did not produce a 'cf_clearance' cookie within 60 seconds.`);
    }
  } catch (err) {
    console.warn(`⚠️ Connection (${proxyHost}) failed:`, err.message);
  }

  if (browser) {
    try {
      await browser.close();
    } catch (e) {}
  }
  return null;
}

async function main() {
  console.log("⏳ Starting Cloudflare extraction loop through connection pool...");
  let result = null;
  let workingProxy = null;

  const connectionPool = [null, ...PROXIES];
  for (const proxy of connectionPool) {
    result = await tryProxy(proxy);
    if (result) {
      workingProxy = proxy;
      break;
    }
  }

  if (!result) {
    console.error("❌ All connections failed to bypass Cloudflare.");
    return;
  }

  try {
    const cfCookieString = result.cookie;
    const userAgent = result.userAgent;
    
    console.log("✅ Successfully extracted bypass details!");
    console.log("Cookie:", cfCookieString);
    console.log("User-Agent:", userAgent);
    console.log("Proxy Used:", workingProxy);
    
    // Save locally to FRONT END and Backend
    const localConfigPath = path.resolve(__dirname, '..', 'FRONT END', 'admin_config.json');
    const backendConfigPath = path.resolve(__dirname, 'admin_config.json');
    
    [localConfigPath, backendConfigPath].forEach(cfgPath => {
      try {
        let config = { username: 'admin', password: 'adminpassword' };
        if (fs.existsSync(cfgPath)) {
          config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        }
        config.cfCookie = cfCookieString;
        config.userAgent = userAgent;
        config.cfProxy = workingProxy;
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`💾 Saved locally to ${cfgPath}`);
      } catch (e) {}
    });

    try {
      if (process.env.DATABASE_URL) {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        await prisma.appConfig.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', cfCookie: cfCookieString, userAgent, cfProxy: workingProxy || null },
          update: { cfCookie: cfCookieString, userAgent, cfProxy: workingProxy || null }
        });
        await prisma.$disconnect();
        console.log("💾 Saved directly to local Postgres DB AppConfig");
      }
    } catch (e) {
      console.warn("Could not save to direct Postgres DB:", e.message);
    }
    
    // Save to live server
    console.log("⏳ Syncing to live production server...");
    const credentials = Buffer.from('admin:adminpassword').toString('base64');
    
    try {
      const res = await axios.post('https://otakuworld.red-gate.tech/api/admin/config', {
        cfCookie: cfCookieString,
        userAgent: userAgent,
        cfProxy: workingProxy
      }, {
        headers: {
          'Authorization': `Bearer ${credentials}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.data && res.data.success) {
        console.log("🚀 Live server updated successfully! All watch players are now active.");
      } else {
        console.error("❌ Live server sync failed:", res.data);
      }
    } catch (apiErr) {
      console.error("❌ Failed to sync to live server:", apiErr.message);
    }
    
  } catch (err) {
    console.error("❌ Error occurred during save:", err.message);
  } finally {
    if (result.browser) {
      try {
        await result.browser.close();
      } catch (e) {}
    }
  }
}

main();
