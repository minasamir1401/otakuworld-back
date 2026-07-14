const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const dataPath = path.resolve(__dirname, 'migration_data.json');

async function main() {
  if (!fs.existsSync(dataPath)) {
    console.log(`ℹ️ No migration data file found at: ${dataPath}. Skipping migration.`);
    process.exit(0);
  }

  // Check if database is already populated to run only once
  try {
    const existingAnimeCount = await prisma.anime.count();
    if (existingAnimeCount > 0) {
      console.log(`ℹ️ PostgreSQL database already has ${existingAnimeCount} animes. Skipping migration to prevent duplicate runs.`);
      process.exit(0);
    }
  } catch (err) {
    console.error('⚠️ Failed to check anime count in database:', err.message);
  }

  console.log('🚀 Starting data import to PostgreSQL...');
  const rawData = fs.readFileSync(dataPath, 'utf8');
  const { animes, visits } = JSON.parse(rawData);

  console.log(`📥 Loaded ${animes.length} Animes and ${visits ? visits.length : 0} Visits from file.`);

  // 1. Migrate Animes, Seasons, Episodes, Servers, and Downloads
  let animeCount = 0;
  let seasonCount = 0;
  let episodeCount = 0;
  let serverCount = 0;
  let downloadCount = 0;

  for (const anime of animes) {
    console.log(`⏳ Migrating Anime: "${anime.title}"...`);
    
    // Upsert Anime
    await prisma.anime.upsert({
      where: { url: anime.url },
      update: {
        title: anime.title,
        arabicTitle: anime.arabicTitle,
        slug: anime.slug,
        poster: anime.poster,
        synopsis: anime.synopsis,
        rating: anime.rating,
        type: anime.type,
        status: anime.status,
        year: anime.year,
        duration: anime.duration,
        genres: anime.genres,
        seoTitle: anime.seoTitle,
        seoDescription: anime.seoDescription,
        seoKeywords: anime.seoKeywords,
        createdAt: new Date(anime.createdAt),
        updatedAt: new Date(anime.updatedAt)
      },
      create: {
        id: anime.id, // Keep the same ID to preserve relations
        title: anime.title,
        arabicTitle: anime.arabicTitle,
        slug: anime.slug,
        url: anime.url,
        poster: anime.poster,
        synopsis: anime.synopsis,
        rating: anime.rating,
        type: anime.type,
        status: anime.status,
        year: anime.year,
        duration: anime.duration,
        genres: anime.genres,
        seoTitle: anime.seoTitle,
        seoDescription: anime.seoDescription,
        seoKeywords: anime.seoKeywords,
        createdAt: new Date(anime.createdAt),
        updatedAt: new Date(anime.updatedAt)
      }
    });
    animeCount++;

    // Migrate Seasons
    if (anime.seasons && anime.seasons.length > 0) {
      for (const season of anime.seasons) {
        await prisma.season.upsert({
          where: { url: season.url },
          update: {
            name: season.name,
            slug: season.slug,
            animeId: anime.id,
            createdAt: new Date(season.createdAt)
          },
          create: {
            id: season.id, // Preserve ID
            name: season.name,
            slug: season.slug,
            url: season.url,
            animeId: anime.id,
            createdAt: new Date(season.createdAt)
          }
        });
        seasonCount++;

        // Migrate Episodes
        if (season.episodes && season.episodes.length > 0) {
          for (const episode of season.episodes) {
            await prisma.episode.upsert({
              where: { url: episode.url },
              update: {
                number: episode.number,
                title: episode.title,
                slug: episode.slug,
                seasonId: season.id,
                createdAt: new Date(episode.createdAt)
              },
              create: {
                id: episode.id, // Preserve ID
                number: episode.number,
                title: episode.title,
                slug: episode.slug,
                url: episode.url,
                seasonId: season.id,
                createdAt: new Date(episode.createdAt)
              }
            });
            episodeCount++;

            // Migrate Video Servers
            if (episode.servers && episode.servers.length > 0) {
              for (const server of episode.servers) {
                await prisma.videoServer.upsert({
                  where: { id: server.id },
                  update: {
                    name: server.name,
                    embedUrl: server.embedUrl,
                    episodeId: episode.id,
                    createdAt: new Date(server.createdAt)
                  },
                  create: {
                    id: server.id,
                    name: server.name,
                    embedUrl: server.embedUrl,
                    episodeId: episode.id,
                    createdAt: new Date(server.createdAt)
                  }
                });
                serverCount++;
              }
            }

            // Migrate Download Links
            if (episode.downloads && episode.downloads.length > 0) {
              for (const download of episode.downloads) {
                await prisma.downloadLink.upsert({
                  where: { id: download.id },
                  update: {
                    quality: download.quality,
                    url: download.url,
                    episodeId: episode.id,
                    createdAt: new Date(download.createdAt)
                  },
                  create: {
                    id: download.id,
                    quality: download.quality,
                    url: download.url,
                    episodeId: episode.id,
                    createdAt: new Date(download.createdAt)
                  }
                });
                downloadCount++;
              }
            }
          }
        }
      }
    }
  }

  // 2. Migrate Visits
  let visitCount = 0;
  if (visits && visits.length > 0) {
    console.log('⏳ Migrating Visits...');
    for (const visit of visits) {
      // Check if visit already exists in target DB
      const existingVisit = await prisma.visit.findUnique({
        where: { id: visit.id }
      });
      
      if (!existingVisit) {
        await prisma.visit.create({
          data: {
            id: visit.id,
            path: visit.path,
            ip: visit.ip,
            createdAt: new Date(visit.createdAt)
          }
        });
        visitCount++;
      }
    }
  }

  console.log('\n🎉 Database migration completed successfully!');
  console.log('📊 Migration Summary:');
  console.log(`   - Animes: ${animeCount}`);
  console.log(`   - Seasons: ${seasonCount}`);
  console.log(`   - Episodes: ${episodeCount}`);
  console.log(`   - Video Servers: ${serverCount}`);
  console.log(`   - Download Links: ${downloadCount}`);
  console.log(`   - Visits: ${visitCount}`);

  // Delete the migration file after successful import to prevent runs on next boot
  try {
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
      console.log('🗑️ Deleted migration_data.json to prevent subsequent runs.');
    }
  } catch (err) {
    console.warn('⚠️ Warning: Failed to delete migration_data.json:', err.message);
  }
}

main()
  .catch(err => {
    console.error('❌ Error during import process:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
