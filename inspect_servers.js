const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('./dump_detail_episode.html', 'utf8'));

console.log($('.server-list').html() || $('.servers').html() || $('.watch-list').html() || $('ul.servers-list').html());
