'use strict';

class PCMStream {
  constructor(sampleRate) {
    this.ac = null;
    this.sampleRate = sampleRate;
    this.next = () => {};
  }

  async init(ac) {
    this.ac = ac;

    await this.ac.audioWorklet.addModule('pcm-stream-processor.js');
    this.node = new AudioWorkletNode(ac, 'pcm-stream-processor', {
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    this.node.connect(ac.destination);

    this.node.port.onmessage = (event) => {
      const data = event.data.sort();
      const min = data[0];
      if (min < this.sampleRate / 10) {
        this.next(this.write);
      }
    };
  }

  write(data) {
    this.node.port.postMessage(data);
  }

  getNode() {
    return this.node;
  }
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

class ShapeOscillator {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;

    this.t = 0;
    this.fps = 10;

    this.a = 1;
    this.b = 1;

    this.s1_poly = 4;
    this.s1_freq = 20;
    this.s1_rotate = 0;
    this.s1_size = 1;

    this.s2_poly = 4;
    this.s2_freq = 20;
    this.s2_rotate = 0;
    this.s2_size = 1;

    this.s_progress = 0;
    this.s_offset = 0;

    this.volume = 0.8;
  }

  next(write) {
    let left = [];
    let right = [];

    let hz = this.s1_freq + this.s_progress * (this.s2_freq - this.s1_freq);

    for (let i = 0; i < this.sampleRate / this.fps; i++) {
      let s1_angle = (this.t / (this.sampleRate / 2 / hz)) * 2 * this.s1_poly;
      let s1_k1 = Math.floor(s1_angle % this.s1_poly);
      let s1_k2 = s1_angle % 1;
      let s1_k3 = s1_k1 * ((Math.PI * 2) / this.s1_poly);
      let s1_tx = Math.cos(Math.PI / this.s1_poly) * this.s1_size;
      let s1_ty =
        2 * Math.sin(Math.PI / this.s1_poly) * (s1_k2 - 0.5) * this.s1_size;
      let s1_x =
        Math.cos(s1_k3 + this.s1_rotate) * s1_tx -
        Math.sin(s1_k3 + this.s1_rotate) * s1_ty;
      let s1_y =
        Math.sin(s1_k3 + this.s1_rotate) * s1_tx +
        Math.cos(s1_k3 + this.s1_rotate) * s1_ty;

      let s2_angle =
        (this.t / (this.sampleRate / 2 / hz) + this.s_offset / 360) *
        2 *
        this.s2_poly;
      let s2_k1 = Math.floor(s2_angle % this.s2_poly);
      let s2_k2 = s2_angle % 1;
      let s2_k3 = s2_k1 * ((Math.PI * 2) / this.s2_poly);
      let s2_tx = Math.cos(Math.PI / this.s2_poly) * this.s2_size;
      let s2_ty =
        2 * Math.sin(Math.PI / this.s2_poly) * (s2_k2 - 0.5) * this.s2_size;
      let s2_x =
        Math.cos(s2_k3 * this.a + this.s2_rotate) * s2_tx -
        Math.sin(s2_k3 + this.s2_rotate) * s2_ty;
      let s2_y =
        Math.sin(s2_k3 * this.b + this.s2_rotate) * s2_tx +
        Math.cos(s2_k3 + this.s2_rotate) * s2_ty;

      let x = s1_x + this.s_progress * (s2_x - s1_x);
      let y = s1_y + this.s_progress * (s2_y - s1_y);

      x = x * this.volume;
      y = y * this.volume;

      left.push(x);
      right.push(y);

      this.t++;
    }

    write([left, right]);
  }
}

class CameraOscillator {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;

    this.pcmLines = [];
    this.minLines = 10;
    this.maxLines = 300;

    this.cameraWidth = 500;
    this.cameraHeight = 500;
    this.cameraFPS = 30;
    this.contourMode = 2;

    this.cvThreshA = 150;
    this.cvThreshB = 800;
    this.cvCannyA = 200;
    this.cvCannyB = 500;
    this.cvCannyC = 3;
  }

  next(write) {
    let lines = this.pcmLines;

    let left = [];
    let right = [];

    let long = [];
    let lengths = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > long.length) {
        long = line;
      }
      lengths.push(line.length);
    }

