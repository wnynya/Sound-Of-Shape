let fastDraw = false;
let dotsDraw = false;

let canvas;

let lx = 0;
let ly = 0;

self.onmessage = async (e) => {
  const obj = e.data;
  const event = obj.event;

  if (event === 'init') {
    canvas = obj.data;
  } else if (event === 'draw') {
    draw(canvas, obj.dataX, obj.dataY);
  }
};

function draw(canvas, dataX, dataY) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 2;
  ctx.beginPath();

  if (fastDraw) {
    ctx.beginPath();
    ctx.strokeStyle = `rgb(0, 255, 180)`;
    for (let i = 0; i < dataX.length; i++) {
      let v1 = dataX[i] / 128.0;
      let v2 = dataY[i] / 128.0;
      let x = (v1 * w) / 2;
      let y = h - (v2 * h) / 2;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    for (let i = 0; i < dataX.length; i++) {
      let v1 = dataX[i] / 128.0;
      let v2 = dataY[i] / 128.0;
      let x = (v1 * w) / 2;
      let y = h - (v2 * h) / 2;
      var a = lx - x;
      var b = ly - y;
      var dist = Math.sqrt(a * a + b * b);
      ctx.strokeStyle = `rgba(0, 255, 180, ${Math.max(0.15, 5 / dist)})`;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(x, y);
      ctx.stroke();
      lx = x;
      ly = y;
    }
  }

  if (dotsDraw) {
    ctx.fillStyle = 'rgb(255, 0, 0)';

    for (let i = 0; i < dataX.length; i++) {
      let v1 = dataX[i] / 128.0;
      let v2 = dataY[i] / 128.0;
      let x = (v1 * w) / 2;
      let y = h - (v2 * h) / 2;
      ctx.fillRect(x, y, 2, 2);
    }
  }
}
