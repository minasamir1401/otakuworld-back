const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');

const prisma = new PrismaClient();
const BASE_URL = 'https://eta.animerco.org';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Scrape detailed info and seasons for a single anime
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

// Scrape episodes of a season
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

async function syncSchedule() {
  console.log('🚀 بدء مزامنة الحلقات والأنميات الجديدة من جدول المواعيد (Schedule)...');
  const scheduleUrl = `${BASE_URL}/schedule/`;
  
  try {
    const response = await axios.get(scheduleUrl, { headers: HEADERS });
    const $ = cheerio.load(response.data);
    
    // Find all unique season links from the schedule tabs
    const seasonLinks = new Set();
    $('.tab-content .media-block').each((i, block) => {
      const href = $(block).find('a.anime-card, .anime-card a, .info a').first().attr('href');
      if (href && href.includes('/seasons/')) {
        seasonLinks.add(href);
      }
    });

    console.log(`📡 تم العثور على ${seasonLinks.size} مواسم في جدول المواعيد.`);

    let updatedCount = 0;

    for (const seasonUrl of seasonLinks) {
      console.log(`\n⏳ فحص الموسم: ${seasonUrl}`);
      await sleep(1000);

      // Fetch the season page to extract parent anime and episodes list
      let seasonPageResponse;
      try {
        seasonPageResponse = await axios.get(seasonUrl, { headers: HEADERS });
      } catch (err) {
        console.error(`❌ فشل تحميل صفحة الموسم ${seasonUrl}:`, err.message);
        continue;
      }

      const $$ = cheerio.load(seasonPageResponse.data);

      // Find the parent anime URL
      let animeUrl = null;
      $$('a[href*="/animes/"]').each((i, el) => {
        const href = $$(el).attr('href');
        if (href !== `${BASE_URL}/animes/` && href !== `${BASE_URL}/animes`) {
          animeUrl = href;
          return false; // break
        }
      });

      if (!animeUrl) {
        console.log(`⚠️ لم يتم العثور على رابط الأنمي الأب في صفحة الموسم.`);
        continue;
      }

      // Check if anime exists in our DB
      let anime = await prisma.anime.findUnique({
        where: { url: animeUrl }
      });

      if (!anime) {
        console.log(`🆕 أنمي جديد غير مسجل: جاري سحب تفاصيله من ${animeUrl}...`);
        await sleep(1000);
        const details = await scrapeAnimeDetails(animeUrl);
        if (!details) continue;

        const slug = animeUrl.replace(`${BASE_URL}/animes/`, '').replace(/\//g, '');
        const title = $$('.tornado-header h1, h1, .media-story h1').first().text().trim() || slug;

        anime = await prisma.anime.create({
          data: {
            title: title,
            slug: slug,
            url: animeUrl,
            poster: $$('.anime-card img').attr('src') || $$('.anime-card img').attr('data-src') || null,
            rating: '10.0',
            year: details.year || '2026',
            synopsis: details.synopsis,
            type: details.type,
            duration: details.duration,
            status: details.status,
            genres: details.genres
          }
        });
        console.log(`✅ تم تسجيل الأنمي الجديد: ${anime.title}`);
      }

      // Upsert the Season
      const seasonSlug = seasonUrl.replace(`${BASE_URL}/seasons/`, '').replace(/\//g, '');
      const seasonName = $$('.tornado-header h1, h1').first().text().replace(/\s+/g, ' ').trim() || 'الموسم 1';

      const season = await prisma.season.upsert({
        where: { url: seasonUrl },
        update: { name: seasonName },
        create: {
          name: seasonName,
          slug: seasonSlug,
          url: seasonUrl,
          animeId: anime.id
        }
      });

      // Fetch and upsert episodes of this season
      const episodes = await scrapeSeasonEpisodes(seasonUrl);
      console.log(`🟢 تم العثور على ${episodes.length} حلقة في هذا الموسم.`);

      let newEpisodesAdded = 0;
      for (const epData of episodes) {
        const existingEp = await prisma.episode.findUnique({
          where: { url: epData.url }
        });

        if (!existingEp) {
          await prisma.episode.create({
            data: {
              number: epData.number,
              title: epData.title,
              slug: epData.slug,
              url: epData.url,
              seasonId: season.id
            }
          });
          newEpisodesAdded++;
        }
      }

      if (newEpisodesAdded > 0) {
        console.log(`➕ تم إضافة ${newEpisodesAdded} حلقات جديدة لهذا الموسم!`);
        updatedCount += newEpisodesAdded;
      } else {
        console.log(`ℹ️ جميع حلقات هذا الموسم محدثة بالفعل.`);
      }
    }

    console.log(`\n🎉 اكتملت المزامنة بنجاح! تم إضافة ${updatedCount} حلقة جديدة بالكامل.`);
  } catch (error) {
    console.error('❌ خطأ أثناء مزامنة جدول المواعيد:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

syncSchedule();
