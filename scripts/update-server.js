const http = require('http');
const path = require('path');
const fs = require('fs');

const port = process.env.UPDATE_SERVER_PORT || 8080;
const baseDir = process.env.UPDATE_DIR || path.join(__dirname, '..', 'dist');

const server = http.createServer((req, res) => {
  const filePath = path.join(baseDir, req.url);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`Update server running at http://localhost:${port}`);
  console.log(`Serving updates from ${baseDir}`);
});