    lengths.sort();

    //lines = [long];

    for (let o = 0; o < 1; o++) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length < this.minLines || this.maxLines < line.length) {
          continue;
        }
        for (let j = 0; j < line.length; j++) {
          const point = line[j];
          let x = point[0] / 256 - 1;
          let y = point[1] / 256 - 1;
          y = y * -1;
          left.push(x);
          right.push(y);
        }
      }
    }

    write([left, right]);
  }

  async runOpenCv() {
    const video = document.querySelector('#video');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: '38D77EC854F062800554E556D5278DC9558C2DD6',
        groupId: 'FCD6953CD10F89932EAAB064AB71550E4C4A328D',
        width: { ideal: this.cameraWidth },
        height: { ideal: this.cameraHeight },
      },
    });

    video.width = this.cameraWidth;
    video.height = this.cameraHeight;
    video.srcObject = stream;
    video.play();

    let src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    let cap = new cv.VideoCapture(video);

    const FPS = this.cameraFPS;
    const _this = this;

    function process() {
      let begin = Date.now();

      try {
        cap.read(src);
        //cv.imshow('canvas-cam', src);

        let pre = new cv.Mat();
        cv.cvtColor(src, pre, cv.COLOR_RGB2GRAY, 0);
        cv.threshold(
          pre,
          pre,
          _this.cvThreshA,
          _this.cvThreshB,
          cv.THRESH_BINARY
        );
        cv.Canny(
          pre,
          pre,
          _this.cvCannyA,
          _this.cvCannyB,
          _this.cvCannyC,
          false
        );

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(
          pre,
          contours,
          hierarchy,
          cv.RETR_CCOMP,
          cv.CHAIN_APPROX_SIMPLE
        );

        let lines = [];
        for (let i = 0; i < contours.size(); ++i) {
          let tmp = new cv.Mat();
          let cnt = contours.get(i);
          cv.approxPolyDP(cnt, tmp, 2, true);
          let points = [];
          let array = (_this.contourMode == 1 ? cnt : tmp).data32S;
          for (let j = 0; j < array.length; j += 2) {
            points.push([array[j], array[j + 1]]);
          }
          lines.push(points);
          cnt.delete();
          tmp.delete();
        }

        pre.delete();
        contours.delete();
        hierarchy.delete();

        lines.sort((a, b) => b.length - a.length);

        _this.pcmLines = lines;
      } catch (err) {
        console.error(err);
      }

      let delay = 1000 / FPS - (Date.now() - begin);
      setTimeout(process, delay);
    }

    setTimeout(process, 0);
  }

  onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
      this.runOpenCv();
    };
  }
}

let sampleRate = 48000;
let ac;
let pcmStream;
let display = new Display();
let shapeOscillator = new ShapeFilter(sampleRate);
let cameraOscillator = new CameraOscillator(sampleRate);
let oscillator = shapeOscillator;

