const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const schemaPath = path.resolve(__dirname, 'prisma/schema.prisma');
const backupPath = path.resolve(__dirname, 'prisma/schema.prisma.bak');
const dbPath = path.resolve(__dirname, 'prisma/dev.db');

function runCommand(command, cwd) {
  console.log(`Running: ${command}`);
  cp.execSync(command, { cwd, stdio: 'inherit' });
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ SQLite database file not found at: ${dbPath}`);
    process.exit(1);
  }

  console.log('🚀 Starting SQLite data export process...');

  // 1. Create a backup of the current schema
  console.log('💾 Backing up schema.prisma...');
  fs.copyFileSync(schemaPath, backupPath);

  try {
    // 2. Modify schema.prisma to use SQLite provider
    console.log('🔄 Modifying schema.prisma for SQLite...');
    const originalSchema = fs.readFileSync(schemaPath, 'utf8');
    
    // Replace datasource block with sqlite datasource
    const sqliteSchema = originalSchema.replace(
      /datasource\s+db\s*{[\s\S]*?}/,
      `datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}`
    );
    
    fs.writeFileSync(schemaPath, sqliteSchema, 'utf8');

    // 3. Regenerate Prisma Client for SQLite
    console.log('📦 Generating Prisma Client for SQLite...');
    runCommand('npx prisma generate', __dirname);

    // 4. Run export query script
    console.log('📤 Executing export query...');
    runCommand('node db_export_query.js', __dirname);

  } catch (error) {
    console.error('❌ An error occurred during export:', error.message);
  } finally {
    // 5. Restore original schema.prisma
    if (fs.existsSync(backupPath)) {
      console.log('⏪ Restoring original schema.prisma...');
      fs.copyFileSync(backupPath, schemaPath);
      fs.unlinkSync(backupPath);
    }

    // 6. Regenerate Prisma Client for PostgreSQL
    console.log('📦 Restoring Prisma Client for PostgreSQL...');
    try {
      runCommand('npx prisma generate', __dirname);
      console.log('✅ SQLite export completed and environment restored.');
    } catch (restoreError) {
      console.error('⚠️ Failed to regenerate PostgreSQL client:', restoreError.message);
    }
  }
}

main();
