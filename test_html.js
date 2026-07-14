const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('dump.html', 'utf8');
const $ = cheerio.load(html);

console.log('Total a tags:', $('a').length);

const items = [];
$('a').each((i, el) => {
  const href = $(el).attr('href');
  if (href && (href.includes('movie') || href.includes('series') || href.includes('akwams.org'))) {
    // try to find the container
    const parentClass = $(el).parent().attr('class');
    if (parentClass) {
        items.push({href, parentClass});
    }
  }
});
console.log(items.slice(0, 20));
