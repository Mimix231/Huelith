//! CPU reference implementations of nonlocal image operations.
//! These match the video editor's original alpha and pixel sampling rules.
//! The effect graph can replace this executor with a GPU compute kernel after
//! screenshot parity tests, without changing effect IDs or parameters.
use serde_json::Value;
fn parameter(parameters:&Value,key:&str,default:f64)->f64{
    parameters.get(key).and_then(Value::as_f64).unwrap_or(default)
}
/// Alpha-preserving pixel-cell average, matching pixelate.ts.
pub fn pixelate(frame:&mut[u8],w:u32,h:u32,amount:f64,parameters:&Value,scale:f64){
    let (w,h)=(w as usize,h as usize);
    let cell=amount.round().max(1.) as usize;
    let cell_y=(parameter(parameters,"cellY",amount/scale)*scale).round().max(1.) as usize;
    if cell==1&&cell_y==1{return;}
    let original=frame.to_vec();
    for y in (0..h).step_by(cell_y){for x in (0..w).step_by(cell){
        let (mut r,mut g,mut b,mut alpha)=(0.,0.,0.,0.);
        for yy in y..h.min(y+cell_y){for xx in x..w.min(x+cell){
            let pos=(yy*w+xx)*4;let a=original[pos+3] as f64/255.;
            r+=original[pos] as f64*a;g+=original[pos+1] as f64*a;
            b+=original[pos+2] as f64*a;alpha+=a;
        }}
        let color=if alpha>0. {[r/alpha,g/alpha,b/alpha]}else{[0.,0.,0.]};
        for yy in y..h.min(y+cell_y){for xx in x..w.min(x+cell){
            let pos=(yy*w+xx)*4;if original[pos+3]==0{continue;}
            for (c,v) in color.iter().enumerate(){frame[pos+c]=v.round().clamp(0.,255.) as u8;}
        }}
    }}
}
/// The original Box Blur is a separable sliding-window premultiplied-alpha
/// filter. It runs in O(width*height) independent of radius.
pub fn box_blur(frame:&mut[u8],w:u32,h:u32,amount:f64,parameters:&Value,scale:f64){
    let (w,h)=(w as usize,h as usize);if w==0||h==0{return;}
    let rx=amount.round().clamp(0.,60.) as usize;
    let ry=(parameter(parameters,"radiusY",amount/scale)*scale).round().clamp(0.,60.) as usize;
    if rx==0&&ry==0{return;}
    let original=frame.to_vec();let mut temp=vec![0f64;frame.len()];
    let hc=(rx*2+1) as f64;let vc=(ry*2+1) as f64;
    for y in 0..h{
        let offset=y*w*4;let (mut r,mut g,mut b,mut a)=(0.,0.,0.,0.);
        for dx in 0..rx*2+1{
            let x=dx.saturating_sub(rx).min(w-1);let p=offset+x*4;let alpha=original[p+3] as f64/255.;
            r+=original[p] as f64*alpha;g+=original[p+1] as f64*alpha;
            b+=original[p+2] as f64*alpha;a+=original[p+3] as f64;
        }
        for x in 0..w{
            let p=offset+x*4;temp[p]=r/hc;temp[p+1]=g/hc;temp[p+2]=b/hc;temp[p+3]=a/hc;
            let left=x.saturating_sub(rx);let right=(x+rx+1).min(w-1);
            let (drop,add)=(offset+left*4,offset+right*4);
            let da=original[drop+3] as f64/255.;let aa=original[add+3] as f64/255.;
            r+=original[add] as f64*aa-original[drop] as f64*da;
            g+=original[add+1] as f64*aa-original[drop+1] as f64*da;
            b+=original[add+2] as f64*aa-original[drop+2] as f64*da;
            a+=original[add+3] as f64-original[drop+3] as f64;
        }
    }
    for x in 0..w{
        let (mut r,mut g,mut b,mut a)=(0.,0.,0.,0.);
        for dy in 0..ry*2+1{
            let y=dy.saturating_sub(ry).min(h-1);let p=(y*w+x)*4;
            r+=temp[p];g+=temp[p+1];b+=temp[p+2];a+=temp[p+3];
        }
        for y in 0..h{
            let p=(y*w+x)*4;let average_a=(a/vc).max(0.);
            frame[p+3]=average_a.round().clamp(0.,255.) as u8;
            if average_a>1e-4{
                let norm=255./a.max(1e-4);
                frame[p]=(r*norm).round().clamp(0.,255.) as u8;
                frame[p+1]=(g*norm).round().clamp(0.,255.) as u8;
                frame[p+2]=(b*norm).round().clamp(0.,255.) as u8;
            }
            let top=y.saturating_sub(ry);let bottom=(y+ry+1).min(h-1);
            let (drop,add)=((top*w+x)*4,(bottom*w+x)*4);
            r+=temp[add]-temp[drop];g+=temp[add+1]-temp[drop+1];
            b+=temp[add+2]-temp[drop+2];a+=temp[add+3]-temp[drop+3];
        }
    }
}
/// Exact seed/index math of detail-core.ts hash(), using JavaScript's
/// 32-bit wrapping multiply semantics.
fn hash(x:u32,y:u32,seed:u32)->f64{
    let mut v=x.wrapping_add(7).wrapping_mul(374761393)^
      y.wrapping_add(11).wrapping_mul(668265263)^
      seed.wrapping_mul(2246822519);
    v=(v^(v>>13)).wrapping_mul(1274126177);
    (v^(v>>16)) as f64/u32::MAX as f64
}
pub fn posterize(frame:&mut[u8],w:u32,amount:f64,parameters:&Value){
    if amount<=0.{return;}
    let w=w as usize;
    let levels=amount.round().clamp(2.,32.);
    let step=255./(levels-1.);
    let strength=(parameter(parameters,"ditherMix",0.)/100.).clamp(0.,1.);
    for (index,px) in frame.chunks_exact_mut(4).enumerate(){
        if px[3]==0{continue;}
        let x=(index%w) as u32;let y=(index/w) as u32;
        let jitter=(hash(x,y,31)-0.5)*step*strength;
        for channel in px[..3].iter_mut(){
            *channel=(((f64::from(*channel)+jitter).clamp(0.,255.)/step).round()*step).round().clamp(0.,255.) as u8;
        }
    }
}
fn smooth(a:f64,b:f64,value:f64)->f64{
    let t=((value-a)/(b-a).max(1e-6)).clamp(0.,1.);t*t*(3.-2.*t)
}
pub fn solarize(frame:&mut[u8],amount:f64,parameters:&Value){
    let threshold=255.*(1.-amount/100.);
    let span=parameter(parameters,"transition",0.)*2.55;
    let mut lut=[0u8;256];
    for (i,out) in lut.iter_mut().enumerate(){
        let value=i as f64;
        let blend=if span>0.{smooth(threshold-span*0.5,threshold+span*0.5,value)}
            else if value>threshold{1.}else{0.};
        *out=(value+(255.-2.*value)*blend).round().clamp(0.,255.) as u8;
    }
    for px in frame.chunks_exact_mut(4){if px[3]==0{continue;}
        for channel in px.iter_mut().take(3){*channel=lut[*channel as usize];}
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test]fn pixelate_keeps_each_alpha(){
        let mut rgba=vec![255,0,0,255,0,0,255,0,0,255,0,128,0,0,0,0];
        pixelate(&mut rgba,2,2,2.,&Value::Null,1.);
        assert_eq!(rgba[3],255);assert_eq!(rgba[7],0);assert_eq!(rgba[11],128);
    }
    #[test]fn blur_does_not_make_dark_edges(){
        let mut rgba=vec![255,0,0,255,0,0,0,0,0,0,0,0];
        box_blur(&mut rgba,3,1,1.,&Value::Null,1.);
        assert!(rgba[0]>200);assert!(rgba[3]<255);
    }
    #[test]fn solarize_zero_is_identity_for_zero_transition(){
        let mut rgba=vec![70,130,220,255];solarize(&mut rgba,0.,&Value::Null);
        assert_eq!(rgba,[70,130,220,255]);
    }
}
