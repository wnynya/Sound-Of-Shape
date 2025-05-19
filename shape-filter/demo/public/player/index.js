'use strict';

class AudioInput {
  constructor(audioContext) {
    this.actx = audioContext;
    this.sampleRate = this.actx.sampleRate;

    this.gain = this.actx.createGain();
    this.gain.gain.value = 1.0;

    this.worklet = new AudioWorkletNode(this.actx, 'audio-input-processor', {
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    this.bufferPad = 100;
    this.leftBuffer = [];
    this.rightBuffer = [];
    this.worklet.port.onmessage = (event) => {
      if (event.data.length >= 2) {
        this.leftBuffer.push(event.data[0]);
        this.rightBuffer.push(event.data[1]);
        while (this.leftBuffer.length >= this.bufferPad) {
          this.leftBuffer.shift();
        }
        while (this.rightBuffer.length >= this.bufferPad) {
          this.rightBuffer.shift();
        }
      }
    };
  }

  read() {
    const leftBlock = this.leftBuffer[0] || new Float32Array(128);
    const rightBlock = this.rightBuffer[0] || new Float32Array(128);
    this.leftBuffer.shift();
    this.rightBuffer.shift();
    return [leftBlock.slice(), rightBlock.slice()];
  }

  async setDevice(id) {
    let tracks = this.stream?.getTracks?.();
    tracks?.forEach((track) => track.stop());

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: id },
        channels: 2,
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
    });

    this.stream = stream;
    this.source = this.actx.createMediaStreamSource(this.stream);
    this.source.connect(this.gain).connect(this.worklet);
  }
}

