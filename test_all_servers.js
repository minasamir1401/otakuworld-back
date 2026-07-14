process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function unpackP(packed) {
  try {
    const regex = /eval\s*\(\s*function\s*\(p,a,c,k,e,(?:r|d)\)/;
    if (!regex.test(packed)) return null;
    // Safe eval using a VM-like approach by extracting the string manually
    const pMatch = packed.match(/,(\d+),(\d+),'([^']+)'\.split/);
    if (!pMatch) return null;
    
    let [, a, c, kStr] = pMatch;
    a = parseInt(a); c = parseInt(c);
    const k = kStr.split('|');
    
    const pStr = packed.match(/\('([^']{50,})'/);
    if (!pStr) return null;
    let p = pStr[1];
    
    let ci = c - 1;
    while (ci >= 0) {
      if (k[ci]) {
        const word = ci.toString(a);
        p = p.replace(new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), k[ci]);
      }
      ci--;
    }
    return p;
  } catch(e) { return null; }
}

async function tryExtract(name, url) {
  console.log(`\n=== Testing ${name}: ${url} ===`);
  try {
    const res = await axios.get(url, { headers: { ...HEADERS, 'Referer': new URL(url).origin + '/' }, timeout: 10000 });
    const html = res.data;
    const $ = cheerio.load(html);
    
    let directUrl = null;
    
    // Method 1: Find m3u8/mp4 directly in scripts
    $('script').each((i, el) => {
      const content = $(el).html() || '';
      if (!content) return;
      
      // Direct URL patterns
      const patterns = [
        /["']file["']\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']{0,100})["']/i,
        /source\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /src\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        /hls\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
        /mp4\s*=\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
      ];
      
      for (const pat of patterns) {
        const m = content.match(pat);
        if (m && !m[1].includes('ads') && !m[1].includes('tracker')) {
          directUrl = m[1];
          console.log(`  ✅ Found via direct pattern: ${directUrl.substring(0, 100)}`);
          return false;
        }
      }
      
      // Method 2: Unpack eval(function...) 
      if (content.includes('eval(function(p,a,c,k')) {
        const unpacked = unpackP(content);
        if (unpacked) {
          for (const pat of patterns) {
            const m = unpacked.match(pat);
            if (m && !m[1].includes('ads')) {
              directUrl = m[1];
              console.log(`  ✅ Found via unpack: ${directUrl.substring(0, 100)}`);
              return false;
            }
          }
          // Also search raw
          const raw = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
          if (raw) {
            directUrl = raw[0];
            console.log(`  ✅ Found via raw unpack search: ${directUrl.substring(0, 100)}`);
            return false;
          }
        }
      }
    });
    
    if (!directUrl) {
      // Method 3: Check data attributes
      const dataAttrs = ['data-file', 'data-src', 'data-url', 'data-source'];
      for (const attr of dataAttrs) {
        const val = $(`[${attr}]`).first().attr(attr);
        if (val && (val.includes('.m3u8') || val.includes('.mp4'))) {
          directUrl = val;
          console.log(`  ✅ Found via ${attr}: ${directUrl}`);
          break;
        }
      }
    }
    
    if (!directUrl) {
      // Log all script srcs and inline first 200 chars
      console.log(`  ❌ No direct URL found. Checking page structure...`);
      $('script[src]').each((i, el) => {
        console.log(`    External script: ${$(el).attr('src')}`);
      });
      $('script').each((i, el) => {
        const content = $(el).html() || '';
        if (content.length > 50 && content.length < 2000) {
          console.log(`    Inline script (${content.length}): ${content.substring(0, 200)}`);
        }
      });
    }
    
    return directUrl;
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return null;
  }
}

async function run() {
  const servers = [
    { name: 'StreamRuby (سيرفر 1)', url: 'https://stmruby.com/embed-tdrg3zdyw7vq.html' },
    { name: 'HGCloud (سيرفر 2)', url: 'https://hgcloud.to/e/xgnhcot2n21t' },
    { name: 'Bysekoze (سيرفر 3)', url: 'https://bysekoze.com/e/0tcya8dvolt7' },
    { name: 'Vidaraa (سيرفر 4)', url: 'https://vidaraa.cc/e/JnospWtGcr2RJ' },
    { name: 'Morencius (سيرفر 5)', url: 'https://morencius.com/v/49hrcy2qsyk8' },
    { name: 'MixDrop (سيرفر 6)', url: 'https://mixdrop.top/e/xwo1v433awmgd9' },
    { name: 'PlayMogo/DsvPlay (سيرفر 7)', url: 'https://playmogo.com/e/nyi27vvmr2r9' },
    { name: 'Voe (سيرفر 8)', url: 'https://voe.sx/e/0p76by6fg22p' },
  ];
  
  const results = [];
  for (const srv of servers) {
    const url = await tryExtract(srv.name, srv.url);
    results.push({ name: srv.name, directUrl: !!url });
  }
  
  console.log('\n\n====== SUMMARY ======');
  results.forEach(r => console.log(`${r.directUrl ? '✅' : '❌'} ${r.name}: ${r.directUrl ? 'Can extract direct URL' : 'Cannot extract - will use iframe'}`));
}

run();
