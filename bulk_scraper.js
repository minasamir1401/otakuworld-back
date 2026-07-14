const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const CATEGORIES = [
  { url: "https://akwams.org/category/movies/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/", type: "movie-foreign" },
  { url: "https://akwams.org/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%89-%d9%85%d8%aa%d8%b1%d8%ac%d9%85%d9%87-2026/", type: "movie-foreign" },
  { url: "https://akwams.org/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a%d8%a9-%d9%85%d8%af%d8%a8%d9%84%d8%ac%d8%a9/", type: "movie-foreign" },
  { url: "https://akwams.org/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/", type: "movie-asian" },
  { url: "https://akwams.org/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/", type: "movie-turkish" },
  { url: "https://akwams.org/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%83%d8%b1%d8%aa%d9%88%d9%86/", type: "movie-cartoon" },
  { url: "https://akwams.org/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%87%d9%86%d8%af%d9%8a%d8%a9/", type: "movie-indian" },
  { url: "https://akwams.org/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d9%88%d8%ab%d8%a7%d8%a6%d9%82%d9%8a%d8%a9/", type: "movie-documentary" },
  { url: "https://akwams.org/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/", type: "series-foreign" },
  { url: "https://akwams.org/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%b3%d9%8a%d9%88%d9%8a%d8%a9/", type: "series-asian" },
  { url: "https://akwams.org/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%aa%d8%b1%d9%83%d9%8a%d8%a9/", type: "series-turkish" },
  { url: "https://akwams.org/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d9%83%d8%b1%d8%aa%d9%88%d9%86/", type: "series-cartoon" },
  { url: "https://akwams.org/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d9%88%d8%ab%d8%a7%d8%a6%d9%82%d9%8a%d8%a9/", type: "series-documentary" },
  { url: "https://akwams.org/category/%d8%a8%d8%b1%d8%a7%d9%85%d8%ac-%d8%aa%d9%84%d9%81%d8%b2%d9%8a%d9%88%d9%86%d9%8a%d8%a9/", type: "tv-shows" },
  { url: "https://akwams.org/category/%d8%b9%d8%b1%d9%88%d8%b6-%d9%88%d8%ad%d9%81%d9%84%d8%a7%d8%aa/", type: "shows" }
];

const STATE_FILE = path.join(__dirname, 'scraper_state.json');

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('❌ خطأ في قراءة ملف الحالة:', e.message);
    }
  }
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('❌ خطأ في حفظ ملف الحالة:', e.message);
  }
}

async function scrapeAkwamCatalog(categoryUrl, page = 1) {
  const url = page === 1 ? categoryUrl : `${categoryUrl.endsWith('/') ? categoryUrl : categoryUrl + '/'}page/${page}/`;
  console.log(`\n🔍 جاري فحص صفحة القسم: ${url}`);
  try {
    const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(response.data);
    const items = [];

    $('.entry-box-1').each((i, el) => {
      const linkEl = $(el).find('a').first();
      const itemUrl = linkEl.attr('href');
      const title = $(el).find('h3.entry-title, .entry-title a, h2.entry-title, h3.title, .title, a.title').text().trim() || $(el).find('h3').text().trim() || $(el).find('a').text().trim();
      
      const slug = itemUrl ? itemUrl.split('/').filter(Boolean).pop() : '';
      let poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
      if (poster && poster.startsWith('/')) poster = 'https://akwams.org' + poster;

      const rating = $(el).find('.rating, .font-size-12.text-white').text().trim() || '0.0';
      const year = $(el).find('.year, .label-year').text().trim() || '';

      if (title && itemUrl) {
        items.push({
          title,
          slug,
          url: itemUrl,
          poster,
          rating,
          year
        });
      }
    });

    const hasNextPage = $('.pagination a:contains("التالي"), .pagination a[rel="next"]').length > 0;
    return { items, hasNextPage };
  } catch (error) {
    console.error(`❌ خطأ أثناء فحص صفحة القسم ${page}:`, error.message);
    return { items: [], hasNextPage: false };
  }
}

