/**
 * deep_scan.js
 * يفحص بنية HTML الكاملة لجميع صفحات eta.animerco.org
 * ويحفظ HTML dump لكل صفحة ويطبع تحليل كامل
 */
const httpClient = require('./http_client');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://eta.animerco.org';

const PAGES = [
  { name: 'home',     url: `${BASE_URL}/` },
  { name: 'animes',   url: `${BASE_URL}/animes/` },
  { name: 'movies',   url: `${BASE_URL}/movies/` },
  { name: 'seasons',  url: `${BASE_URL}/seasons/` },
  { name: 'episodes', url: `${BASE_URL}/episodes/` },
];

// أول أنمي/موسم/حلقة سيتم اكتشافها ثم فحصها
let detailUrls = { anime: null, season: null, episode: null, movie: null };

function extractClasses($) {
  const classes = new Set();
  $('[class]').each((_, el) => {
    ($(el).attr('class') || '').split(/\s+/).forEach(c => {
      if (c && c.length > 2) classes.add(c);
    });
  });
  return [...classes].slice(0, 60).join(', ');
}

function printLinks($, label, selector, limit = 5) {
  const links = [];
  $(selector).each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().replace(/\s+/g, ' ').trim().substring(0, 50);
    if (href && !links.includes(href)) links.push({ href, text });
  });
  console.log(`\n  [${label}] → ${links.length} رابط`);
  links.slice(0, limit).forEach(l => console.log(`    • ${l.href}  "${l.text}"`));
  return links;
}

function analyzeCards($, name) {
  console.log(`\n  === بطاقات المحتوى ===`);
  
  const cardSelectors = [
    '.media-block', '.anime-card', '.movie-card', '.episode-card',
    '.box-5x1', '.box-7x1', '.box-2x1', '.box-3x1',
    '[class*="card"]', '[class*="block"]', '[class*="item"]',
    'article', '.entry', '.post'
  ];
  
  for (const sel of cardSelectors) {
    const count = $(sel).length;
    if (count > 0) {
      const first = $(sel).first();
      const firstHref = first.find('a[href]').first().attr('href') || '';
      const firstText = first.text().replace(/\s+/g, ' ').trim().substring(0, 60);
      console.log(`  ✅ "${sel}" → ${count} | أول رابط: ${firstHref.substring(0, 80)}`);
    }
  }
}

function analyzePagination($) {
  console.log(`\n  === Pagination ===`);
  const pagSels = [
    '.pagination a', '.nav-links a', '.page-numbers a',
    'a.next', 'a.prev', '[class*="pag"] a',
    'a[href*="page"]', 'a[href*="/page/"]'
  ];
  for (const sel of pagSels) {
    const count = $(sel).length;
    if (count > 0) {
      const hrefs = $(sel).map((_, el) => $(el).attr('href')).get().slice(0, 3);
      console.log(`  ✅ "${sel}" → ${count} | ${hrefs.join(', ')}`);
    }
  }
}

function analyzeFilters($) {
  console.log(`\n  === Filters / Tabs ===`);
  const filterSels = [
    '.tab', '.tabs', '[class*="tab"]', 'select', '.filter',
    '[class*="filter"]', '[class*="sort"]', 'nav a', '.genre a'
  ];
  for (const sel of filterSels) {
    const count = $(sel).length;
    if (count > 0) {
      console.log(`  ✅ "${sel}" → ${count}`);
    }
  }
}

