/**
 * test_eta_scraper.js
 * سكريبت اختبار شامل ومتقدم لاختبار سحب بيانات موقع eta.animerco.org بناءً على الفحص العميق (deep_scan).
 * يحتوي على دوال مخصصة لكل قسم للتعامل مع هيكل الموقع الفعلي.
 */

const httpClient = require('./http_client');
const cheerio = require('cheerio');

const BASE_URL = 'https://eta.animerco.org';

// دالة تنظيف النصوص
function cleanText(text) {
  return text ? text.replace(/\s+/g, ' ').trim() : '';
}

// دالة لاختبار سحب صفحة قائمة الأفلام/الأنميات
async function testScrapeList(type, url) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎬 اختبار سحب قائمة: ${type.toUpperCase()}`);
  console.log(`🔗 الرابط: ${url}`);
  
  try {
    const response = await httpClient.get(url);
    const $ = cheerio.load(response.data);
    
    const items = [];
    // البطاقات موجودة في .media-block
    $('.media-block').each((i, el) => {
      // الرابط الأساسي للفيلم/الأنمي
      const linkEl = $(el).find(`a[href*="/${type}/"]`).first();
      let href = linkEl.attr('href');
      
      // إذا لم يجد الرابط المباشر، جرب أي رابط (كما في الصفحة الرئيسية أو الأقسام المدمجة)
      if (!href || href === `${BASE_URL}/${type}/`) {
         href = $(el).find('a').first().attr('href');
      }

      if (href && href !== `${BASE_URL}/${type}/` && href !== `${BASE_URL}/${type}`) {
        const title = cleanText(linkEl.attr('title') || $(el).find('.info h3, .info a').first().text() || 'بدون عنوان');
        const poster = $(el).find('img, .image').attr('data-src') || $(el).find('img, .image').attr('src');
        const slug = href.replace(`${BASE_URL}/${type}/`, '').replace(/\//g, '');
        
        items.push({ title, href, poster, slug });
      }
    });

    console.log(`✅ تم استخراج ${items.length} عنصر.`);
    if (items.length > 0) {
      console.log('📌 أول 3 عناصر:');
      items.slice(0, 3).forEach(item => console.log(`  - [${item.title}] \n    رابط: ${item.href}\n    بوستر: ${item.poster}`));
    }
    
    // استخراج معلومات الـ Pagination
    const paginationLinks = $('.pagination a, [class*="pag"] a').length;
    console.log(`📄 عدد روابط الصفحات (Pagination): ${paginationLinks}`);

    return items;
  } catch (err) {
    console.error(`❌ خطأ أثناء سحب قائمة ${type}:`, err.message);
    return [];
  }
}

// دالة لاختبار سحب تفاصيل أنمي
async function testScrapeAnimeDetails(url) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🔍 اختبار سحب تفاصيل أنمي`);
  console.log(`🔗 الرابط: ${url}`);

  try {
    const response = await httpClient.get(url);
    const $ = cheerio.load(response.data);
    
    const title = cleanText($('.tornado-header h1, h1, .media-story h1').first().text());
    const synopsis = cleanText($('.media-story p, .content p, [class*="story"] p').first().text());
    const poster = $('.anime-card .image').attr('data-src') || $('.poster img, .cover img, .anime-card img').attr('src') || $('.poster img, .cover img, .anime-card img').attr('data-src');
    
    let meta = { type: 'TV', duration: '', status: 'مستمر', year: '' };
    $('.details-section li, .media-info li').each((i, el) => {
      const text = cleanText($(el).text());
      if (text.includes('النوع:')) meta.type = text.replace('النوع:', '').trim();
      if (text.includes('مدة الحلقة:')) meta.duration = text.replace('مدة الحلقة:', '').trim();
      if (text.includes('الحلقات:')) meta.duration = text.replace('الحلقات:', '').trim() + ' حلقة';
      if (text.includes('بداية العرض:')) meta.year = text.replace('بداية العرض:', '').trim();
      if (text.includes('مكتمل') || text.includes('يعرض الأن')) meta.status = text.includes('مكتمل') ? 'مكتمل' : 'يعرض الأن';
    });

    const genres = [];
    $('.genres a, [class*="genre"] a').each((i, el) => {
      genres.push(cleanText($(el).text()));
    });

    // استخراج المواسم
    const seasons = [];
    $('ul li a[href*="/seasons/"]').each((i, el) => {
       const seasonUrl = $(el).attr('href');
       if(seasonUrl && seasonUrl !== `${BASE_URL}/seasons/`) {
           const seasonName = cleanText($(el).text());
           if(!seasons.find(s => s.url === seasonUrl)) {
               seasons.push({ name: seasonName || `الموسم ${seasons.length + 1}`, url: seasonUrl });
           }
       }
    });

    console.log(`✅ تم استخراج التفاصيل بنجاح:`);
    console.log(`  - العنوان: ${title}`);
    console.log(`  - القصة: ${synopsis.substring(0, 100)}...`);
    console.log(`  - البوستر: ${poster}`);
    console.log(`  - التصنيفات: ${genres.join(', ')}`);
    console.log(`  - معلومات إضافية:`, meta);
    console.log(`  - المواسم (${seasons.length}):`);
    seasons.slice(0, 3).forEach(s => console.log(`    * [${s.name}] -> ${s.url}`));
    
    return { title, synopsis, poster, genres, meta, seasons };
  } catch (err) {
    console.error(`❌ خطأ أثناء سحب تفاصيل الأنمي:`, err.message);
    return null;
  }
}

