process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const cheerio = require('cheerio');

async function run() {
  // StreamRuby needs a specific Referer  
  const res = await axios.get('https://stmruby.com/embed-tdrg3zdyw7vq.html', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://akwams.org/'
    }
  });
  
  const $ = cheerio.load(res.data);
  
  $('script').each((i, el) => {
    const content = $(el).html() || '';
    if (content.includes('eval(function(p,a,c,k')) {
      console.log('Found eval script, length:', content.length);
      // Use the existing unpackUqload approach that worked before
      const match = content.match(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/);
      console.log('Match found:', !!match);
      
      // Get the full packed string
      const startIdx = content.indexOf("('");
      const endIdx = content.lastIndexOf("')");
      if (startIdx > -1 && endIdx > -1) {
        const inner = content.substring(startIdx + 2, endIdx);
        console.log('Inner content start:', inner.substring(0, 200));
      }
    }
  });
}
run();
