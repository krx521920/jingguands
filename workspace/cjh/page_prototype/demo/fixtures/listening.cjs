// Test-only readiness signal; the application still binds its own ephemeral port.
const http = require('node:http');
const createServer = http.createServer;
process.on('message', message => {
  if (message === 'coverage') {
    require('node:v8').takeCoverage();
    process.send({ coverage: true });
  }
});
http.createServer = function (...args) {
  const server = createServer.apply(this, args);
  server.once('listening', () => process.send({ port: server.address().port }));
  return server;
};
