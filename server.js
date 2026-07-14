const http = require('http');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;

// Function to run the schedule syncer script
function runSyncer() {
  console.log(`[${new Date().toISOString()}] [Syncer] Running sync_schedule.js...`);
  
  exec('node sync_schedule.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`[Syncer] Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`[Syncer] Stderr: ${stderr}`);
    }
    console.log(`[Syncer] Sync completed successfully:\n${stdout}`);
  });
}

// Start the syncer: run immediately on start, then every 2 hours
runSyncer();
setInterval(runSyncer, 1000 * 60 * 60 * 2); // 2 hours

// Create a simple HTTP server to keep the container active and satisfy Dokploy health checks
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Otakuworld Backend Scraper & Syncer is active and running.');
});

server.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
