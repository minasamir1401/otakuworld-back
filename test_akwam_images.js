const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://akwams.org/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}).then(res => {
  const $ = cheerio.load(res.data);
  $('img').slice(0, 10).each((i, el) => {
    console.log(`Image ${i}: src="${$(el).attr('src')}" | data-src="${$(el).attr('data-src')}" | class="${$(el).attr('class')}"`);
  });
}).catch(err => console.error(err.message));
