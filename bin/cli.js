#!/usr/bin/env node

var WebSocket = require('ws');
var Http = require('http');
var Fs = require('fs');
var Path = require('path');
var Commander = require('commander');
var Assert = require('assert');
var Server = require('../lib/server.js');
var Express = require('express');

Commander.version(require(Path.join(__dirname, '..', 'package.json')).version)
  .option('-p, --port [integer]', 'HTTP port', ((i, d) => parseInt(i || d)), process.env['PORT'] || 3000)
  .option('    --bind [string]', 'HTTP bind', '127.0.0.1')
  .option('    --state-file [string]', 'State file', '.compose-reactor.state.json')
  .parse(process.argv);

var server = new Server(Commander);
var app = Express();
app.use(Express.static(Path.join(__dirname, '..', 'static')));

var httpServer = Http.createServer(app);

var wsServer = new WebSocket.Server({
  server: httpServer,
  maxPayload: 4096 * 1024 * 1024
});

wsServer.on('connection', (socket) => {
  server.handleWebSocket(socket);
});

httpServer.listen(Commander.port, Commander.bind, () => {
  var address = httpServer.address();
  console.log('listening to http://' + address.address + ':' + address.port);
});
