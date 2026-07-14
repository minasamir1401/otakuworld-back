const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');

const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const BASE_URL = 'https://eta.animerco.org';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://eta.animerco.org/',
  'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
  'Connection': 'keep-alive'
};

// Sleep helper to avoid rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1. Scrape catalog page
// 1. Scrape catalog page (Animes or Movies)
async function scrapeCatalogPage(page = 1, isMovie = false) {
  const path = isMovie ? 'movies' : 'animes';
  const url = page === 1 ? `${BASE_URL}/${path}/` : `${BASE_URL}/${path}/page/${page}/`;
  console.log(`\n🔍 جاري فحص صفحة المكتبة: ${url}`);
  try {
    const response = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(response.data);
    const animes = [];

    $('div.media-block').each((i, el) => {
      const titleLink = $(el).find('.info h3 a, .info a').first();
      const title = $(el).find('.info h3').text().trim();
      const animeUrl = titleLink.attr('href');
      
      const slug = animeUrl ? animeUrl.replace(`${BASE_URL}/animes/`, '').replace(`${BASE_URL}/movies/`, '').replace(/\//g, '') : '';
      const poster = $(el).find('a.image').attr('data-src') || $(el).find('a.image img').attr('src');
      const rating = $(el).find('.rating').text().replace('التقييم', '').trim() || '0.0';
      const year = $(el).find('.anime-aired').text().trim() || '';

      if (title && animeUrl) {
        animes.push({
          title,
          slug,
          url: animeUrl,
          poster,
          rating,
          year
        });
      }
    });

    const hasNextPage = $(`a[href*="/page/${page + 1}/"]`).length > 0;
    return { animes, hasNextPage };
  } catch (error) {
    console.error(`❌ خطأ أثناء فحص الصفحة ${page}:`, error.message);
    return { animes: [], hasNextPage: false };
  }
}

// 2. Scrape detailed info and seasons for a single anime
async function scrapeAnimeDetails(animeUrl) {
  try {
    const response = await axios.get(animeUrl, { headers: HEADERS });
    const $ = cheerio.load(response.data);

    const synopsis = $('.media-story .content p, .media-story .content').first().text().trim() || $('.wp-content p, #info p').text().trim() || '';
    
    let type = 'TV';
    let duration = '';
    let status = 'مستمر';
    let year = '';

    $('.details-section li, li').each((i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.includes('النوع:')) {
        type = text.replace('النوع:', '').trim();
      } else if (text.includes('مدة الحلقة:')) {
        duration = text.replace('مدة الحلقة:', '').trim();
      } else if (text.includes('الحلقات:')) {
        duration = text.replace('الحلقات:', '').trim() + ' حلقة';
      } else if (text.includes('بداية العرض:')) {
        year = text.replace('بداية العرض:', '').trim();
      }
    });

    const statusBadge = $('.details-section .badge, .badge, .status').first().text().trim();
    if (statusBadge) {
      status = statusBadge;
    }

    const genres = [];
    $('.genres a, .genre a, a[href*="/genre/"]').each((i, el) => {
      genres.push($(el).text().trim());
    });

    const seasons = [];
    $('.media-seasons ul.episodes-lists li').each((i, el) => {
      const titleLink = $(el).find('a.title').first();
      const seasonName = titleLink.text().replace(/\s+/g, ' ').trim();
      const seasonUrl = titleLink.attr('href');
      const seasonSlug = seasonUrl ? seasonUrl.replace(`${BASE_URL}/seasons/`, '').replace(/\//g, '') : '';
      
      if (seasonName && seasonUrl) {
        seasons.push({
          name: seasonName,
          url: seasonUrl,
          slug: seasonSlug
        });
      }
    });

    return {
      synopsis,
      type,
      duration,
      status,
      genres: genres.join(','),
      seasons
    };
  } catch (error) {
    console.error(`❌ خطأ في تفاصيل الأنمي (${animeUrl}):`, error.message);
    return null;
  }
}

// 3. Scrape all episode links of a specific season
async function scrapeSeasonEpisodes(seasonUrl) {
  try {
    const response = await axios.get(seasonUrl, { headers: HEADERS });
    const $ = cheerio.load(response.data);
    const episodes = [];

    $('.media-episodes ul.episodes-lists li').each((i, el) => {
      const epNum = $(el).attr('data-number') || String(i + 1);
      const titleLink = $(el).find('a.title').first();
      const epTitle = titleLink.text().replace(/\s+/g, ' ').trim();
      const epUrl = titleLink.attr('href');
      const epSlug = epUrl ? epUrl.replace(`${BASE_URL}/episodes/`, '').replace(/\//g, '') : '';

      if (epUrl) {
        episodes.push({
          number: epNum,
          title: epTitle || `الحلقة ${epNum}`,
          url: epUrl,
          slug: epSlug
        });
      }
    });

    return episodes;
  } catch (error) {
    console.error(`❌ خطأ في حلقات الموسم (${seasonUrl}):`, error.message);
    return [];
  }
}

// Main Crawler Logic
// Main Crawler Logic
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let maxPages = Infinity;
  const pagesIdx = args.indexOf('--pages');
  if (pagesIdx !== -1 && args[pagesIdx + 1]) {
    maxPages = parseInt(args[pagesIdx + 1], 10);
  }

  let startPageArg = null;
  const startPageIdx = args.indexOf('--start-page');
  if (startPageIdx !== -1 && args[startPageIdx + 1]) {
    startPageArg = parseInt(args[startPageIdx + 1], 10);
  }

  const stateFilePath = path.join(__dirname, 'scraper_state.json');
  let state = { lastAnimePage: 1, lastMoviePage: 1, currentCatalog: 'animes' };

  console.log('🚀 بدء عملية سحب بيانات الأنمي والأفلام...');
  console.log(`قاعدة البيانات: prisma/dev.db`);
  
  const cleanIdx = args.indexOf('--clean');
  if (cleanIdx !== -1) {
    if (fs.existsSync(stateFilePath)) {
      try {
        fs.unlinkSync(stateFilePath);
      } catch (e) {}
    }
    console.log('🧹 جاري مسح البيانات القديمة من قاعدة البيانات...');
    try {
      await prisma.anime.deleteMany();
      console.log('✅ تم مسح البيانات القديمة بنجاح.');
    } catch (dbErr) {
      console.error('⚠️ خطأ أثناء مسح البيانات القديمة:', dbErr.message);
    }
  } else {
    console.log('ℹ️ سيتم التحديث التراكمي (Upsert) دون مسح البيانات القديمة لتمكين إيقاف واستكمال السحب.');
    if (fs.existsSync(stateFilePath)) {
      try {
        state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        console.log(`ℹ️ تم العثور على جلسة سابقة. آخر صفحة تم سحبها: مسلسلات (${state.lastAnimePage})، أفلام (${state.lastMoviePage}).`);
      } catch (e) {
        console.error('⚠️ خطأ في قراءة ملف الجلسة السابقة:', e.message);
      }
    }
  }

  if (maxPages !== Infinity) {
    console.log(`الحد الأقصى للصفحات المطلوب سحبها لكل قسم: ${maxPages}`);
  }

  let totalAnimesSaved = 0;

  // Helper helper function to scrape a specific catalog type
  async function scrapeCatalog(isMovie = false) {
    const typeLabel = isMovie ? 'أفلام' : 'مسلسلات أنمي';
    console.log(`\n📂 البدء في سحب قسم: ${typeLabel}`);
    
    let currentPage = 1;
    if (startPageArg !== null) {
      currentPage = startPageArg;
      console.log(`ℹ️ البدء من الصفحة المحددة يدوياً: ${currentPage}`);
    } else {
      currentPage = isMovie ? state.lastMoviePage : state.lastAnimePage;
      if (currentPage > 1) {
        console.log(`ℹ️ استكمال السحب تلقائياً من الصفحة: ${currentPage}`);
      }
    }
    let hasMore = true;

    while (hasMore && currentPage <= maxPages) {
      const { animes, hasNextPage } = await scrapeCatalogPage(currentPage, isMovie);
      hasMore = hasNextPage;

      if (animes.length === 0) {
        console.log(`⚠️ لم يتم العثور على ${typeLabel} في هذه الصفحة. الانتقال للخطوة التالية.`);
        break;
      }

      console.log(`📥 تم العثور على ${animes.length} ${typeLabel} في الصفحة الحالية.`);

      for (const animeData of animes) {
        console.log(`\n⏳ سحب تفاصيل: "${animeData.title}"`);
        await sleep(1000);

        const details = await scrapeAnimeDetails(animeData.url);
        if (!details) continue;

        const animeType = isMovie ? 'Movie' : (details.type || 'TV');

        // Upsert Anime Metadata
        const anime = await prisma.anime.upsert({
          where: { url: animeData.url },
          update: {
            title: animeData.title,
            poster: animeData.poster,
            rating: animeData.rating,
            year: animeData.year,
            synopsis: details.synopsis,
            type: animeType,
            duration: details.duration,
            status: details.status,
            genres: details.genres
          },
          create: {
            title: animeData.title,
            slug: animeData.slug,
            url: animeData.url,
            poster: animeData.poster,
            rating: animeData.rating,
            year: animeData.year,
            synopsis: details.synopsis,
            type: animeType,
            duration: details.duration,
            status: details.status,
            genres: details.genres
          }
        });

        console.log(`✅ تم حفظ/تحديث: ${anime.title}`);

        // If it is a movie (or has 0 seasons), create a mock season and episode
        if (details.seasons.length === 0) {
          details.seasons.push({
            name: 'الفيلم',
            slug: `${animeData.slug}-movie`,
            url: animeData.url,
            isMovie: true
          });
        }

        // Process Seasons
        for (const seasonData of details.seasons) {
          console.log(`  🔹 معالجة الموسم: ${seasonData.name}`);
          await sleep(1000);

          const season = await prisma.season.upsert({
            where: { url: seasonData.url },
            update: { name: seasonData.name },
            create: {
              name: seasonData.name,
              slug: seasonData.slug,
              url: seasonData.url,
              animeId: anime.id
            }
          });

          // Fetch Episodes for this Season
          let episodes = [];
          if (seasonData.isMovie) {
            episodes = [{
              number: '1',
              title: 'شاهد الفيلم',
              url: animeData.url,
              slug: `${animeData.slug}-watch`
            }];
          } else {
            episodes = await scrapeSeasonEpisodes(seasonData.url);
          }

          console.log(`    🟢 تم العثور على ${episodes.length} حلقة.`);

          for (const epData of episodes) {
            await prisma.episode.upsert({
              where: { url: epData.url },
              update: {
                number: epData.number,
                title: epData.title
              },
              create: {
                number: epData.number,
                title: epData.title,
                slug: epData.slug,
                url: epData.url,
                seasonId: season.id
              }
            });
          }
        }

        totalAnimesSaved++;
      }

      // Save state after finishing page successfully
      state = {
        lastAnimePage: isMovie ? state.lastAnimePage : currentPage + 1,
        lastMoviePage: isMovie ? currentPage + 1 : state.lastMoviePage,
        currentCatalog: isMovie ? 'movies' : 'animes'
      };
      try {
        fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
      } catch (err) {
        console.error('⚠️ خطأ في حفظ حالة السحب:', err.message);
      }

      currentPage++;
    }
  }

  // Scrape both catalogs sequentially
  await scrapeCatalog(false); // Animes
  await scrapeCatalog(true);  // Movies

  console.log(`\n🎉 اكتملت عملية السحب بنجاح! تم حفظ ${totalAnimesSaved} مادة بالكامل (أنميات وأفلام).`);
}

main()
  .catch((e) => {
    console.error('❌ حدث خطأ فادح في عملية السحب:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