// دالة لاختبار سحب حلقات الموسم
async function testScrapeSeasonEpisodes(url) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎞️ اختبار سحب حلقات موسم`);
  console.log(`🔗 الرابط: ${url}`);

  try {
    const response = await httpClient.get(url);
    const $ = cheerio.load(response.data);
    
    const episodes = [];
    // الحلقات موجودة في ul.episodes-lists li أو a[href*="/episodes/"]
    $('ul.episodes-lists li, .media-episodes li').each((i, el) => {
      const linkEl = $(el).find('a').first();
      let href = linkEl.attr('href');
      // fallback
      if(!href) href = $(el).find('a[href*="/episodes/"]').attr('href');
      
      if (href) {
        const title = cleanText(linkEl.text() || $(el).text());
        const epNum = $(el).attr('data-number') || (i+1).toString();
        episodes.push({ number: epNum, title, url: href });
      }
    });

    // طريقة بديلة في حال لم يجد شيء
    if(episodes.length === 0) {
        $('a[href*="/episodes/"]').each((i, el) => {
            const href = $(el).attr('href');
            if(href && href !== `${BASE_URL}/episodes/`) {
                const title = cleanText($(el).text());
                if(!episodes.find(e => e.url === href)) {
                    episodes.push({ number: (episodes.length+1).toString(), title, url: href });
                }
            }
        });
    }

    console.log(`✅ تم استخراج ${episodes.length} حلقة.`);
    if(episodes.length > 0) {
        console.log('📌 أول 3 حلقات:');
        episodes.slice(0, 3).forEach(ep => console.log(`  - رقم ${ep.number} | ${ep.title} \n    رابط: ${ep.url}`));
    }

    return episodes;
  } catch (err) {
    console.error(`❌ خطأ أثناء سحب حلقات الموسم:`, err.message);
    return [];
  }
}

// دالة لاختبار سحب تفاصيل الحلقة (سيرفرات المشاهدة وروابط التحميل)
async function testScrapeEpisodeDetails(url) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📺 اختبار سحب تفاصيل حلقة (سيرفرات وتحميل)`);
  console.log(`🔗 الرابط: ${url}`);

  try {
    const response = await httpClient.get(url);
    const $ = cheerio.load(response.data);
    
    // استخراج سيرفرات المشاهدة
    const servers = [];
    $('.server-list li, .servers li, .watch-list li, ul.servers-list li').each((i, el) => {
        const serverEl = $(el).find('a, .server').first();
        const aEl = $(el).find('a').first();
        
        const name = cleanText(serverEl.text() || $(el).text());
        
        // قد يكون الرابط مباشر أو عبر Data Attributes (AJAX)
        const directUrl = aEl.attr('data-url') || aEl.attr('data-src') || aEl.attr('href') || aEl.attr('data-ep');
        const dataPost = aEl.attr('data-post');
        const dataNume = aEl.attr('data-nume');
        const dataNonce = aEl.attr('data-nonce');

        if(name) {
            servers.push({ 
                name, 
                directUrl: directUrl !== '#' ? directUrl : null,
                ajaxData: (dataPost && dataNume) ? { post: dataPost, nume: dataNume, nonce: dataNonce } : null
            });
        }
    });

    // استخراج روابط التحميل
    const downloads = [];
    $('.download-list li, .downloads li, [class*="download"] a, table tr, .link-list li').each((i, el) => {
        const text = cleanText($(el).text());
        const href = $(el).attr('href') || $(el).find('a').attr('href');
        
        // التأكد من أن النص ليس طويلاً جداً وأنه يحتوي على رابط حقيقي
        if(text.length > 2 && text.length < 100 && href && !href.startsWith('#')) {
            // محاولة تنظيف اسم الجودة
            const qualityMatch = text.match(/1080|720|480|360/);
            const quality = qualityMatch ? qualityMatch[0] + 'p' : text;
            downloads.push({ quality: text, url: href });
        }
    });

    console.log(`✅ تم استخراج ${servers.length} سيرفر مشاهدة.`);
    if(servers.length > 0) {
        servers.slice(0, 3).forEach(s => {
            if(s.ajaxData) console.log(`  - [${s.name}] (AJAX): Post=${s.ajaxData.post}, Nume=${s.ajaxData.nume}`);
            else console.log(`  - [${s.name}] -> ${s.directUrl}`);
        });
    }

    console.log(`✅ تم استخراج ${downloads.length} رابط تحميل.`);
    if(downloads.length > 0) {
        downloads.slice(0, 3).forEach(d => console.log(`  - [${d.quality}] -> ${d.url}`));
    }

    return { servers, downloads };
  } catch (err) {
    console.error(`❌ خطأ أثناء سحب تفاصيل الحلقة:`, err.message);
    return null;
  }
}

