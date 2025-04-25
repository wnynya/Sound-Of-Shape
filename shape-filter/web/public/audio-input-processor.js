class AudioInputProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    if (input.length >= 2) {
      const left = input[0].slice();
      const right = input[1].slice();
      this.port.postMessage([left, right]);
    }
    return true;
  }
}

registerProcessor('audio-input-processor', AudioInputProcessor);
