import WebSocketServer from './websocket-server.mjs';

const audioinput = new WebSocketServer();
const audiooutput = new WebSocketServer();

audioinput.on('message', (con, read) => {
  audiooutput.broadcast(read.data);
});

export { audioinput, audiooutput };
