"""Original, deterministic arrangements and sound effects. No sampled recordings.

The WAV master exists only during generation; AAC assets are bundled for native
Media Foundation playback. FFmpeg is a build-time codec, never an app dependency.
"""
from pathlib import Path
import json, math, subprocess, tempfile, wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/video-library/audio'
SR=44100
FFMPEG=Path('G:/bin/ffmpeg/ffmpeg.exe')
TRACKS=[
 ('violet-afterglow','Violet afterglow','Ambient',76,45,'pad'),
 ('moonlit-pages','Moonlit pages','Lo-fi',82,50,'keys'),
 ('midnight-tram','Midnight tram','Lo-fi',88,43,'keys'),
 ('neon-avenue','Neon avenue','Electronic',112,45,'pluck'),
 ('pixel-daydream','Pixel daydream','Chiptune',116,48,'chip'),
 ('quiet-orbit','Quiet orbit','Ambient',72,48,'pad'),
 ('glass-garden','Glass garden','Piano',84,53,'keys'),
 ('morning-window','Morning window','Piano',92,48,'keys'),
 ('small-adventure','Small adventure','Cinematic',104,50,'strings'),
 ('distant-horizon','Distant horizon','Cinematic',96,43,'strings'),
 ('soft-circuit','Soft circuit','Electronic',120,41,'pluck'),
 ('starlight-arcade','Starlight arcade','Chiptune',128,50,'chip'),
 ('sunlit-corners','Sunlit corners','Acoustic',100,48,'guitar'),
 ('paper-clouds','Paper clouds','Acoustic',90,53,'guitar'),
 ('lavender-rain','Lavender rain','Ambient',68,46,'pad'),
 ('good-things-ahead','Good things ahead','Upbeat',118,48,'pluck'),
]
def hz(note): return 440*2**((note-69)/12)
def voice(note,length,kind,rng):
 t=np.arange(int(length*SR))/SR;f=hz(note)
 if kind=='chip': y=np.sin(2*np.pi*f*t)+.23*np.sin(6*np.pi*f*t)+.12*np.sin(10*np.pi*f*t)
 elif kind=='pad' or kind=='strings':
  y=sum(np.sin(2*np.pi*f*(1+detune)*t)/n for n,detune in [(1,-.0015),(2,.001),(3,0),(5,-.0008)])
 elif kind=='guitar': y=sum(np.sin(2*np.pi*f*n*t+rng.random()*.08)*np.exp(-t*(1.5+n*.8))/n for n in range(1,7))
 elif kind=='pluck': y=sum(np.sin(2*np.pi*f*n*t)*np.exp(-t*(3+n))/n for n in range(1,5))
 else: y=np.sin(2*np.pi*f*t)*np.exp(-t*2)+.35*np.sin(4*np.pi*f*t)*np.exp(-t*4)+.13*np.sin(6*np.pi*f*t)*np.exp(-t*7)
 attack=.25 if kind in ['pad','strings'] else .008
 env=np.minimum(1,t/attack)*np.minimum(1,(length-t)/(.4 if kind in ['pad','strings'] else .09))
 if kind in ['pad','strings']: env*=.7+.3*np.sin(np.pi*t/max(.01,length))
 return y*env
def mix_note(mix,note,start,length,amp,pan,kind,rng):
 y=voice(note,length,kind,rng)*amp;first=int(start*SR);last=min(len(mix),first+len(y))
 if first>=len(mix):return
 y=y[:last-first];mix[first:last,0]+=y*math.sqrt((1-pan)/2);mix[first:last,1]+=y*math.sqrt((1+pan)/2)
def drum(mix,start,kind,gain,rng):
 length=.35 if kind=='kick' else .18;t=np.arange(int(length*SR))/SR
 if kind=='kick':y=np.sin(2*np.pi*(42*t+75*.035*(1-np.exp(-t/.035))))*np.exp(-t*15)
 elif kind=='snare':y=(rng.uniform(-1,1,len(t))*.7+np.sin(2*np.pi*185*t)*.3)*np.exp(-t*28)
 else:
  noise=rng.uniform(-1,1,len(t));y=np.diff(noise,prepend=0)*np.exp(-t*80)*.35
 first=int(start*SR);last=min(len(mix),first+len(y));mix[first:last]+=y[:last-first,None]*gain
def master(mix):
 # Quiet stereo taps create space without borrowing samples or external music.
 dry=mix.copy()
 for delay,gain in [(.137,.12),(.269,.08),(.411,.04)]:
  n=int(delay*SR);mix[n:]+=dry[:-n,::-1]*gain
 peak=np.max(np.abs(mix));mix=np.tanh(mix/max(.01,peak)*1.35)
 mix*=.82/max(.01,np.max(np.abs(mix)))
 n=min(int(.12*SR),len(mix));mix[:n]*=np.linspace(0,1,n)[:,None]
 n=min(int(.7*SR),len(mix));mix[-n:]*=np.linspace(1,0,n)[:,None]
 return mix
