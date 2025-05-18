import WebSocketServer from './websocket-server.mjs';

const wssai = new WebSocketServer();
const wssao = new WebSocketServer();

wssai.on('message', (con, read) => {
  wssao.broadcast(read.data);
});

const servers = {};
function websocket(req, socket, head) {
  const path = req.url.replace(/\?(.*)/, '').toLowerCase();
  const server = servers[path];
  if (!server) {
    socket.destroy();
    return;
  }
  server.handleUpgrade(req, socket, head);
}
function use(path, server) {
  servers[path] = server;
}

use('/audioinput', wssai);
use('/audiooutput', wssao);

export default websocket;
