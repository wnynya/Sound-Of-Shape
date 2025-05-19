'use strict';

class WebsocketProcessor {
  constructor() {
    this.ws = new WebSocket('/audioinput');
    this.ws.binaryType = 'arraybuffer';
  }

  async load() {
    const res = await fetch('test2.wav');
    const blob = await res.blob();
    const u8 = new Uint16Array(await blob.arrayBuffer());
    const array = Array.from(u8);

    for (let i = 0; i < array.length; i++) {
      if (array[i] >= 32768) {
        array[i] = array[i] - 65536;
      } else {
        array[i] = array[i];
      }
    }

    for (let i = 0; i < array.length; i++) {
      array[i] = array[i] / 32768;
    }

    this.audiodata = array;
    this.t = 0;
  }

  read() {
    const left = [];
    const right = [];

    for (let i = 0; i < 512; i++) {
      left.push(this.audiodata[this.t]);
      right.push(this.audiodata[this.t + 1]);
      this.t += 2;

      if (this.t > this.audiodata.length - 1) {
        this.t = 0;
      }
    }

    return [left, right];
  }

  next() {
    if (this.ws?.readyState !== 1) {
      return;
    }

    const a = this.read();
    const d = this.a2b(a[0], a[1]);

    this.ws.send(d.buffer);
  }

  a2b(left, right) {
    const array = [];
    for (let i = 0; i < left.length; i++) {
      array.push(left[i], right[i]);
    }
    const f32 = new Float32Array(array);
    return f32;
  }
}

let processor;
async function gesture(params) {
  processor = new WebsocketProcessor();
  await processor.load();

  const b = 1000 / (48000 / 530);
  console.log(b);
  setInterval(() => {
    processor.next();
  }, b);

  console.log('start');
}
gesture();
