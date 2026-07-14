const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('dump.html', 'utf8'));
console.log('widget-body:', $('.widget-body').length);
console.log('col-lg-3:', $('.col-lg-3').length);
console.log('entry-image:', $('.entry-image').length);
console.log('entry-title:', $('.entry-title').length);
console.log('card:', $('.card').length);
