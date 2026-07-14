const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('dump.html', 'utf8'));

const items = [];
$('.entry-box-1').each((i, el) => {
    // Title is usually an h3 or h2 or a tag inside something
    const linkEl = $(el).find('a').first();
    const href = linkEl.attr('href');
    
    // find title text inside entry-box
    const title = $(el).find('h3.entry-title, .entry-title a, h2.entry-title, h3.title, .title, a.title').text().trim() || $(el).find('h3').text().trim() || $(el).find('a').text().trim();
    
    let poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
    const rating = $(el).find('.rating, .font-size-12.text-white').text().trim(); // Need to guess rating class
    
    items.push({href, title, poster, rating});
});
console.log(items);