class AudioOutput {
  constructor(audioContext) {
    this.next = () => {};

    this.actx = audioContext;
    this.sampleRate = this.actx.sampleRate;

    this.gain = this.actx.createGain();
    this.gain.gain.value = 0.1;

    this.dest = this.actx.createMediaStreamDestination();
    this.gain.connect(this.dest);

    this.worklet = new AudioWorkletNode(this.actx, 'audio-output-processor', {
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    this.worklet.port.onmessage = (event) => {
      const data = event.data.sort();
      const min = data[0];
      if (min < this.sampleRate / 10) {
        this.next(this.write);
      }
    };
    this.worklet.connect(this.gain); //.connect(this.actx.destination);
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

let audioContext;
let audioInput;
let audioOutput;

async function init() {
  await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  await navigator.permissions.query({ name: 'microphone' });

  const mediaDevices = await navigator.mediaDevices.enumerateDevices();
  const devices = { audioinput: [], audiooutput: [], videoinput: [] };
  mediaDevices.forEach((device) => {
    devices[device.kind].push(device);
  });

  console.log(devices);

  function optionElement(device) {
    const element = document.createElement('option');
    element.value = device.deviceId;
    element.innerHTML = device.label;
    return element;
  }

  for (const device of devices.audioinput) {
    const sel = document.querySelector('#select-audio-input');
    const opt = optionElement(device);
    sel.appendChild(opt);
  }
  for (const device of devices.audiooutput) {
    const sel = document.querySelector('#select-audio-output');
    const opt = optionElement(device);
    sel.appendChild(opt);
  }
  for (const device of devices.videoinput) {
    const sel = document.querySelector('#select-video-input');
    const opt = optionElement(device);
    sel.appendChild(opt);
  }
}

async function gesture(params) {
  audioContext = new AudioContext({ sampleRate: 48000 });
  await audioContext.audioWorklet.addModule('audio-input-processor.js');
  await audioContext.audioWorklet.addModule('audio-output-processor.js');

  audioInput = new AudioInput(audioContext);

  audioOutput = new AudioOutput(audioContext);

  processor = new ShapeFilter({ sampleRate: audioContext.sampleRate });
  await processor.setAudioInput(audioInput);
  processor.runOpenCv();

  audioOutput.next = () => {
    processor.next((...args) => {
      audioOutput.write(...args);
    });
  };

  initDisplay();
  addEventListener();

  document
    .querySelector(`#select-audio-input`)
    .dispatchEvent(new Event('change'));

  document
    .querySelector(`#select-video-input`)
    .dispatchEvent(new Event('change'));

  document
    .querySelector(`#select-audio-output`)
    .dispatchEvent(new Event('change'));

  return;
  document.querySelector(
    `#select-audio-input [value='dea1d5989bab653595458cd7d90894ca6c2d186dc18ce755f2ecdbab69ff82c6']`
  ).selected = true;
  document.querySelector(
    `#select-video-input [value='d647d5c961f4f6f0a8423f641f6a5b2627d2485a62aa8a251bd84cf90d486c33']`
  ).selected = true;
  document.querySelector(
    `#select-audio-output [value='b46426576dcb878a3d1709f1622bfadb1adb244e9991f8cb22d67ba3c7b0991e']`
  ).selected = true;
}

class Display {
  constructor() {
    this.workerX = new Worker('graph-1d.js');
    this.workerY = new Worker('graph-1d.js');
    this.workerXY = new Worker('graph-2d.js');

    this.canvasX = document.querySelector('#canvas-graph-x');
    this.canvasY = document.querySelector('#canvas-graph-y');
    this.canvasXY = document.querySelector('#canvas-graph-xy');

    function resize(canvas) {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    }
    resize(this.canvasX);
    resize(this.canvasY);
    resize(this.canvasXY);

    this.offCanvasX = this.canvasX.transferControlToOffscreen();
    this.offCanvasY = this.canvasY.transferControlToOffscreen();
    this.offCanvasXY = this.canvasXY.transferControlToOffscreen();

    this.workerX.postMessage({ event: 'init', data: this.offCanvasX }, [
      this.offCanvasX,
    ]);
    this.workerY.postMessage({ event: 'init', data: this.offCanvasY }, [
      this.offCanvasY,
    ]);
    this.workerXY.postMessage({ event: 'init', data: this.offCanvasXY }, [
      this.offCanvasXY,
    ]);
  }

  graphX(data) {
    this.workerX.postMessage({ event: 'draw', data: data });
  }

  graphY(data) {
    this.workerY.postMessage({ event: 'draw', data: data });
  }

  graphXY(dataX, dataY) {
    this.workerXY.postMessage({ event: 'draw', dataX: dataX, dataY, dataY });
  }
}
let display = new Display();
function initDisplay() {
  for (const canvas of document.querySelectorAll('.devcanvas canvas')) {
    canvas.width = 500;
    canvas.height = 500;
  }

  let fftSize = 2048;
  let smooth = 1.0;
  let source = audioOutput.worklet;

  const splitter = audioContext.createChannelSplitter(2);
  const leftGain = audioContext.createGain();
  const rightGain = audioContext.createGain();

  source.connect(splitter, 0, 0);
  splitter.connect(leftGain, 0);
  splitter.connect(rightGain, 1);

  const leftAnalyser = audioContext.createAnalyser();
  leftAnalyser.fftSize = fftSize;
  leftAnalyser.smoothingTimeConstant = smooth;
  leftGain.connect(leftAnalyser);

  const rightAnalyser = audioContext.createAnalyser();
  rightAnalyser.fftSize = fftSize;
  rightAnalyser.smoothingTimeConstant = smooth;
  rightGain.connect(rightAnalyser);

  function graph() {
    const leftData = new Uint8Array(leftAnalyser.frequencyBinCount);
    leftAnalyser.getByteTimeDomainData(leftData);
    const rightData = new Uint8Array(rightAnalyser.frequencyBinCount);
    rightAnalyser.getByteTimeDomainData(rightData);

    display.graphX(leftData);
    display.graphY(rightData);
    display.graphXY(leftData, rightData);

    window.requestAnimationFrame(graph);
  }
  window.requestAnimationFrame(graph);
}

function addEventListener() {
  document
    .querySelector('#select-audio-input')
    .addEventListener('change', () => {
      const sel = document.querySelector('#select-audio-input').value;
      audioInput.setDevice(sel);
    });

  document
    .querySelector('#select-video-input')
    .addEventListener('change', () => {
      const sel = document.querySelector('#select-video-input').value;
      processor.setVideoInputDevice(sel);
    });

  document
    .querySelector('#select-audio-output')
    .addEventListener('change', () => {
      const sel = document.querySelector('#select-audio-output').value;
      audioOutput.setDevice(sel);
    });

  function syncRange(e, f) {
    const el = document.querySelector(`#${e}`);
    const desc = document.querySelector(`label[desc=${e}]`);
    el.addEventListener('input', () => {
      sync();
    });
    function sync() {
      if (desc) {
        desc.innerHTML = `${el.id}: ${el.value}`;
      }
      f(el.value * 1);
    }
    sync();
  }

  syncRange('input_gain', (v) => {
    audioInput.gain.gain.value = v;
  });
  syncRange('output_gain', (v) => {
    audioOutput.gain.gain.value = v;
  });
  syncRange('freq', (v) => {
    processor.setFreq(v);
  });
  syncRange('mix', (v) => {
    processor.setMix(v);
  });
  syncRange('cv_tresh_a', (v) => {
    processor.cv_tresh_a = v;
  });
  syncRange('cv_tresh_b', (v) => {
    processor.cv_tresh_b = v;
  });
  syncRange('cv_tresh_invert', (v) => {
    processor.cv_tresh_invert = v;
  });
  syncRange('cv_morphsize', (v) => {
    processor.cv_morphsize = v;
  });
  syncRange('cv_compmin', (v) => {
    processor.cv_compmin = v;
  });
  syncRange('cv_approxpoly', (v) => {
    processor.cv_approxpoly = v;
  });
}

document.addEventListener('click', gesture, { once: true });
init();
