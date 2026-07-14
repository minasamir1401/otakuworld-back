const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('dump.html', 'utf8'));
const items = [];
$('.entry-image').each((i, el) => {
    const parent = $(el).parent();
    items.push({
        parentClass: parent.attr('class'),
        parentHTML: $.html(parent).substring(0, 150)
    });
});
console.log(items);