async function scanPage(pageName, url) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📄 صفحة: ${pageName.toUpperCase()} → ${url}`);
  console.log('═'.repeat(60));
  
  try {
    const response = await httpClient.get(url);
    const html = response.data;
    const dumpPath = path.join(__dirname, `dump_${pageName}.html`);
    fs.writeFileSync(dumpPath, html, 'utf8');
    console.log(`💾 HTML محفوظ: ${dumpPath} (${(html.length / 1024).toFixed(1)} KB)`);
    
    const $ = cheerio.load(html);
    
    const title = $('title').text().trim();
    const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
    console.log(`📌 Title: ${title}`);
    console.log(`📌 H1: ${h1 || '(لا يوجد)'}`);
    
    // اكتشاف روابط مهمة
    const animeLinks = printLinks($, 'روابط /animes/', 'a[href*="/animes/"]');
    const seasonLinks = printLinks($, 'روابط /seasons/', 'a[href*="/seasons/"]');
    const episodeLinks = printLinks($, 'روابط /episodes/', 'a[href*="/episodes/"]');
    const movieLinks = printLinks($, 'روابط /movies/', 'a[href*="/movies/"]');
    
    // حفظ أول رابط تفصيلي
    for (const l of animeLinks) {
      if (l.href !== `${BASE_URL}/animes/` && !detailUrls.anime) {
        detailUrls.anime = l.href;
      }
    }
    for (const l of seasonLinks) {
      if (l.href !== `${BASE_URL}/seasons/` && !detailUrls.season) {
        detailUrls.season = l.href;
      }
    }
    for (const l of episodeLinks) {
      if (l.href !== `${BASE_URL}/episodes/` && !detailUrls.episode) {
        detailUrls.episode = l.href;
      }
    }
    for (const l of movieLinks) {
      if (l.href !== `${BASE_URL}/movies/` && !detailUrls.movie) {
        detailUrls.movie = l.href;
      }
    }
    
    analyzeCards($, pageName);
    analyzePagination($);
    analyzeFilters($);
    
    console.log(`\n  === Classes الموجودة ===`);
    console.log(' ', extractClasses($).substring(0, 300));
    
    return $;
  } catch (err) {
    console.error(`❌ خطأ في ${pageName}: ${err.message}`);
    return null;
  }
}

async function scanDetailPage(type, url) {
  if (!url) return;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔍 صفحة تفصيلية: ${type.toUpperCase()} → ${url}`);
  console.log('═'.repeat(60));
  
  try {
    const response = await httpClient.get(url);
    const html = response.data;
    const dumpPath = path.join(__dirname, `dump_detail_${type}.html`);
    fs.writeFileSync(dumpPath, html, 'utf8');
    console.log(`💾 HTML محفوظ: ${dumpPath} (${(html.length / 1024).toFixed(1)} KB)`);
    
    const $ = cheerio.load(html);
    const title = $('title').text().trim();
    console.log(`📌 Title: ${title}`);
    
    // ========== تحليل تفصيلي ==========
    console.log('\n  === بيانات تفصيلية ===');
    
    const infoSels = [
      '.details-section', '.media-info', '.info-section', '.meta',
      '[class*="detail"]', '[class*="info"]', '[class*="meta"]',
      '.sidebar', '.aside', 'aside'
    ];
    
    for (const sel of infoSels) {
      const el = $(sel).first();
      if (el.length) {
        const text = el.text().replace(/\s+/g, ' ').trim().substring(0, 150);
        console.log(`  ✅ "${sel}": ${text}`);
      }
    }
    
    // synopsis
    console.log('\n  === Synopsis ===');
    const synopsisSels = [
      '.media-story p', '.story p', '.synopsis p', '.description p',
      '.wp-content p', '.content p', '[class*="story"]', '[class*="synopsis"]',
      '[class*="desc"]', '#synopsis', '.plot'
    ];
    for (const sel of synopsisSels) {
      const text = $(sel).first().text().replace(/\s+/g, ' ').trim();
      if (text) console.log(`  ✅ "${sel}": ${text.substring(0, 120)}`);
    }
    
    // poster/image
    console.log('\n  === صورة Poster ===');
    const imgSels = [
      '.poster img', '.cover img', '.thumbnail img', '.image img',
      '[class*="poster"] img', '[class*="cover"] img', 'img.poster',
      '.anime-card img', '.media-card img', '.entry-image img',
      'img[src*="uploads"]'
    ];
    for (const sel of imgSels) {
      const src = $(sel).first().attr('src') || $(sel).first().attr('data-src') || '';
      if (src) console.log(`  ✅ "${sel}": ${src.substring(0, 100)}`);
    }
    
    // seasons list
    console.log('\n  === قائمة المواسم ===');
    const seasonListSels = [
      '.media-seasons li', '.seasons-list li', '.season-list li',
      '[class*="season"] li', 'ul.episodes-lists li', 'ul li a[href*="/seasons/"]',
      '.seasons ul li', '.accordion-item'
    ];
    for (const sel of seasonListSels) {
      const count = $(sel).length;
      if (count > 0) {
        const first = $(sel).first().text().replace(/\s+/g, ' ').trim();
        const firstHref = $(sel).first().find('a').attr('href') || $(sel).first().closest('a').attr('href') || '';
        console.log(`  ✅ "${sel}" → ${count} | "${first.substring(0,50)}" | ${firstHref}`);
      }
    }
    
    // episodes list
    console.log('\n  === قائمة الحلقات ===');
    const epListSels = [
      '.media-episodes li', '.episodes-list li', 'ul.episodes-lists li',
      '[class*="episode"] li', '.episode-item', '[class*="ep"] li',
      'a[href*="/episodes/"]'
    ];
    for (const sel of epListSels) {
      const count = $(sel).length;
      if (count > 0) {
        const first = $(sel).first().text().replace(/\s+/g, ' ').trim();
        const firstHref = $(sel).first().find('a').attr('href') || $(sel).first().attr('href') || '';
        console.log(`  ✅ "${sel}" → ${count} | "${first.substring(0,50)}" | ${firstHref.substring(0,80)}`);
      }
    }
    
    // video/stream sources
    console.log('\n  === مصادر الفيديو ===');
    const videoSels = [
      'iframe[src]', 'video source', '.player iframe', '[class*="player"] iframe',
      '#player', '.embed', '[class*="embed"]', 'source[src]'
    ];
    for (const sel of videoSels) {
      const count = $(sel).length;
      if (count > 0) {
        const src = $(sel).first().attr('src') || '';
        console.log(`  ✅ "${sel}" → ${count} | src: ${src.substring(0, 100)}`);
      }
    }
    
    // genres
    console.log('\n  === التصنيفات ===');
    const genreSels = [
      '.genres a', '.genre a', '[class*="genre"] a', 'a[href*="/genre/"]',
      'a[href*="genre"]', '.tags a', '[class*="tag"] a', '.category a'
    ];
    for (const sel of genreSels) {
      const genres = $(sel).map((_, el) => $(el).text().trim()).get().join(', ');
      if (genres) console.log(`  ✅ "${sel}": ${genres.substring(0, 100)}`);
    }
    
    // meta info (year, type, status, duration)
    console.log('\n  === معلومات Meta ===');
    const allText = $('li, .meta-item, [class*="meta"] span, .info span, .detail span')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(t => t.length > 3 && t.length < 100)
      .slice(0, 20);
    allText.forEach(t => console.log(`    • ${t}`));
    
    console.log('\n  === Classes الكاملة ===');
    console.log(' ', extractClasses($).substring(0, 400));
    
  } catch (err) {
    console.error(`❌ خطأ في ${type}: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 بدء الفحص الشامل لـ eta.animerco.org\n');
  
  // 1. مسح جميع الصفحات الرئيسية
  for (const page of PAGES) {
    await scanPage(page.name, page.url);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // 2. تلخيص الروابط المكتشفة
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📋 روابط التفصيل المكتشفة:');
  console.log('═'.repeat(60));
  Object.entries(detailUrls).forEach(([type, url]) => {
    console.log(`  ${type}: ${url || '❌ لم يُكتشف'}`);
  });
  
  // 3. فحص صفحات التفصيل
  await new Promise(r => setTimeout(r, 2000));
  await scanDetailPage('anime', detailUrls.anime);
  await new Promise(r => setTimeout(r, 2000));
  await scanDetailPage('season', detailUrls.season);
  await new Promise(r => setTimeout(r, 2000));
  await scanDetailPage('episode', detailUrls.episode);
  await new Promise(r => setTimeout(r, 2000));
  await scanDetailPage('movie', detailUrls.movie);
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log('✅ انتهى الفحص الكامل!');
  console.log('📁 ملفات HTML المحفوظة: dump_*.html');
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
