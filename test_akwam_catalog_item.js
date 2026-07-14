const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://akwams.org/category/movies/%D8%A7%D9%81%D9%84%D8%A7%D9%85-%D8%A7%D8%AC%D9%86%D8%A8%D9%8A/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}).then(res => {
  const $ = cheerio.load(res.data);
  const first = $('.entry-box-1').first();
  console.log(first.html());
}).catch(err => console.error(err.message));
