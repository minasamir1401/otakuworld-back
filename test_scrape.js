const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://akwams.org/category/movies/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/').then(res => {
  const $ = cheerio.load(res.data);
  console.log('posts:', $('.post').length);
  console.log('articles:', $('article').length);
  console.log('items:', $('.item').length);
  
  // print out some classes from body to see what they use
  const classes = new Set();
  $('*').each((i, el) => {
    if (el.attribs && el.attribs.class) {
      el.attribs.class.split(' ').forEach(c => classes.add(c));
    }
  });
  console.log(Array.from(classes).filter(c => c.includes('post') || c.includes('item') || c.includes('card') || c.includes('block') || c.includes('movie')));
});
