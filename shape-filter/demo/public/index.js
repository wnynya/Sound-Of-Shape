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

class ShapeFilter {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 44100;
    this.cs = 128;
    this.shape = [];
    this.shapeDists = [];
    this.freq = options.freq || 1;
    this.mix = options.mix || 0.1;

    this.pt = 0;
    this.at = 0;
    this.ptx = this.freq * this.sampleRate;
    this.ptb = this.freq / this.sampleRate;

    this.cv_video = document.createElement('video');
    this.cv_video.width = 500;
    this.cv_video.height = 500;
    this.cv_video.setAttribute('autoplay', true);
    this.cv_video.setAttribute('muted', true);
    this.cv_video.setAttribute('playsinline', true);
    this.cv_canvas = document.createElement('canvas');
    this.cv_canvas.width = 500;
    this.cv_canvas.height = 500;
    this.cv_ctx = this.cv_canvas.getContext('2d', {
      willReadFrequently: true,
    });
    this.cv_blursize = 5;
    this.cv_tresh_a = 150;
    this.cv_tresh_b = 800;
    this.cv_tresh_invert = false;
    this.cv_morphsize = 5;
    this.cv_contmin = 100;
    this.cv_approxpoly = 1;

    this.setShape([[0, 0]]);
  }

  async loadad() {
    const res = await fetch('gw.wav');
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
  }

  phasePos(phase) {
    let p = phase % 1;
    if (p < 0) {
      p += 1;
    }
    let lp;
    let pb = 0;
    let pbd;

    for (let i = 0; i < this.shapeDists.length; i++) {
      lp = p;
      p -= this.shapeDists[i];
      if (p < 0) {
        pb = i;
        pbd = lp / this.shapeDists[i];
        break;
      }
    }

    let bs = this.shape[pb];
    let be = this.shape[pb + 1];

    let x = bs[0] + pbd * (be[0] - bs[0]);
    let y = bs[1] + pbd * (be[1] - bs[1]);

    return [x, y];
  }

  next(write) {
    const left = [];
    const right = [];

    const audioInput = this.audioInput.read();
    const leftBlock = audioInput[0];
    const rightBlock = audioInput[1];

    for (let i = 0; i < leftBlock.length; i++) {
      if (this.pt >= this.ptx) {
        this.pt = 0;
      }

      let a = (leftBlock[i] + rightBlock[i]) / 2;
      let phase = this.ptb * this.pt;
      phase += a * this.mix;
      const pos = this.phasePos(phase);

      left.push(pos[0]);
      right.push(pos[1]);

      this.pt++;
    }

    write([left, right]);
  }

  setShape(shape) {
    this.shape = JSON.parse(JSON.stringify(shape));
    this.shape.push(this.shape[0]);
    this.shapeDists = [];
    let totalDist = 0;
    for (let i = 0; i < this.shape.length - 1; i++) {
      const s = this.shape[i];
      const e = this.shape[i + 1];
      const dist = Math.sqrt((s[0] - e[0]) ** 2 + (s[1] - e[1]) ** 2);
      this.shapeDists.push(dist);
      totalDist += dist;
    }
    for (let i = 0; i < this.shapeDists.length; i++) {
      this.shapeDists[i] = this.shapeDists[i] / totalDist;
    }
  }

  setFreq(freq) {
    let optx = this.ptx;
    this.freq = freq;
    this.ptx = this.sampleRate / this.freq;
    this.ptb = this.freq / this.sampleRate;
    let a = this.pt / optx;
    let b = this.pt / this.ptx;
    let s = a - b;
    this.pt = this.pt + this.ptx * s;
  }

  setMix(mix) {
    this.mix = mix;
  }

  updateShapeFromVideo() {
    const w = this.cv_video.width;
    const h = this.cv_video.height;

    this.cv_ctx.drawImage(this.cv_video, 0, 0, w, h);
    const src = cv.imread(this.cv_canvas);
    this.display(src, 'canvas-video');

    const pre = new cv.Mat();

    cv.cvtColor(src, pre, cv.COLOR_RGB2GRAY, 0);
    this.display(pre, 'canvas-gray');

    cv.GaussianBlur(
      pre,
      pre,
      new cv.Size(this.cv_blursize, this.cv_blursize),
      0
    );
    this.display(pre, 'canvas-blur');

    const treshBin = this.cv_tresh_invert
      ? cv.THRESH_BINARY_INV
      : cv.THRESH_BINARY;
    cv.threshold(pre, pre, this.cv_tresh_a, this.cv_tresh_b, treshBin);
    const morph = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(this.cv_morphsize, this.cv_morphsize)
    );
    this.display(pre, 'canvas-tresh');

    cv.morphologyEx(pre, pre, cv.MORPH_CLOSE, morph);
    this.display(pre, 'canvas-morph');

    const conts = new cv.MatVector();
    const hier = new cv.Mat();
    const contsl = new cv.MatVector();
    cv.findContours(pre, conts, hier, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < conts.size(); ++i) {
      const cnt = conts.get(i);
      if (cv.contourArea(cnt) > this.cv_contmin) {
        contsl.push_back(cnt);
      } else {
        cnt.delete();
      }
    }

    if (contsl.size() <= 0) {
      this.setShape([[0, 0]]);
      contsl.delete();
      return;
    }

    const contours = [];
    for (let i = 0; i < contsl.size(); ++i) {
      const cnt = contsl.get(i);
      const points = [];
      for (let j = 0; j < cnt.rows; ++j) {
        let x = cnt.intPtr(j, 0)[0];
        let y = cnt.intPtr(j, 0)[1];
        points.push([x, y]);
      }
      contours.push(points);
      cnt.delete();
    }

    this.displayMatVector(conts, 'canvas-cont');
    this.displayMatVector(contsl, 'canvas-contl');

    src.delete();
    pre.delete();
    morph.delete();
    hier.delete();
    conts.delete();
    contsl.delete();

    function findMSTConnections(contours) {
      const centers = contours.map((c) => {
        const sum = c.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]);
        return [sum[0] / c.length, sum[1] / c.length];
      });

      let edges = [];
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const a = centers[i];
          const b = centers[j];
          const dist = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
          edges.push({ i, j, dist });
        }
      }
      edges.sort((a, b) => a.dist - b.dist);

      const parent = Array(centers.length)
        .fill(0)
        .map((_, i) => i);
      const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
      const union = (x, y) => (parent[find(x)] = find(y));

      let connections = [];
      let connectedPairs = new Set();

      for (const { i, j } of edges) {
        if (find(i) !== find(j)) {
          union(i, j);
          let best = null,
            bestDist = Infinity;
          for (const a of contours[i]) {
            for (const b of contours[j]) {
              const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
              if (d < bestDist) {
                bestDist = d;
                best = [a, b];
              }
            }
          }
          if (best) {
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (!connectedPairs.has(key)) {
              connections.push(best);
              connectedPairs.add(key);
            }
          }
        }
      }
      return connections;
    }
    const connections = findMSTConnections(contours);
    const mask = new cv.Mat.zeros(h, w, cv.CV_8UC1);
    for (const pts of contours) {
      for (let i = 0; i < pts.length; i++) {
        const pt1 = pts[i];
        const pt2 = pts[(i + 1) % pts.length];
        cv.line(
          mask,
          new cv.Point(pt1[0], pt1[1]),
          new cv.Point(pt2[0], pt2[1]),
          new cv.Scalar(255),
          1
        );
      }
    }
    for (const [a, b] of connections) {
      cv.line(
        mask,
        new cv.Point(a[0], a[1]),
        new cv.Point(b[0], b[1]),
        new cv.Scalar(255),
        1
      );
    }
    this.display(mask, 'canvas-mask');

    const closedContours = new cv.MatVector();
    const closedHier = new cv.Mat();
    cv.findContours(
      mask,
      closedContours,
      closedHier,
      cv.RETR_CCOMP,
      cv.CHAIN_APPROX_SIMPLE
    );
    mask.delete();
    closedHier.delete();

    this.displayMatVector(closedContours, 'canvas-closed');

    let bestContour = null;
    let bestArea = 0;
    for (let i = 0; i < closedContours.size(); i++) {
      let c = closedContours.get(i);
      let area = cv.contourArea(c);
      if (area > bestArea) {
        if (bestContour) bestContour.delete();
        bestContour = c;
        bestArea = area;
      } else {
        c.delete();
      }
    }
    closedContours.delete();

    if (!bestContour || bestContour.rows < 4) {
      this.setShape([[0, 0]]);
      return;
    }

    const approx = new cv.Mat();
    cv.approxPolyDP(bestContour, approx, this.cv_approxpoly, true);
    bestContour.delete();

    this.displayMat(approx, 'canvas-cont2');

    const hw = w / 2;
    const hh = h / 2;
    const shape = [];
    for (let i = 0; i < approx.rows; i++) {
      let x = approx.intPtr(i, 0)[0];
      let y = approx.intPtr(i, 0)[1];
      shape.push([(x - hw) / hw, (-1 * (y - hh)) / hh]);
    }
    approx.delete();

    this.setShape(shape);
  }

  async runOpenCv() {
    const fps = 30;
    const intv = 1000 / fps;
    let lst = 0;
    const _this = this;
    function frame() {
      let cnt = Date.now();
      if (cnt - lst >= intv) {
        lst = cnt;
        _this.updateShapeFromVideo();
      }
      requestAnimationFrame(frame);
    }
    frame();
  }

  onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
      this.runOpenCv();
    };
  }

  async setAudioInput(audioInput) {
    this.audioInput = audioInput;
  }

  async setVideoInputDevice(id) {
    let tracks = this.cv_video.srcObject?.getTracks?.();
    tracks?.forEach((track) => track.stop());

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: id },
        width: { ideal: this.cv_video.width },
        height: { ideal: this.cv_video.height },
      },
    });

    this.cv_video.srcObject = stream;
    await this.cv_video.play();
  }

  async setVideoFile(fileUrl) {
    let tracks = this.cv_video.srcObject?.getTracks?.();
    tracks?.forEach((track) => track.stop());

    this.cv_video.srcObject = null; // 기존 스트림 제거
    this.cv_video.src = fileUrl;
    await this.cv_video.play();
  }

  display(mat, canvas) {
    cv.imshow(canvas, mat);
  }

  displayMat(mat, canvas, color = [255, 255, 255]) {
    const w = this.cv_video.width;
    const h = this.cv_video.height;
    const m = new cv.Mat.zeros(h, w, cv.CV_8UC3);
    const v = new cv.MatVector();
    v.push_back(mat);
    cv.fillPoly(m, v, new cv.Scalar(...color));
    cv.imshow(canvas, m);
    m.delete();
    v.delete();
  }

  displayMat(mat, canvas, color = [255, 255, 255]) {
    const w = this.cv_video.width;
    const h = this.cv_video.height;
    const m = new cv.Mat.zeros(h, w, cv.CV_8UC3);
    const v = new cv.MatVector();
    v.push_back(mat);
    cv.fillPoly(m, v, new cv.Scalar(...color));
    cv.imshow(canvas, m);
    m.delete();
    v.delete();
  }

  displayMatVector(v, canvas, color = [255, 255, 255]) {
    const w = this.cv_video.width;
    const h = this.cv_video.height;
    const m = new cv.Mat.zeros(h, w, cv.CV_8UC3);
    cv.fillPoly(m, v, new cv.Scalar(...color));
    cv.imshow(canvas, m);
    m.delete();
  }
}

let audioContext;
let audioInput;
let audioOutput;
let processor;

async function init() {
  await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  await navigator.permissions.query({ name: 'microphone' });
  await navigator.permissions.query({ name: 'camera' });

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
