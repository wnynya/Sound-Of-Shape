class AudioOutputProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);

    this.buffer = [[], []];

    this.port.onmessage = (event) => {
      const data = event.data;
      data.forEach((channel, index) => {
        if (!this.buffer[index]) {
          this.buffer[index] = [];
        }
        this.buffer[index].push(...channel);
      });
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const leftBuffer = [];
    output.forEach((channel, index) => {
      let size = Math.min(channel.length, this.buffer[index].length);
      for (let i = 0; i < size; i++) {
        channel[i] = this.buffer[index][i];
      }
      this.buffer[index].splice(0, size);
      leftBuffer.push(this.buffer[index].length);
    });
    this.port.postMessage(leftBuffer);
    return true;
  }
}

registerProcessor('audio-output-processor', AudioOutputProcessor);