// دالة لاختبار سحب تفاصيل وحلقات مسلسل/أنمي بشكل كامل
async function runFullTest() {
  console.log('🚀 بدء الاختبار الشامل لسكريبتات السحب (Scraper Test)');
  
  // 1. اختبار قائمة الأنميات
  const animes = await testScrapeList('animes', `${BASE_URL}/animes/`);
  
  if (animes.length > 0) {
    // 2. أخذ أول أنمي واختبار تفاصيله
    const firstAnimeUrl = animes[0].href;
    const animeDetails = await testScrapeAnimeDetails(firstAnimeUrl);
    
    if (animeDetails && animeDetails.seasons.length > 0) {
      // 3. أخذ أول موسم من الأنمي واختبار حلقاته
      const firstSeasonUrl = animeDetails.seasons[0].url;
      const episodes = await testScrapeSeasonEpisodes(firstSeasonUrl);

      // 4. اختبار أول حلقة وسحب السيرفرات والتحميلات
      if (episodes && episodes.length > 0) {
         const firstEpisodeUrl = episodes[0].url;
         await testScrapeEpisodeDetails(firstEpisodeUrl);
      } else {
         console.log('⚠️ لا يوجد حلقات لهذا الموسم لاختبارها.');
      }
    } else {
        console.log('⚠️ لا يوجد مواسم لهذا الأنمي لاختبارها.');
    }
  }

  // 5. اختبار قائمة الأفلام
  await testScrapeList('movies', `${BASE_URL}/movies/`);

  console.log(`\n🎉 اكتمل الاختبار الشامل بنجاح!`);
  process.exit(0);
}

runFullTest();
