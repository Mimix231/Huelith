/* The offline mixer implements the same per-sample filters in windows_mf.rs. */
class HuelithVoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'mix', defaultValue: 0, minValue: 0, maxValue: 1 }];
  }

  constructor({ processorOptions = {} }) {
    super();
    this.settings = processorOptions;
    this.states = [{ low: 0, band: 0, envelope: 0 }, { low: 0, band: 0, envelope: 0 }];
    this.phase = 0;
    this.highpass = 1 - Math.exp(-2 * Math.PI * 340 / sampleRate);
    this.lowpass = 1 - Math.exp(-2 * Math.PI * 3050 / sampleRate);
    this.warmth = 1 - Math.exp(-2 * Math.PI * 1800 / sampleRate);
    this.release = Math.exp(-1 / (.045 * sampleRate));
    this.port.onmessage = event => {
      if (this.settings.mode !== event.data.mode) for (const state of this.states) state.low = state.band = state.envelope = 0;
      this.settings = event.data;
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0], output = outputs[0], mix = parameters.mix;
    if (!input?.length || !output?.length) return true;
    const { channelMode, mode } = this.settings;
    for (let i = 0; i < output[0].length; i++) {
      let left = input[0][i], right = input[1]?.[i] ?? left;
      if (channelMode === 'left') right = left;
      if (channelMode === 'right') left = right;
      if (channelMode === 'mono') left = right = (left + right) * .5;
      const wet = mix.length === 1 ? mix[0] : mix[i];
      for (let channel = 0; channel < output.length; channel++) {
        const sample = channel ? right : left, state = this.states[channel];
        let treated = sample;
        if (mode === 'radio') {
          state.low += (sample - state.low) * this.highpass;
          state.band += (sample - state.low - state.band) * this.lowpass;
          treated = Math.tanh(state.band * 2.5) * .82;
        } else if (mode === 'warm') {
          state.low += (sample - state.low) * this.warmth;
          treated = Math.tanh((sample * .56 + state.low * .74) * 1.32) * .9;
        } else if (mode === 'robot') {
          treated = sample * (.17 + .83 * Math.sin(this.phase));
        } else if (mode === 'cleanup') {
          state.envelope = Math.max(Math.abs(sample), state.envelope * this.release);
          treated = sample * Math.min(1, state.envelope / .037) ** 2;
        }
        output[channel][i] = sample + (treated - sample) * wet;
      }
      this.phase = (this.phase + 2 * Math.PI * 42 / sampleRate) % (2 * Math.PI);
    }
    return true;
  }
}

registerProcessor('huelith-voice', HuelithVoiceProcessor);
