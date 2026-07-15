const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('./dump_detail_episode.html', 'utf8'));

console.log('--- Video Servers ---');
$('.server-list li, .servers li, [class*="server"] li, .watch-list li, .servers-list li').each((i, el) => {
    console.log($(el).text().trim() + ' -> ' + ($(el).attr('data-url') || $(el).attr('data-src') || $(el).find('a').attr('href') || $(el).attr('data-ep')));
});

console.log('\n--- IFrames ---');
$('iframe').each((i, el) => {
    console.log($(el).attr('src'));
});

console.log('\n--- Download Links ---');
$('.download-list li, .downloads li, [class*="download"] a, table tr, .link-list li').each((i, el) => {
    let text = $(el).text().replace(/\s+/g, ' ').trim();
    let href = $(el).attr('href') || $(el).find('a').attr('href');
    if(text.length > 2 && text.length < 50 && href && !href.startsWith('#')) {
        console.log(text + ' -> ' + href);
    }
});

console.log('\n--- Classes inside details-side ---');
let classes = new Set();
$('.details-side [class]').each((i, el) => {
   ($(el).attr('class')||'').split(/\s+/).forEach(c => classes.add(c));
});
console.log([...classes].join(', '));
