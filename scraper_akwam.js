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

async function scrapeAkwamCatalog(categoryUrl, page = 1) {
  const url = page === 1 ? categoryUrl : `${categoryUrl}?page=${page}`;
  console.log(`\n🔍 جاري فحص صفحة القسم: ${url}`);
  try {
    const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(response.data);
    const items = [];

    $('.widget-body .row .col-lg-3').each((i, el) => {
      const titleLink = $(el).find('.entry-title a');
      const title = titleLink.text().trim();
      const itemUrl = titleLink.attr('href');
      
      const slug = itemUrl ? itemUrl.split('/').filter(Boolean).pop() : '';
      let poster = $(el).find('.entry-image img').attr('data-src') || $(el).find('.entry-image img').attr('src');
      if (poster && poster.startsWith('/')) poster = 'https://akwams.org' + poster;

      const rating = $(el).find('.label-rating').text().trim() || '0.0';
      const year = $(el).find('.label-year').text().trim() || '';

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

    // Extract direct download links (mp4) - typically in Akwam these are in the download section
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

async function main() {
  const args = process.argv.slice(2);
  let categoryUrl = null;
  let type = 'movie-foreign';

  const catIdx = args.indexOf('--category');
  if (catIdx !== -1 && args[catIdx + 1]) {
    categoryUrl = args[catIdx + 1];
  }

  const typeIdx = args.indexOf('--type');
  if (typeIdx !== -1 && args[typeIdx + 1]) {
    type = args[typeIdx + 1];
  }

  if (!categoryUrl) {
    console.error('❌ يرجى تمرير رابط القسم باستخدام --category');
    process.exit(1);
  }

  console.log(`🚀 بدء عملية السحب من أكوام...`);
  console.log(`القسم: ${categoryUrl}`);
  console.log(`النوع الذي سيتم حفظه: ${type}`);

  let currentPage = 1;
  let hasMore = true;
  let totalSaved = 0;

  while (hasMore) {
    const { items, hasNextPage } = await scrapeAkwamCatalog(categoryUrl, currentPage);
    hasMore = hasNextPage;

    if (items.length === 0) {
      console.log(`⚠️ لم يتم العثور على عناصر في الصفحة ${currentPage}. توقف.`);
      break;
    }

    console.log(`📥 تم العثور على ${items.length} عنصر في الصفحة الحالية.`);

    for (const itemData of items) {
      console.log(`\n⏳ سحب التفاصيل: "${itemData.title}"`);
      await sleep(1000);

      const details = await scrapeAkwamDetails(itemData.url);
      if (!details) continue;

      // Upsert Metadata
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

      // Create a mock season for movies
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

      // Create a watch episode
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

      // TODO: Akwam requires an extra step to resolve download links into direct mp4s
      // For now, we will save the download pages as video servers and they can be resolved later.

      totalSaved++;
    }

    currentPage++;
  }

  console.log(`\n🎉 اكتمل السحب! تم حفظ/تحديث ${totalSaved} عنصر بنجاح.`);
}

main()
  .catch((e) => {
    console.error('❌ خطأ فادح أثناء السحب:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