async function scrapeAkwamDetails(itemUrl) {
  try {
    const response = await axios.get(itemUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(response.data);

    const synopsis = $('.widget-body p').first().text().trim();
    
    let duration = '';
    let status = 'مكتمل';
    
    const genres = [];
    $('.d-flex.align-items-center:contains("الأنواع") a').each((i, el) => {
      genres.push($(el).text().trim());
    });

    const downloadLinks = [];
    $('.link-btn').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && (href.includes('download') || href.includes('link'))) {
        downloadLinks.push({ url: href, quality: text });
      }
    });

    return {
      synopsis,
      duration,
      status,
      genres: genres.join(','),
      downloadLinks
    };
  } catch (error) {
    console.error(`❌ خطأ في تفاصيل العنصر (${itemUrl}):`, error.message);
    return null;
  }
}

async function processCategory(catData, state) {
  const { url: categoryUrl, type } = catData;
  console.log(`\n===========================================`);
  console.log(`🚀 بدء السحب للقسم: ${categoryUrl} (النوع: ${type})`);
  
  if (!state[categoryUrl]) {
    state[categoryUrl] = { page: 1, completed: false };
  }
  
  if (state[categoryUrl].completed) {
    console.log(`✅ هذا القسم مكتمل مسبقاً، سيتم تخطيه.`);
    return;
  }

  let currentPage = state[categoryUrl].page;
  let hasMore = true;

  while (hasMore) {
    const { items, hasNextPage } = await scrapeAkwamCatalog(categoryUrl, currentPage);
    hasMore = hasNextPage;

    if (items.length === 0) {
      console.log(`⚠️ لم يتم العثور على عناصر في الصفحة ${currentPage}. توقف لهذا القسم.`);
      break;
    }

    console.log(`📥 تم العثور على ${items.length} عنصر في الصفحة ${currentPage}.`);

    for (const itemData of items) {
      console.log(`\n⏳ سحب التفاصيل: "${itemData.title}"`);
      await sleep(1000);

      const details = await scrapeAkwamDetails(itemData.url);
      if (!details) continue;

      const anime = await prisma.anime.upsert({
        where: { url: itemData.url },
        update: {
          title: itemData.title,
          poster: itemData.poster,
          rating: itemData.rating,
          year: itemData.year,
          synopsis: details.synopsis,
          type: type,
          status: details.status,
          genres: details.genres
        },
        create: {
          title: itemData.title,
          slug: itemData.slug,
          url: itemData.url,
          poster: itemData.poster,
          rating: itemData.rating,
          year: itemData.year,
          synopsis: details.synopsis,
          type: type,
          status: details.status,
          genres: details.genres
        }
      });

      console.log(`✅ تم حفظ/تحديث: ${anime.title}`);

      const season = await prisma.season.upsert({
        where: { url: itemData.url },
        update: { name: 'المشاهدة' },
        create: {
          name: 'المشاهدة',
          slug: `${itemData.slug}-season`,
          url: itemData.url,
          animeId: anime.id
        }
      });

      const episode = await prisma.episode.upsert({
        where: { url: itemData.url },
        update: {
          number: '1',
          title: 'شاهد'
        },
        create: {
          number: '1',
          title: 'شاهد',
          slug: `${itemData.slug}-watch`,
          url: itemData.url,
          seasonId: season.id
        }
      });
    }

    if (hasMore) {
      currentPage++;
      state[categoryUrl].page = currentPage;
      saveState(state);
      console.log(`💾 تم حفظ الحالة. الصفحة القادمة: ${currentPage}`);
    } else {
      state[categoryUrl].completed = true;
      saveState(state);
      console.log(`🏆 تم الانتهاء من جميع صفحات هذا القسم!`);
    }
  }
}

async function main() {
  const state = loadState();
  
  for (const cat of CATEGORIES) {
    try {
      await processCategory(cat, state);
    } catch (error) {
      console.error(`❌ حدث خطأ أثناء معالجة القسم ${cat.url}:`, error);
      console.log('سيتم الانتقال للقسم التالي بعد 5 ثوانٍ...');
      await sleep(5000);
    }
  }

  console.log(`\n🎉 اكتمل السحب لجميع الأقسام المحددة!`);
}

main()
  .catch((e) => {
    console.error('❌ خطأ فادح أثناء السحب:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
