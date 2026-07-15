const cheerio = require('cheerio');
const client = require('./http_client');

async function test() {
  try {
    const res = await client.get('https://eta.animerco.org/schedule/');
    const $ = cheerio.load(res.data);
    const blocks = $('.tab-content .media-block');
    console.log(`Found ${blocks.length} media-blocks`);
    
    blocks.each((i, block) => {
      const href = $(block).find('a.anime-card, .anime-card a, .info a').first().attr('href');
      if (i < 5) console.log(`Href preview: ${href}`);
    });
  } catch (e) {
    console.error(e);
  }
}
test();