def encode(id,mix):
 OUT.mkdir(parents=True,exist_ok=True);path=OUT/f'{id}.m4a'
 with tempfile.TemporaryDirectory(prefix='huelith-audio-') as temp:
  wav=Path(temp)/'master.wav'
  with wave.open(str(wav),'wb') as f:
   f.setnchannels(2);f.setsampwidth(2);f.setframerate(SR);f.writeframes(np.round(np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
  subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','aac','-b:a','144k','-movflags','+faststart',str(path)],check=True)
 bins=np.array_split(np.max(np.abs(mix),axis=1),96)
 return [round(float(np.max(b)),4) for b in bins]
def main():
 items=[]
 # Original 12-bar form: intro / two contrasting phrases / resolving outro.
 for seed,(id,name,category,bpm,root,kind) in enumerate(TRACKS):
  rng=np.random.default_rng(94117+seed);beat=60/bpm;bars=12;duration=bars*4*beat
  mix=np.zeros((math.ceil(duration*SR),2),dtype=np.float64)
  progression=[0,5,3,7,0,8,5,7,3,5,7,0] if seed%2 else [0,8,5,7,0,3,8,7,5,8,7,0]
  for bar,degree in enumerate(progression):
   start=bar*4*beat;minor=degree in [0,5,7];chord=[root+degree,root+degree+(3 if minor else 4),root+degree+7,root+degree+10]
   for n,note in enumerate(chord):mix_note(mix,note+12,start,4*beat+.05,.055,(n-1.5)*.38,kind,rng)
   for b in [0,2]:mix_note(mix,root+degree-12,start+b*beat,beat*1.5,.16,0,'keys',rng)
   if bar>0 and category not in ['Ambient','Piano']:
    for b in [0,2]:drum(mix,start+b*beat,'kick',.22,rng)
    for b in [1,3]:drum(mix,start+b*beat,'snare',.08,rng)
    for step in range(8):drum(mix,start+step*beat/2,'hat',.045 if step%2 else .07,rng)
   # Authored motivic phrases, varied by chord and instrumentation.
   if 1<=bar<=10:
    motif=[0,2,1,3,2,1] if (bar+seed)%2 else [2,1,0,1,3,2]
    for step,tone in enumerate(motif):
     start_note=start+(step*.5+(0.03 if step%2 else 0))*beat
     mix_note(mix,chord[tone]+24,start_note,beat*(.8 if step==5 else .45),.085,-.2 if bar%2 else .2,'keys' if kind=='pad' else kind,rng)
  mix=master(mix);waveform=encode(id,mix)
  items.append(dict(id=id,name=name,category=category,type='music',duration=round(duration,5),bpm=bpm,file=f'audio/{id}.m4a',waveform=waveform))
 effects=[('soft-whoosh','Soft whoosh','Transitions'),('reverse-air','Reverse air','Transitions'),('quick-sweep','Quick sweep','Transitions'),('deep-hit','Deep hit','Impacts'),('tiny-pop','Tiny pop','UI'),('double-pop','Double pop','UI'),('bright-ding','Bright ding','UI'),('gentle-bell','Gentle bell','UI'),('sparkle-rise','Sparkle rise','Magic'),('magic-fall','Magic fall','Magic'),('digital-click','Digital click','UI'),('tap-confirm','Tap confirm','UI'),('glitch-burst','Glitch burst','Digital'),('signal-drop','Signal drop','Digital'),('retro-jump','Retro jump','Digital'),('power-up','Power up','Digital'),('rain-bed','Soft rain','Ambience'),('wind-bed','Air current','Ambience'),('ocean-swell','Ocean swell','Ambience'),('space-hum','Space hum','Ambience'),('soft-thump','Soft thump','Impacts'),('camera-swish','Camera swish','Transitions'),('paper-flick','Paper flick','Foley'),('wooden-tick','Wooden tick','Foley')]
 for seed,(id,name,category) in enumerate(effects):
  rng=np.random.default_rng(551+seed);duration=4.5 if category=='Ambience' else .25+(seed%5)*.2
  t=np.arange(int(duration*SR))/SR;noise=rng.normal(0,.4,len(t));smooth=np.convolve(noise,np.ones(25)/25,mode='same')
  if category=='Ambience':y=smooth*(.6+.4*np.sin(2*np.pi*.28*t))+np.sin(2*np.pi*(55+seed)*t)*.05
  elif category=='Transitions':y=(noise-smooth)*np.sin(np.pi*t/duration)**2*(.5+.5*np.sin(2*np.pi*(200*t+1200*t*t)))
  elif category=='Impacts':y=np.sin(2*np.pi*(40*t+3*(1-np.exp(-t*20))))*np.exp(-t*12)+noise*np.exp(-t*50)*.3
  elif category=='Digital':y=(np.sin(2*np.pi*(220*t+(-1 if seed%2 else 1)*400*t*t))>.2).astype(float)*np.exp(-t*6)*.3
  elif category=='Magic':y=sum(np.sin(2*np.pi*(500+n*239)*t)*np.exp(-t*(3+n))*.12 for n in range(5))
  else:y=np.sin(2*np.pi*(620+seed*37)*t)*np.exp(-t*(8+seed%4*7))+noise*np.exp(-t*90)*.25
  mix=master(np.stack([y,np.roll(y,23)],axis=1));waveform=encode(id,mix)
  items.append(dict(id=id,name=name,category=category,type='sound',duration=duration,file=f'audio/{id}.m4a',waveform=waveform))
 OUT.joinpath('catalog.json').write_text(json.dumps(items,indent=2)+'\n',encoding='utf-8')
 code="export interface AudioLibraryItem {id:string;name:string;category:string;type:'music'|'sound';duration:number;bpm?:number;file:string;waveform:number[]}\n"
 code+='export const AUDIO_LIBRARY:readonly AudioLibraryItem[]='+json.dumps(items,separators=(',',':'))+';\n'
 ROOT.joinpath('src/editor/video/audio-library.ts').write_text(code,encoding='utf-8')
 print(f'Generated {len(TRACKS)} original arrangements and {len(effects)} original sound effects.')
if __name__=='__main__':main()
