const fs=require('node:fs'),path=require('node:path');
const {createCanvas,GifEncoder,GifDisposal}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/video-studio');fs.mkdirSync(out,{recursive:true});
const w=64,h=64,header=Buffer.alloc(18);header[2]=2;header.writeUInt16LE(w,12);header.writeUInt16LE(h,14);header[16]=32;header[17]=40;
const tga=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,inside=(x-32)**2+(y-32)**2<25**2;tga[i]=155;tga[i+1]=80;tga[i+2]=215;tga[i+3]=inside?220:0;}
fs.writeFileSync(path.join(out,'test-sticker.tga'),Buffer.concat([header,tga]));
const gif=new GifEncoder(64,64,{repeat:0,quality:1});for(let f=0;f<3;f++){
 const canvas=createCanvas(64,64),ctx=canvas.getContext('2d');ctx.fillStyle=['#8f55e8','#32d7bd','#f2c76a'][f];ctx.fillRect(0,0,64,64);ctx.fillStyle='#ffffff';ctx.fillRect(8+f*15,18,12,28);
 gif.addFrame(Uint8Array.from(ctx.getImageData(0,0,64,64).data),64,64,{delay:[100,300,200][f],disposal:GifDisposal.Background});
}fs.writeFileSync(path.join(out,'test-sticker.gif'),gif.finish());
const now=new Date().toISOString();
const timeline={assets:[{id:'studio-portrait',name:'Human OC.png',path:path.join(root,'public/video-library/previews/oc-human-base.png'),kind:'image',duration:5,width:1448,height:1086},
 {id:'studio-voice',name:'Speech fixture.wav',path:path.join(out,'speech-fixture.wav'),kind:'audio',duration:6}],
 tracks:[{id:'title',name:'Titles',kind:'title',muted:false,locked:false},{id:'overlay',name:'Overlay',kind:'video',muted:false,locked:false},{id:'video',name:'Video',kind:'video',muted:false,locked:false},{id:'audio',name:'Audio',kind:'audio',muted:false,locked:false}],
 clips:[{id:'portrait',assetId:'studio-portrait',trackId:'video',start:0,sourceIn:0,duration:6,volume:0,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0},
 {id:'voice',assetId:'studio-voice',trackId:'audio',start:0,sourceIn:0,duration:6,volume:1,opacity:1,fadeIn:0,fadeOut:0,x:0,y:0,scale:1,rotation:0}]};
fs.writeFileSync(path.join(out,'studio-fixture.huelith'),JSON.stringify({format:'huelith-video',version:1,id:'video-studio-qa',name:'Video Studio QA',width:1280,height:720,fps:30,createdAt:now,updatedAt:now,timeline},null,2));
console.log('Created native project, animated GIF and transparent TGA fixtures.');
