const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');

const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const BASE_URL = 'https://eta.animerco.org';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeCatalogPage(page = 1) {
  const url = page === 1 ? `${BASE_URL}/movies/` : `${BASE_URL}/movies/page/${page}/`;
  console.log(`\n🔍 جاري فحص صفحة مكتبة الأفلام: ${url}`);
  try {
    const response = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(response.data);
    const movies = [];

    $('div.media-block').each((i, el) => {
      const titleLink = $(el).find('.info h3 a, .info a').first();
      const title = $(el).find('.info h3').text().trim();
      const movieUrl = titleLink.attr('href');
      
      const slug = movieUrl ? movieUrl.replace(`${BASE_URL}/movies/`, '').replace(`${BASE_URL}/animes/`, '').replace(/\//g, '') : '';
      const poster = $(el).find('a.image').attr('data-src') || $(el).find('a.image img').attr('src');
      const rating = $(el).find('.rating').text().replace('التقييم', '').trim() || '0.0';
      const year = $(el).find('.anime-aired').text().trim() || '';

      if (title && movieUrl) {
        movies.push({
          title,
          slug,
          url: movieUrl,
          poster,
          rating,
          year
        });
      }
    });

    const hasNextPage = $(`a[href*="/page/${page + 1}/"]`).length > 0;
    return { movies, hasNextPage };
  } catch (error) {
    console.error(`❌ خطأ أثناء فحص صفحة الأفلام ${page}:`, error.message);
    return { movies: [], hasNextPage: false };
  }
}

async function scrapeMovieDetails(movieUrl) {
  try {
    const response = await axios.get(movieUrl, { headers: HEADERS });
    const $ = cheerio.load(response.data);

    const synopsis = $('.media-story .content p, .media-story .content').first().text().trim() || $('.wp-content p, #info p').text().trim() || '';
    
    let duration = '';
    let status = 'مكتمل';
    let year = '';

    $('.details-section li, li').each((i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.includes('مدة الفيلم:') || text.includes('مدة الحلقة:')) {
        duration = text.replace('مدة الفيلم:', '').replace('مدة الحلقة:', '').trim();
      } else if (text.includes('بداية العرض:')) {
        year = text.replace('بداية العرض:', '').trim();
      }
    });

    const genres = [];
    $('.genres a, .genre a, a[href*="/genre/"]').each((i, el) => {
      genres.push($(el).text().trim());
    });

    return {
      synopsis,
      duration,
      status,
      genres: genres.join(','),
      year
    };
  } catch (error) {
    console.error(`❌ خطأ في تفاصيل الفيلم (${movieUrl}):`, error.message);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let startPageArg = null;
  const startPageIdx = args.indexOf('--start-page');
  if (startPageIdx !== -1 && args[startPageIdx + 1]) {
    startPageArg = parseInt(args[startPageIdx + 1], 10);
  }

  const stateFilePath = path.join(__dirname, 'scraper_movies_state.json');
  let state = { lastMoviePage: 1 };

  console.log('🚀 بدء عملية سحب بيانات الأفلام فقط...');
  console.log(`قاعدة البيانات الحالية لن يتم تفريغها.`);

  if (fs.existsSync(stateFilePath)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
      console.log(`ℹ️ تم العثور على جلسة سابقة. آخر صفحة تم سحبها: ${state.lastMoviePage}.`);
    } catch (e) {
      console.error('⚠️ خطأ في قراءة ملف الجلسة السابقة:', e.message);
    }
  }

  let currentPage = 1;
  if (startPageArg !== null) {
    currentPage = startPageArg;
    console.log(`ℹ️ البدء من الصفحة المحددة يدوياً: ${currentPage}`);
  } else {
    currentPage = state.lastMoviePage || 1;
    if (currentPage > 1) {
      console.log(`ℹ️ استكمال السحب تلقائياً من الصفحة: ${currentPage}`);
    }
  }

  let hasMore = true;
  let totalSaved = 0;

  while (hasMore) {
    const { movies, hasNextPage } = await scrapeCatalogPage(currentPage);
    hasMore = hasNextPage;

    if (movies.length === 0) {
      console.log(`⚠️ لم يتم العثور على أفلام في الصفحة ${currentPage}. توقف.`);
      break;
    }

    console.log(`📥 تم العثور على ${movies.length} فيلم في الصفحة الحالية.`);

    for (const movieData of movies) {
      console.log(`\n⏳ سحب تفاصيل الفيلم: "${movieData.title}"`);
      await sleep(1000);

      const details = await scrapeMovieDetails(movieData.url);
      if (!details) continue;

      // Upsert Movie Metadata
      const anime = await prisma.anime.upsert({
        where: { url: movieData.url },
        update: {
          title: movieData.title,
          poster: movieData.poster,
          rating: movieData.rating,
          year: movieData.year || details.year,
          synopsis: details.synopsis,
          type: 'Movie',
          duration: details.duration,
          status: details.status,
          genres: details.genres
        },
        create: {
          title: movieData.title,
          slug: movieData.slug,
          url: movieData.url,
          poster: movieData.poster,
          rating: movieData.rating,
          year: movieData.year || details.year,
          synopsis: details.synopsis,
          type: 'Movie',
          duration: details.duration,
          status: details.status,
          genres: details.genres
        }
      });

      console.log(`✅ تم حفظ/تحديث الفيلم: ${anime.title}`);

      // Create a mock season for watch page navigation
      const season = await prisma.season.upsert({
        where: { url: movieData.url },
        update: { name: 'الفيلم' },
        create: {
          name: 'الفيلم',
          slug: `${movieData.slug}-movie`,
          url: movieData.url,
          animeId: anime.id
        }
      });

      // Create a watch episode
      await prisma.episode.upsert({
        where: { url: movieData.url },
        update: {
          number: '1',
          title: 'شاهد الفيلم'
        },
        create: {
          number: '1',
          title: 'شاهد الفيلم',
          slug: `${movieData.slug}-watch`,
          url: movieData.url,
          seasonId: season.id
        }
      });

      totalSaved++;
    }

    // Save state after finishing page successfully
    state = { lastMoviePage: currentPage + 1 };
    try {
      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.error('⚠️ خطأ في حفظ حالة السحب:', err.message);
    }

    currentPage++;
  }

  console.log(`\n🎉 اكتمل سحب الأفلام! تم حفظ/تحديث ${totalSaved} فيلم بنجاح.`);
}

main()
  .catch((e) => {
    console.error('❌ خطأ فادح أثناء سحب الأفلام:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
