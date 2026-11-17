//! Native transition treatment passes. These are not WebView effects; the
//! effect recipes remain represented explicitly in the native render graph.
use std::f64::consts::PI;
const EFFECTS:&[&str]=&["motionblur","radialblur","zoomblur","sig_3","lensblur","chromatic",
    "neonedge","pixelate","vhs","glass","inkwash","glitch",
    "glow","blur","sig_9","sig_8","swirl","ripple","wave","sig_4",
    "graphicnovel","ink","atelier_4_0","watercolor","sig_1","sig_12",
    "contrast","sepia","invert","exposure"];
pub(super) fn supports(kind:&str)->bool{EFFECTS.contains(&kind)}
fn clamp(n:i32,max:u32)->usize{n.clamp(0,max.saturating_sub(1) as i32) as usize}
fn at(img:&[u8],w:u32,h:u32,x:i32,y:i32)->[u8;4]{
    let i=(clamp(y,h)*w as usize+clamp(x,w))*4;
    [img[i],img[i+1],img[i+2],img[i+3]]
}
fn avg(samples:&[[u8;4]])->[u8;4]{
    let mut sums=[0u64;4];for px in samples{for c in 0..4{sums[c]+=px[c] as u64;}}
    std::array::from_fn(|c|(sums[c]/samples.len().max(1) as u64) as u8)
}
/// Two-pass bounded box blur with O(width*height) work per pass.
pub(super) fn box_blur(img:&mut [u8],w:u32,h:u32,radius:usize){
    if radius==0||w==0||h==0{return;}
    let orig=img.to_vec();let mut horiz=vec![0u8;img.len()];let r=radius as i32;
    for y in 0..h as usize{
        let mut sums=[0u64;4];
        for xx in -r..=r{let i=(y*w as usize+clamp(xx,w))*4;for c in 0..4{sums[c]+=orig[i+c] as u64;}}
        for x in 0..w as usize{
            let i=(y*w as usize+x)*4;
            for c in 0..4{horiz[i+c]=(sums[c]/(2*radius+1) as u64) as u8;}
            let gone=(y*w as usize+clamp(x as i32-r,w))*4;
            let added=(y*w as usize+clamp(x as i32+r+1,w))*4;
            for c in 0..4{sums[c]=sums[c]+orig[added+c] as u64-orig[gone+c] as u64;}
        }
    }
    for x in 0..w as usize{
        let mut sums=[0u64;4];
        for yy in -r..=r{let i=(clamp(yy,h)*w as usize+x)*4;for c in 0..4{sums[c]+=horiz[i+c] as u64;}}
        for y in 0..h as usize{
            let i=(y*w as usize+x)*4;
            for c in 0..4{img[i+c]=(sums[c]/(2*radius+1) as u64) as u8;}
            let gone=(clamp(y as i32-r,h)*w as usize+x)*4;
            let added=(clamp(y as i32+r+1,h)*w as usize+x)*4;
            for c in 0..4{sums[c]=sums[c]+horiz[added+c] as u64-horiz[gone+c] as u64;}
        }
    }
}
fn hashed(x:i32,y:i32,seed:i32)->f64{
    let value=(x as u32).wrapping_mul(374761393)^(y as u32).wrapping_mul(668265263)^(seed as u32).wrapping_mul(2246822519);
    ((value^(value>>13)).wrapping_mul(1274126177)>>8) as f64/16_777_216.
}
fn linear_blur(orig:&[u8],img:&mut [u8],w:u32,h:u32,kind:&str,amount:f64){
    let samples=7;let strength=(amount/100.).clamp(0.,1.)*(w as f64/960.).max(0.5)*20.;
    for y in 0..h as usize{for x in 0..w as usize{
        let mut paths=[[0u8;4];7];
        for (k,sample) in paths.iter_mut().enumerate().take(samples){
            let offset=(k as f64/(samples-1) as f64-0.5)*strength;
            let (xx,yy)=match kind{
              "motionblur"=>(x as f64+offset,y as f64),
              "zoomblur"=>(x as f64+(x as f64-w as f64*0.5)/w as f64*offset,
                           y as f64+(y as f64-h as f64*0.5)/h as f64*offset),
              _=>{let angle=offset*PI/180.;let dx=x as f64-w as f64*0.5;let dy=y as f64-h as f64*0.5;
                  (w as f64*0.5+dx*angle.cos()-dy*angle.sin(),h as f64*0.5+dx*angle.sin()+dy*angle.cos())},
            };
            *sample=at(orig,w,h,xx.round() as i32,yy.round() as i32);
        }
        let out=avg(&paths);let i=(y*w as usize+x)*4;img[i..i+4].copy_from_slice(&out);
    }}
}
fn channel_shift(orig:&[u8],img:&mut [u8],w:u32,h:u32,amount:f64){
    let shift=((amount/100.).abs()*(w as f64/960.)*13.).round() as i32;
    for y in 0..h as usize{for x in 0..w as usize{
        let i=(y*w as usize+x)*4;img[i]=at(orig,w,h,x as i32+shift,y as i32)[0];
        img[i+2]=at(orig,w,h,x as i32-shift,y as i32)[2];
    }}
}
fn edge_glow(orig:&[u8],img:&mut [u8],w:u32,h:u32,amount:f64){
    let level=(amount/100.).clamp(0.,1.);
    for y in 0..h as usize{for x in 0..w as usize{
        let x=x as i32;let y=y as i32;
        let light=|xx,yy|{let p=at(orig,w,h,xx,yy);p[0] as f64*0.2126+p[1] as f64*0.7152+p[2] as f64*0.0722};
        let gx=(light(x+1,y)-light(x-1,y)).abs();let gy=(light(x,y+1)-light(x,y-1)).abs();
        let edge=((gx+gy)*level).min(255.) as u8;let i=(y as usize*w as usize+x as usize)*4;
        img[i]=img[i].saturating_add(edge/3);img[i+1]=img[i+1].saturating_add(edge/5);
        img[i+2]=img[i+2].saturating_add(edge);
    }}
}
pub(super) fn apply(img:&mut [u8],w:u32,h:u32,kind:&str,amount:f64,time:f64){
    if img.len()!=w as usize*h as usize*4 || amount<=0. || !amount.is_finite(){return;}
    let orig=img.to_vec();let strength=(amount/100.).clamp(0.,1.);
    match kind{
      "motionblur"|"radialblur"|"zoomblur"=>linear_blur(&orig,img,w,h,kind,amount),
      "lensblur"|"blur"=>box_blur(img,w,h,(strength*13.*(w as f64/960.).max(0.5)).round().max(1.) as usize),
      "chromatic"|"sig_8"=>channel_shift(&orig,img,w,h,amount),
      "neonedge"=>edge_glow(&orig,img,w,h,amount),
      "contrast"=>{let gain=amount/100.;for px in img.chunks_exact_mut(4){
          for c in 0..3{px[c]=((px[c] as f64-128.)*gain+128.).round().clamp(0.,255.) as u8;}
      }},
      "invert"=>{for px in img.chunks_exact_mut(4){for c in 0..3{
          px[c]=(px[c] as f64*(1.-strength)+(255-px[c]) as f64*strength).round() as u8;
      }}},
      "exposure"=>{let gain=2f64.powf((amount/100.-1.)*2.);
          for px in img.chunks_exact_mut(4){for c in 0..3{
              px[c]=(px[c] as f64*gain).round().clamp(0.,255.) as u8;
          }}
      },
      "sepia"=>{for px in img.chunks_exact_mut(4){let (r,g,b)=(px[0] as f64,px[1] as f64,px[2] as f64);
          let faded=[(0.393*r+0.769*g+0.189*b).min(255.),
            (0.349*r+0.686*g+0.168*b).min(255.),(0.272*r+0.534*g+0.131*b).min(255.)];
          for c in 0..3{px[c]=(px[c] as f64*(1.-strength)+faded[c]*strength).round().clamp(0.,255.) as u8;}
      }},
      "sig_3"|"glow"|"sig_1"|"sig_9"=>{
          let mut light=orig.clone();for px in light.chunks_exact_mut(4){
              let brightness=(px[0] as u16+px[1] as u16+px[2] as u16)/3;
              let factor=((brightness as f64-135.)/120.).clamp(0.,1.);
              for c in 0..3{px[c]=(px[c] as f64*factor) as u8;}
          }
          box_blur(&mut light,w,h,(strength*19.).round().max(1.) as usize);
          for (out,bright) in img.chunks_exact_mut(4).zip(light.chunks_exact(4)){
              for c in 0..3{out[c]=out[c].saturating_add((bright[c] as f64*strength*0.8) as u8);}
          }
      },
      "pixelate"=>{
          let step=(amount.round() as usize).clamp(1,256);
          for y in (0..h as usize).step_by(step){for x in (0..w as usize).step_by(step){
              let mut sum=[0f64;3];let mut alpha=0.;
              for yy in y..(y+step).min(h as usize){for xx in x..(x+step).min(w as usize){
                  let i=(yy*w as usize+xx)*4;let a=orig[i+3] as f64/255.;alpha+=a;
                  for c in 0..3{sum[c]+=orig[i+c] as f64*a;}
              }}
              for yy in y..(y+step).min(h as usize){for xx in x..(x+step).min(w as usize){
                  let i=(yy*w as usize+xx)*4;if orig[i+3]==0{continue;}
                  for c in 0..3{img[i+c]=if alpha>0.{(sum[c]/alpha).round().clamp(0.,255.) as u8}else{0};}
              }}
          }}
      },
      "vhs"=>{
          let band=(h as usize/46).max(2);let tick=(time*60.).floor() as i32;
          for y in 0..h as usize{
              let block=y/band;let unstable=hashed(3,block as i32,tick)<0.5;
              let track=if unstable{((hashed(block as i32,71,tick)-0.5)*2.*strength*(w as f64*0.13).min(44.)).round() as i32}else{0};
              let wobble=((y as f64*0.14+tick as f64).sin()*strength*2.).round() as i32;
              for x in 0..w as usize{
                  let src=at(&orig,w,h,x as i32+track+wobble,y as i32);
                  let i=(y*w as usize+x)*4;img[i..i+4].copy_from_slice(&src);
              }
          }
      },
      "swirl"|"ripple"|"wave"=>{
          for y in 0..h as usize{for x in 0..w as usize{
              let u=x as f64/w as f64-0.5;let v=y as f64/h as f64-0.5;
              let distance=(u*u+v*v).sqrt();
              let (xx,yy)=match kind{
                "swirl"=>{let angle=strength*PI*2.*(1.-distance*1.5).max(0.);
                    (w as f64*(0.5+u*angle.cos()-v*angle.sin()),h as f64*(0.5+u*angle.sin()+v*angle.cos()))},
                "ripple"=>{let wave=(distance*70.-time*5.).sin()*strength*0.018;
                    (w as f64*(0.5+u*(1.+wave)),h as f64*(0.5+v*(1.+wave)))},
                _=>(x as f64+(v*29.+time*3.).sin()*strength*21.,y as f64),
              };
              let src=at(&orig,w,h,xx.round() as i32,yy.round() as i32);
              let i=(y*w as usize+x)*4;img[i..i+4].copy_from_slice(&src);
          }}
      },
      "glass"=>{
          for y in 0..h as usize{for x in 0..w as usize{
              let cellx=x as f64/(12.+18.*strength);let celly=y as f64/(12.+18.*strength);
              let dx=(cellx*2.17+celly*0.81).sin()*strength*12.;
              let dy=(celly*2.31-cellx*0.71).cos()*strength*12.;
              let src=at(&orig,w,h,(x as f64+dx).round() as i32,(y as f64+dy).round() as i32);
              let i=(y*w as usize+x)*4;img[i..i+4].copy_from_slice(&src);
          }}
      },
      "inkwash"|"ink"|"watercolor"=>{
          box_blur(img,w,h,(strength*4.).round().max(1.) as usize);
          for (px,src) in img.chunks_exact_mut(4).zip(orig.chunks_exact(4)){
              let lum=(src[0] as f64*0.2126+src[1] as f64*0.7152+src[2] as f64*0.0722)/255.;
              let tone=if lum<0.2{0.75}else{1.0};
              for c in 0..3{px[c]=(px[c] as f64*(1.-strength)+px[c] as f64*strength*tone).round() as u8;}
          }
      },
      "sig_4"|"sig_12"=>{
          for y in 0..h as usize{for x in 0..w as usize{
              let i=(y*w as usize+x)*4;
              let scan=if y%4==0{1.-strength*0.4}else{1.};
              let grid=if kind=="sig_4"&&x%13==0{1.-strength*0.55}else{1.};
              for c in 0..3{img[i+c]=(orig[i+c] as f64*scan*grid).round().clamp(0.,255.) as u8;}
          }}
      },
      "graphicnovel"|"atelier_4_0"=>{
          for y in 0..h as usize{for x in 0..w as usize{
              let i=(y*w as usize+x)*4;let lum=|xx:i32,yy:i32|{
                  let px=at(&orig,w,h,xx,yy);
                  px[0] as f64*0.2126+px[1] as f64*0.7152+px[2] as f64*0.0722};
              let edge=(lum(x as i32+1,y as i32)-lum(x as i32-1,y as i32)).abs()+
                   (lum(x as i32,y as i32+1)-lum(x as i32,y as i32-1)).abs();
              for c in 0..3{
                  let poster=(orig[i+c] as f64/64.).round()*64.;
                  let v=if edge>60.{0.}else{poster.min(255.)};
                  img[i+c]=(orig[i+c] as f64*(1.-strength)+v*strength).round().clamp(0.,255.) as u8;
              }
          }}
      },
      "glitch"=>{
          let tick=(time*19.).round() as i32;
          for y in 0..h as usize{
              let band=(y/17) as i32;
              let shift=if hashed(band,31,tick)<strength*0.4{((hashed(band,71,tick)-0.5)*strength*58.).round() as i32}else{0};
              for x in 0..w as usize{
                  let pixel=at(&orig,w,h,x as i32+shift,y as i32);
                  let i=(y*w as usize+x)*4;img[i..i+4].copy_from_slice(&pixel);
              }
          }
          let staged=img.to_vec();channel_shift(&staged,img,w,h,amount*0.3);
      },
      _=>{}
    }
}