async function init() {
  ac = new AudioContext();
  pcmStream = new PCMStream(sampleRate);
  await pcmStream.init(ac);

  pcmStream.next = () => {
    oscillator.next((...args) => {
      pcmStream.write(...args);
    });
  };

  let fftSize = 2048;
  let smooth = 1.0;
  let source = pcmStream.getNode();

  const splitter = ac.createChannelSplitter(2);
  const leftGain = ac.createGain();
  const rightGain = ac.createGain();

  source.connect(splitter, 0, 0);
  splitter.connect(leftGain, 0);
  splitter.connect(rightGain, 1);

  const leftAnalyser = ac.createAnalyser();
  leftAnalyser.fftSize = fftSize;
  leftAnalyser.smoothingTimeConstant = smooth;
  leftGain.connect(leftAnalyser);

  const rightAnalyser = ac.createAnalyser();
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

document.addEventListener(
  'click',
  () => {
    init();
  },
  { once: true }
);

function setValue(e, v, d) {
  const el = document.querySelector(`#${e}`);
  const desc = document.querySelector(`label[desc=${e}]`);
  el.value = map(el.min, el.max, d);
  if (desc) {
    desc.innerHTML = `${el.id}: ${el.value}`;
  }
  if (e == 's2_poly' && el.value > 8) {
    v[e] = el.value ** 2;
  } else {
    v[e] = el.value * 1;
  }
}

function syncRange(e, v) {
  const el = document.querySelector(`#${e}`);
  const desc = document.querySelector(`label[desc=${e}]`);
  el.addEventListener('input', () => {
    sync();
  });
  function sync() {
    if (desc) {
      desc.innerHTML = `${el.id}: ${el.value}`;
    }
    v[e] = el.value * 1;
  }
  sync();
}

/*
syncRange('s1_poly', shapeOscillator);
syncRange('s1_freq', shapeOscillator);
syncRange('s1_rotate', shapeOscillator);

syncRange('s2_poly', shapeOscillator);
syncRange('s2_freq', shapeOscillator);
syncRange('s2_rotate', shapeOscillator);

syncRange('s_progress', shapeOscillator);
syncRange('s_offset', shapeOscillator);

syncRange('minLines', cameraOscillator);
syncRange('maxLines', cameraOscillator);
syncRange('contourMode', cameraOscillator);

syncRange('cvThreshA', cameraOscillator);
syncRange('cvThreshB', cameraOscillator);
syncRange('cvCannyA', cameraOscillator);
syncRange('cvCannyB', cameraOscillator);
syncRange('cvCannyC', cameraOscillator);
*/

for (const el of document.querySelectorAll('input[name="mode"]')) {
  el.addEventListener('change', () => {
    modeup();
  });
}

function modeup() {
  let v = document.querySelector('input[name="mode"]:checked').value;
  if (v === 'shape') {
    oscillator = shapeOscillator;
  } else if (v === 'camera') {
    oscillator = cameraOscillator;
  }
}

function listup() {
  navigator.mediaDevices
    .enumerateDevices()
    .then(function (devices) {
      devices.forEach(function (device) {
        console.log(
          device,
          device.kind + ': ' + device.label != undefined
            ? device.label
            : 'Default'
        );
      });
    })
    .catch(function (err) {
      console.log(err.name + ': ' + err.message);
    });
}

let ws;

function wsConnect() {
  ws = new WebSocket('ws://localhost:81');
  ws.addEventListener('open', () => {
    console.log('ws open');
  });
  ws.addEventListener('message', (e) => {
    const obj = JSON.parse(e.data);
    const event = obj.event;
    const data = obj.data;

    const values = data.values;
    if (event === 'controller') {
      if (data.mode == 0) {
        document.querySelector(`[value="shape"]`).checked = true;
        modeup();

        setValue('s1_poly', shapeOscillator, values[0]);
        setValue('a', shapeOscillator, values[1]);
        setValue('s1_rotate', shapeOscillator, values[2]);

        setValue('s2_poly', shapeOscillator, values[4]);
        setValue('b', shapeOscillator, values[5]);
        setValue('s2_rotate', shapeOscillator, values[6]);

        setValue('s_progress', shapeOscillator, values[3]);
        setValue('s_offset', shapeOscillator, values[7]);
      } else {
        document.querySelector(`[value="camera"]`).checked = true;
        modeup();

        setValue('minLines', cameraOscillator, values[0]);
        setValue('maxLines', cameraOscillator, values[1]);
        setValue('contourMode', cameraOscillator, Math.min(values[3], 0.75));

        setValue('cvThreshA', cameraOscillator, values[4]);
        setValue('cvThreshB', cameraOscillator, values[5]);
      }
    }
  });
}

setInterval(() => {
  if (!ws || ws.readyState !== ws.OPEN) {
    ws ? ws.close() : null;
    wsConnect();
  }
}, 2000);

function map(min, max, value) {
  let x = max - min;
  let n = value * x + min;
  return n;
}
