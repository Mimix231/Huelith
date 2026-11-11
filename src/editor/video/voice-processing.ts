import type {ParameterKey} from './parameter-keys';

export const CHANNEL_MODES=['stereo','left','right','mono'] as const;
export type ChannelMode=typeof CHANNEL_MODES[number];
export const VOICE_MODES=['radio','warm','robot','cleanup'] as const;
export type VoiceMode=typeof VOICE_MODES[number];
export type VoiceTreatment={mode:VoiceMode;mix:number;keys?:ParameterKey[]};
