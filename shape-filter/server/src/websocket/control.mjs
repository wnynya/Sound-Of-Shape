import WebSocketServer from './websocket-server.mjs';

const controlinput = new WebSocketServer();
const controloutput = new WebSocketServer();

controlinput.on('message', (con, read) => {
  controloutput.broadcast(read.data);
});

export { controlinput, controloutput };
