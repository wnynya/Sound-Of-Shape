'use strict';

class AudioOutput {
  constructor(audioContext) {
    this.next = () => {};

    this.actx = audioContext;
    this.sampleRate = this.actx.sampleRate;
    this.low = this.sampleRate / 4;

    this.gain = this.actx.createGain();
    this.gain.gain.value = 1.0;

    this.dest = this.actx.destination;
    this.gain.connect(this.dest);

    this.worklet = new AudioWorkletNode(this.actx, 'audio-output-processor', {
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    this.worklet.port.onmessage = (event) => {
      const data = event.data.sort();
      const min = data[0];
      if (min < this.low) {
        this.next(this.write);
      }
    };
    this.worklet.connect(this.gain);
  }

  write(data) {
    this.worklet.port.postMessage(data);
  }

  async setDevice(id) {
    const audio = document.createElement('audio');
    await audio.setSinkId(id);
    audio.srcObject = this.dest.stream;
    audio.play();
  }
}

class WebsocketProcessor {
  constructor() {
    this.bufferPad = 30;
    this.leftBuffer = [];
    this.rightBuffer = [];

    this.ws = new WebSocket('wss://r4.ccc.vg/audiooutput');
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('message', (event) => {
      const data = this.s2a(event.data);

      if (this.leftBuffer.length <= 0) {
        console.log('low');
      }

      this.leftBuffer.push(data[0]);
      this.rightBuffer.push(data[1]);
      while (this.leftBuffer.length >= this.bufferPad) {
        this.leftBuffer.shift();
      }
      while (this.rightBuffer.length >= this.bufferPad) {
        this.rightBuffer.shift();
      }
    });
  }

  s2a(s) {
    const f32 = new Float32Array(s);
    const left = [];
    const right = [];
    for (let i = 0; i < f32.length - 1; i += 2) {
      left.push(f32[i]);
      right.push(f32[i + 1]);
    }
    return [left, right];
  }

  read() {
    const leftBlock = this.leftBuffer[0] || new Float32Array(128);
    const rightBlock = this.rightBuffer[0] || new Float32Array(128);
    this.leftBuffer.shift();
    this.rightBuffer.shift();
    return [leftBlock.slice(), rightBlock.slice()];
  }

  next(write) {
    const left = [];
    const right = [];

    const audioInput = this.read();
    const leftBlock = audioInput[0];
    const rightBlock = audioInput[1];

    for (let i = 0; i < leftBlock.length; i++) {
      left.push(leftBlock[i]);
      right.push(rightBlock[i]);
    }

    write([left, right]);
  }
}

let audioContext;
let audioOutput;
let processor;

async function gesture(params) {
  audioContext = new AudioContext({ sampleRate: 48000 });
  await audioContext.audioWorklet.addModule('audio-output-processor.js');

  audioOutput = new AudioOutput(audioContext);

  processor = new WebsocketProcessor();

  console.log('a');

  setTimeout(() => {
    audioOutput.next = () => {
      processor.next((...args) => {
        audioOutput.write(...args);
      });
    };
  }, 100);
}

document.addEventListener('click', gesture, { once: true });
