import { SerialPort, SerialPortMock } from 'serialport';
import WebSocketServer from './websocket-server.mjs';

const PORT = '/dev/cu.usbserial-130';
const BAUDRATE = 9600;

const ws = new WebSocketServer();

let serial;
async function openSerial() {
  return new Promise((resolve) => {
    serial = new SerialPort({ path: PORT, baudRate: BAUDRATE });

    serial.on('open', () => {
      console.log(`Serial port ${PORT} opened.`);
      resolve();
    });

    let buffer = '';
    serial.on('data', (buf) => {
      let str = buf.toString();
      str = str.replace(/\r|\n/g, '');

      for (let i = 0; i < str.length; i++) {
        const char = str.charAt(i);
        if (char === ';') {
          const splits = buffer.split(',');
          let values = [];
          splits.forEach((v) => {
            values.push(v / 1023);
          });
          values.shift();
          ws.broadcast(
            JSON.stringify({
              event: 'controller',
              data: {
                mode: splits[0],
                values: values,
              },
            })
          );
          buffer = '';
        } else {
          buffer += char;
        }
      }
    });
  });
}
openSerial();

import http from 'node:http';

let port = 80;
for (let i = 0; i < process.argv.length; i++) {
  if (
    process.argv[i] == '-p' &&
    process.argv.length > i + 1 &&
    process.argv[i + 1]
  ) {
    port = process.argv[i + 1];
    i++;
  }
}

http
  .createServer(() => {})
  .listen(port, () => {
    console.log(`Server start on port ${port}.`);
  })
  .on('upgrade', ws.handleUpgrade);
