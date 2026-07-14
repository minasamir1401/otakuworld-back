const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('⏳ Reading data from SQLite database...');
  
  // Fetch all animes with all relations
  const animes = await prisma.anime.findMany({
    include: {
      seasons: {
        include: {
          episodes: {
            include: {
              servers: true,
              downloads: true
            }
          }
        }
      }
    }
  });
  
  // Fetch all visits
  const visits = await prisma.visit.findMany();
  
  const data = {
    animes,
    visits,
    exportedAt: new Date().toISOString()
  };
  
  const outputPath = path.resolve(__dirname, 'migration_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  
  console.log(`✅ Data exported successfully to ${outputPath}`);
  console.log(`📊 Statistics: ${animes.length} Animes, ${visits.length} Visits`);
}

main()
  .catch(err => {
    console.error('❌ Error during export query:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
