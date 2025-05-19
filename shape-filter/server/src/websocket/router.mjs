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

import { audioinput, audiooutput } from './audio.mjs';
use('/audioinput', audioinput);
use('/audiooutput', audiooutput);

import { controlinput, controloutput } from './control.mjs';
use('/controlinput', controlinput);
use('/controloutput', controloutput);

export default websocket;
