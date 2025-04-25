let canvas;

self.onmessage = async (e) => {
  const obj = e.data;
  const event = obj.event;

  if (event === 'init') {
    canvas = obj.data;
  } else if (event === 'draw') {
    draw(canvas, obj.data);
  }
};

function draw(canvas, data) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const s = w / data.length;

  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgb(0, 255, 180)';
  ctx.beginPath();

  for (let i = 0; i < data.length; i++) {
    let v = data[i] / 128.0;
    ctx.lineTo(i * s, h - (v * h) / 2);
  }

  ctx.stroke();
}
