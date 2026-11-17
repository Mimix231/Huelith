//! Native-only Windows video timeline export. No HTMLVideoElement, Canvas2D,
//! browser frame readback, or WebView-to-Rust RGBA IPC in this export path.
//!
//! A compiled graph covers the operations implemented below. Advanced GPU
//! effects not yet ported must remain explicit errors, never silently skipped.
//! Production composition uses retained GPU resources with exact-operation
//! reference fallback. The current encoder still consumes CPU RGBA frames.
use std::{collections::{HashMap,VecDeque},path::PathBuf,sync::{Arc,Mutex,atomic::{AtomicBool,Ordering},mpsc},time::{Instant,Duration}};
use serde::{Deserialize,Serialize};
use serde_json::Value;
use tauri::{AppHandle,Emitter};
mod filter_lut;
mod authored_transition;
mod effect_registry;
mod silhouette_outline;
mod spatial_effects;
mod retained_gpu;
#[cfg(windows)]mod decode_ahead;
use super::{stream::{self,ExportPacket,StreamConfig},ExportReport,validate_output_path,validate_source_file};

#[derive(Default)]
pub struct NativeTimelineJobs(Mutex<HashMap<String,Arc<AtomicBool>>>);

#[derive(Clone,Debug,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct NativeKey {parameter:String,time:f64,value:f64,
  #[serde(default)]easing:Option<String>,#[serde(default)]curve:Option<[f64;4]>,
  #[serde(default)]ease_range:Option<[f64;2]>}
#[derive(Clone,Debug,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct NativeEffect {kind:String,amount:f64,#[serde(default)]parameters:Value,
  #[serde(default)]color:Option<String>,#[serde(default)]reference_width:Option<f64>,
  #[serde(default)]mask:Option<NativeMask>,
  #[serde(default)]keyframes:Vec<NativeKey>}
#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
struct NativeTransition {kind:String,duration:f64,direction:String,
  #[serde(default)]placement:Option<String>,#[serde(default)]native_recipe:Option<NativeRecipe>}
#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
struct NativeRegion {x:f64,y:f64,width:f64,height:f64}
#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
struct NativeMask {shape:String,region:NativeRegion,feather:f64,#[serde(default)]rotation:f64,
  #[serde(default)]invert:bool,#[serde(default)]vertices:Vec<[f64;2]>}
#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
struct NativeChroma {color:String,tolerance:f64,softness:f64,spill:f64}
#[derive(Clone,Debug,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct NativeText {#[serde(default)]font_family:Option<String>,#[serde(default)]font_size:Option<f64>,
  #[serde(default)]font_weight:Option<u16>,#[serde(default)]italic:bool,
  #[serde(default)]color:Option<String>,#[serde(default)]stroke:Option<String>,
  #[serde(default)]stroke_width:Option<f64>,#[serde(default)]align:Option<String>,
  #[serde(default)]line_height:Option<f64>,#[serde(default)]letter_spacing:Option<f64>,
  #[serde(default)]width:Option<f64>,#[serde(default)]reveal:Option<f64>,
  #[serde(default)]background:Option<String>}
#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
struct NativeShape {kind:String,width:f64,height:f64,fill:String,stroke:String,stroke_width:f64}
#[derive(Clone,Debug,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct NativeMotion {#[serde(default)]x:Option<f64>,#[serde(default)]y:Option<f64>,
  #[serde(default)]zoom:Option<f64>,#[serde(default)]rotation:Option<f64>,
  #[serde(default)]fold_x:bool,#[serde(default)]fold_y:bool,
  #[serde(default)]bounce:Option<f64>,#[serde(default)]blur:Option<f64>}
#[derive(Clone,Debug,Deserialize)]
struct NativeTransitionFx {kind:String,amount:f64}
#[derive(Clone,Debug,Deserialize)]
struct NativeReveal {id:String,#[serde(default)]mask:Option<String>,#[serde(default)]motion:Option<NativeMotion>,
  #[serde(default)]tint:Option<String>,#[serde(default)]flash:Option<f64>,
  #[serde(default)]pulse:Option<f64>,#[serde(default)]linear:bool,
  #[serde(default)]fx:Option<NativeTransitionFx>}
#[derive(Clone,Debug,Deserialize)]
struct NativeLegacyEffect {kind:String,peak:f64}
#[derive(Clone,Debug,Deserialize)]
struct NativeRecipe {id:String,group:String,reveal:NativeReveal,#[serde(default)]leave:Option<NativeReveal>,
  #[serde(default,rename="legacyEffects")]legacy_effects:Vec<NativeLegacyEffect>}
#[derive(Clone,Debug,Deserialize)]
struct NativeTimePoint {time:f64,source:f64}
#[derive(Clone,Debug,Deserialize)]
struct NativeCut {start:f64,end:f64,kind:String,direction:String,
  #[serde(default)]native_recipe:Option<NativeRecipe>}
#[derive(Clone,Debug,Deserialize)]
struct NativeAnimationSpan {id:String,start:f64,duration:f64}
#[derive(Clone,Debug,Deserialize,Default)]
struct NativeAnimation {#[serde(rename="In",default)]incoming:Option<NativeAnimationSpan>,
  #[serde(rename="Out",default)]outgoing:Option<NativeAnimationSpan>,
  #[serde(rename="Combo",default)]combo:Option<NativeAnimationSpan>}

#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct NativeVisualClip {
    id:String, path:String, kind:String,
    start:f64, duration:f64, source_in:f64,
    x:f64,y:f64,scale:f64,scale_y:f64,rotation:f64,
    opacity:f64,fade_in:f64,fade_out:f64,
    flip_x:bool,flip_y:bool,
    fit:String,
    crop:[f64;4],
    #[serde(default)]title:String,
    #[serde(default)]blend_mode:String,
    #[serde(default)]text_style:Option<NativeText>,
    #[serde(default)]shape:Option<NativeShape>,
    #[serde(default)]mask:Option<NativeMask>,
    #[serde(default)]chroma_key:Option<NativeChroma>,
    #[serde(default)]transition_in:Option<NativeTransition>,
    #[serde(default)]transition_out:Option<NativeTransition>,
    #[serde(default)]keyframes:Vec<NativeKey>,
    #[serde(default)]animation:NativeAnimation,
    #[serde(default)]source_map:Vec<NativeTimePoint>,
    #[serde(default)]hold_frame:Option<f64>,
    #[serde(default)]effects:Vec<NativeEffect>,
    #[serde(default)]grade:Option<Value>,
    #[serde(default)]cut_in:Option<NativeCut>,
    #[serde(default)]cut_out:Option<NativeCut>,
}
#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct NativeTimelinePlan {
    graph_version:u32,
    stream:StreamConfig,
    range_start:f64,
    background:[u8;3],
    clips:Vec<NativeVisualClip>,
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct NativeTimelineProgress {
    job_id:String,completed:u32,total:u32,
    source_ms:f64,composite_ms:f64,encode_ms:f64,
    backend:&'static str,
    native:stream::NativeFrameStages,
}

/// The playlist is passed from the validated TypeScript timeline model.
/// Validation is repeated here because IPC input must never be trusted.
// Validated operations shared by native preview, PNG and MP4 export.
// This deliberately uses no browser decoder, Canvas2D, or WebView fallback.
fn validate_clip_operations(clip:&NativeVisualClip)->Result<(),String>{
    if clip.keyframes.len()>12000 || clip.effects.len()>256 ||clip.source_map.len()>8192 ||
      clip.title.len()>10000{return Err(format!("Native clip {} exceeds operation limits",clip.id));}
    if !matches!(clip.blend_mode.as_str(),""|"source-over"|"multiply"|"screen"|"overlay"|"darken"|"lighten"|"soft-light"|"difference"|"lighter"){
        return Err(format!("Native compositor cannot handle blend mode {}",clip.blend_mode));
    }
    for effect in &clip.effects{
        if !effect_registry::supports(&effect.kind){
            return Err(format!("Native effect {} has no implemented processor",effect.kind));
        }
        if effect.kind=="video-filter" {filter_lut::decode_recipe(&effect.parameters)?;}
        if effect.kind=="outline" {
            let style=effect.parameters.get("outlineStyle").and_then(Value::as_str).unwrap_or("classic");
            if style!="classic"&&!(matches!(clip.kind.as_str(),"title"|"shape")&&matches!(style,"neon"|"soft"|"double"|"gradient"|"electric")
                &&effect.parameters.get("silhouetteMode").and_then(Value::as_str)!=Some("edge")){
                return Err(format!("Native outline style {style} needs a transparent title or shape"));
            }
            if effect.color.as_deref().is_some_and(|c|c.len()!=7||!c.starts_with('#')||!c[1..].chars().all(|h|h.is_ascii_hexdigit())) {
                return Err("Invalid native outline color".into());
            }
        }
        if effect.reference_width.is_some_and(|w|!w.is_finite()||w<16.||w>7680.) {
            return Err("Invalid effect reference width".into());
        }
        if let Some(mask)=&effect.mask {
            if !matches!(mask.shape.as_str(),"rectangle"|"ellipse") || mask.feather<0. ||mask.feather>0.25||!mask.feather.is_finite()
              ||![mask.region.x,mask.region.y,mask.region.width,mask.region.height,mask.rotation].iter().all(|v|v.is_finite()) {
                return Err(format!("Invalid native mask on effect {}",effect.kind));
            }
        }
        if !effect.amount.is_finite() || effect.keyframes.len()>4096||effect.keyframes.iter().any(|key|
            !key.value.is_finite()||!key.time.is_finite()||key.time<0.||key.parameter.len()>80){
            return Err(format!("Invalid native effect {}",effect.kind));
        }
    }
    if clip.keyframes.iter().any(|key|!key.time.is_finite()||!key.value.is_finite()||
       !matches!(key.parameter.as_str(),"x"|"y"|"scale"|"scaleY"|"rotation"|"opacity")){
        return Err("Invalid native transform keyframes".into());
    }
    if clip.source_map.iter().any(|key|!key.time.is_finite()||!key.source.is_finite()||key.source<0.)||
      clip.source_map.windows(2).any(|pair|pair[0].time>=pair[1].time){
        return Err("Invalid native source retiming".into());
    }
    if clip.hold_frame.is_some_and(|time|!time.is_finite()||time<0.){
        return Err("Invalid native freeze frame".into());
    }
    for cut in [&clip.cut_in,&clip.cut_out].into_iter().flatten(){
        if cut.kind=="effect"{authored_transition::validate(cut.native_recipe.as_ref())?;}
        if !cut.start.is_finite()||!cut.end.is_finite()||cut.start>=cut.end||
           !matches!(cut.kind.as_str(),"cross-dissolve"|"wipe"|"slide"|"effect"){
            return Err("Invalid native cut transition".into());
        }
    }
    for t in [&clip.transition_in,&clip.transition_out].into_iter().flatten(){
        if t.kind=="effect"{authored_transition::validate(t.native_recipe.as_ref())?;}
        if !matches!(t.kind.as_str(),"cross-dissolve"|"wipe"|"slide"|"effect")||t.duration<=0.||!t.duration.is_finite()
          {
            return Err(format!("Native renderer does not yet handle two-clip transition: {}",t.kind));
        }
    }
    if let Some(mask)=&clip.mask{
        if !matches!(mask.shape.as_str(),"rectangle"|"ellipse"|"polygon") ||
          mask.feather<0.||mask.feather>0.25 || !mask.feather.is_finite() ||
          ![mask.region.x,mask.region.y,mask.region.width,mask.region.height,mask.rotation].iter().all(|n|n.is_finite()){
            return Err("Invalid native clip mask".into());
        }
    }
    if let Some(shape)=&clip.shape{
        if !matches!(shape.kind.as_str(),"rectangle"|"ellipse"|"diamond"|"arrow"|"star")||
          !shape.width.is_finite()||!shape.height.is_finite()||shape.width<=0.||shape.height<=0.||
          !shape.stroke_width.is_finite()||shape.stroke_width<0.{return Err("Invalid native shape".into());}
    }
    if clip.kind=="title"&&clip.title.is_empty(){return Err("Native title has no text".into());}
    Ok(())
}

fn rgb_from_hex(value:&str)->[u8;3]{
    let v=value.strip_prefix('#').unwrap_or(value);
    if v.len()!=6{return [255,255,255];}
    let n=u32::from_str_radix(v,16).unwrap_or(0xffffff);
    [(n>>16) as u8,(n>>8) as u8,n as u8]
}
fn cubic_bezier(p:f64,a:f64,b:f64)->f64{3.*(1.-p).powi(2)*p*a+3.*(1.-p)*p*p*b+p.powi(3)}
fn key_ease(p:f64,key:&NativeKey)->f64{
    if p<=0.||p>=1.{return p;}
    if let Some(c)=key.curve{
        let (mut lo,mut hi)=(0.,1.);
        for _ in 0..18 {let t=(lo+hi)*0.5;if cubic_bezier(t,c[0],c[2])<p{lo=t;}else{hi=t;}}
        return cubic_bezier((lo+hi)*0.5,c[1],c[3]);
    }
    match key.easing.as_deref(){
      Some("ease-in")=>p*p,Some("ease-out")=>p*(2.-p),
      Some("ease-in-out")=>p*p*(3.-2.*p),Some("hold")=>0.,_=>p,
    }
}
fn key_progress(p:f64,key:&NativeKey)->f64{
    if p<=0.||p>=1.{return p;}
    let [start,end]=key.ease_range.unwrap_or([0.,1.]);
    let a=key_ease(start,key);let b=key_ease(end,key);
    if b>a{(key_ease(start+(end-start)*p,key)-a)/(b-a)}else{p}
}
fn keyed_value(keys:&[NativeKey],parameter:&str,time:f64,base:f64)->f64{
    let mut before:Option<&NativeKey>=None;let mut after:Option<&NativeKey>=None;
    for key in keys.iter().filter(|key|key.parameter==parameter){
        if key.time<=time && before.is_none_or(|b|b.time<=key.time){before=Some(key);}
        else if key.time>time && after.is_none_or(|a|a.time>key.time){after=Some(key);}
    }
    match (before,after){
      (Some(a),Some(b)) if b.time>a.time=>{
          let t=((time-a.time)/(b.time-a.time)).clamp(0.,1.);
          a.value+(b.value-a.value)*key_progress(t,a)
      },
      (Some(a),_)=>a.value,
      (None,Some(b))=>b.value,
      _=>base,
    }
}
fn animation_offset(id:&str,weight:f64,bounce:f64,shake:f64)->(f64,f64,f64,f64,f64){
    // The values mirror src/editor/video/clip-animation.ts authored presets.
    let (x,y,zoom,rotation,fade)=match id{
      "soft-appear"|"soft-disappear"=>(0.,0.,0.,0.,1.),
      "lift"=>(0.,0.19,0.,0.,1.),"drop"=>(0.,-0.26,0.,0.,1.),
      "slide-in"=>(-0.45,0.,0.,0.,1.),"pop"=>(0.,0.,-0.45,0.,1.),
      "swing-in"=>(-0.18,0.,0.,-48.,1.),"pull-focus"=>(0.,0.,0.64,0.,1.),
      "quake-in"=>(0.,0.,0.,0.,1.),"float-away"=>(0.,-0.28,0.,0.,1.),
      "fall-away"=>(0.,0.42,0.,12.,1.),"slide-out"=>(0.48,0.,0.,0.,1.),
      "shrink"=>(0.,0.,-0.72,0.,1.),"swing-out"=>(0.24,0.,0.,58.,1.),
      "rush-away"=>(0.,0.,0.8,0.,1.),"quake-out"=>(0.,0.,0.,0.,1.),
      "slow-pulse"=>(0.,0.,0.22,0.,0.),"orbit"=>(0.12,0.05,0.,16.,0.),
      "sweep"=>(0.26,-0.08,0.,0.,0.),"tilt-return"=>(0.,0.,0.12,-28.,0.),
      "float"=>(0.,-0.14,0.06,0.,0.),"impact"=>(0.,0.,0.25,0.,0.),
      "drift"=>(-0.18,0.12,0.,9.,0.),"flash-pulse"=>(0.,0.,0.3,0.,0.4),_=> (0.,0.,0.,0.,0.),
    };
    (x*weight+shake,y*weight+bounce*0.5,1.+zoom*weight+bounce,rotation*weight+shake*32.,1.-fade*weight)
}
#[derive(Clone,Copy)]
struct RenderTransform{x:f64,y:f64,scale:f64,scale_y:f64,rotation:f64,opacity:f64}
fn transform_at(clip:&NativeVisualClip,local:f64)->RenderTransform{
    let mut t=RenderTransform{
      x:keyed_value(&clip.keyframes,"x",local,clip.x),y:keyed_value(&clip.keyframes,"y",local,clip.y),
      scale:keyed_value(&clip.keyframes,"scale",local,clip.scale),
      scale_y:keyed_value(&clip.keyframes,"scaleY",local,clip.scale_y),
      rotation:keyed_value(&clip.keyframes,"rotation",local,clip.rotation),
      opacity:keyed_value(&clip.keyframes,"opacity",local,clip.opacity),
    };
    for (span,group) in [(&clip.animation.incoming,0),(&clip.animation.outgoing,1),(&clip.animation.combo,2)]{
        if let Some(span)=span{
            if span.duration<=0.{continue;}
            let p=((local-span.start)/span.duration).clamp(0.,1.);
            let smooth=p*p*(3.-2.*p);
            let weight=match group{0=>1.-smooth,1=>smooth,_=>(std::f64::consts::PI*p).sin()};
            let bounce_strength=match span.id.as_str(){"drop"=>0.034,"pop"=>0.19,_=>0.};
            let shake_strength=match span.id.as_str(){"quake-in"=>0.052,"quake-out"=>0.08,"impact"=>0.065,_=>0.};
            let bounce=(2.*std::f64::consts::PI*p).sin()*bounce_strength;
            let shake=(26.*std::f64::consts::PI*p).sin()*weight*shake_strength;
            let (x,y,scale,rot,alpha)=animation_offset(&span.id,weight,bounce,shake);
            t.x+=x;t.y+=y;t.scale*=scale;t.scale_y*=scale;t.rotation+=rot;t.opacity*=alpha;
        }
    }
    t.scale=t.scale.clamp(0.01,32.);t.scale_y=t.scale_y.clamp(0.01,32.);t.opacity=t.opacity.clamp(0.,1.);
    t
}
fn active_at(clip:&NativeVisualClip,time:f64)->bool{
    let start=clip.cut_in.as_ref().map_or(clip.start,|cut|cut.start.min(clip.start));
    let end=clip.cut_out.as_ref().map_or(clip.start+clip.duration,|cut|cut.end.max(clip.start+clip.duration));
    time>=start&&time<end
}
fn source_time(clip:&NativeVisualClip,local:f64)->f64{
    if let Some(time)=clip.hold_frame{return time.max(0.);}
    let keys=&clip.source_map;
    if keys.len()<2{return (clip.source_in+local).max(0.);}
    let (a,b)=if local<=keys[0].time{(&keys[0],&keys[1])}
      else if local>=keys[keys.len()-1].time{(&keys[keys.len()-2],&keys[keys.len()-1])}
      else {let index=keys.partition_point(|key|key.time<=local).clamp(1,keys.len()-1);
          (&keys[index-1],&keys[index])};
    if b.time<=a.time {return a.source.max(0.);}
    (a.source+(b.source-a.source)*(local-a.time)/(b.time-a.time)).max(0.)
}
fn transition_opacity(clip:&NativeVisualClip,local:f64)->f64{
    let mut opacity=1.;
    if let Some(t)=&clip.transition_in{
        if t.kind=="cross-dissolve" && t.placement.as_deref()!=Some("cut")
          {opacity*= (local/t.duration).clamp(0.,1.);}
    }
    if let Some(t)=&clip.transition_out{
        if t.kind=="cross-dissolve" {opacity*= ((clip.duration-local)/t.duration).clamp(0.,1.);}
    }
    opacity
}
fn transition_coverage(clip:&NativeVisualClip,local:f64,x:f64,y:f64,luma:f64)->f64{
    let mut result=1.;
    for (transition,p) in [(&clip.transition_in,0),(&clip.transition_out,1)]{
        if let Some(t)=transition{
            if t.kind=="cross-dissolve"||t.kind=="effect"||t.placement.as_deref()==Some("cut") {continue;}
            let amount=if p==0 {(local/t.duration).clamp(0.,1.)}
                else {((clip.duration-local)/t.duration).clamp(0.,1.)};
            let normalized=match t.direction.as_str(){"right"=>1.-x,"up"=>1.-y,"down"=>y,_=>x};
            if t.kind=="wipe" {result*=if normalized<=amount{1.}else{0.};}
            else if t.kind=="slide" {
                // A sliding reveal moves the clip over the outgoing layer.
                let position=match t.direction.as_str(){"right"=>x,"up"=>1.-y,"down"=>y,_=>1.-x};
                result*=if position<=amount{1.}else{0.};
            }
        }
    }
    // Cut transitions cover both outgoing and incoming sources. The opacity
    // interpolation in opacity() handles cross-dissolve; directional cuts use
    // spatial clipping to reveal or hide a clip at the cut's progress.
    let at=clip.start+local;
    for (cut,incoming) in [(&clip.cut_in,true),(&clip.cut_out,false)]{
        if let Some(cut)=cut{
            if cut.kind=="cross-dissolve"||cut.kind=="effect" {continue;}
            let progress=((at-cut.start)/(cut.end-cut.start)).clamp(0.,1.);
            let amount=if incoming{progress}else{1.-progress};
            let normalized=match cut.direction.as_str(){"right"=>1.-x,"up"=>1.-y,"down"=>y,_=>x};
            result*=if normalized<=amount{1.}else{0.};
        }
    }
    result*authored_transition::coverage(clip,at,x,y,luma)
}
fn mask_coverage(mask:&NativeMask,x:f64,y:f64)->f64{
    let rx=mask.region.x+mask.region.width*0.5;let ry=mask.region.y+mask.region.height*0.5;
    let (sn,cs)=mask.rotation.to_radians().sin_cos();let dx=x-rx;let dy=y-ry;
    let xx= cs*dx+sn*dy;let yy= -sn*dx+cs*dy;
    let hw=mask.region.width*0.5;let hh=mask.region.height*0.5;
    let distance=match mask.shape.as_str(){
      "ellipse"=>{let r=((xx/hw.max(1e-6)).powi(2)+(yy/hh.max(1e-6)).powi(2)).sqrt();
        (1.-r)*hw.min(hh)},
      "polygon"=>{
         if mask.vertices.len()<3 {return if mask.invert{1.}else{0.};}
         let u=(xx+hw)/(2.*hw.max(1e-6));let v=(yy+hh)/(2.*hh.max(1e-6));
         let mut inside=false;let mut j=mask.vertices.len()-1;
         for i in 0..mask.vertices.len(){let a=mask.vertices[i];let b=mask.vertices[j];
            if (a[1]>v)!=(b[1]>v)&&u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0]{inside=!inside;}
            j=i;
         }
         if inside{hw.min(hh)}else{-hw.min(hh)}
      },
      _=> (hw-xx.abs()).min(hh-yy.abs()),
    };
    let feather=mask.feather.max(1e-7);
    let coverage=if mask.feather==0.{if distance>=0.{1.}else{0.}}
        else {(distance/feather+0.5).clamp(0.,1.)};
    if mask.invert{1.-coverage}else{coverage}
}
fn blend_channel(src:f64,dst:f64,mode:&str)->f64{
    match mode{
      "multiply"=>src*dst,"screen"=>src+dst-src*dst,
      "overlay"=>if dst<0.5{2.*src*dst}else{1.-2.*(1.-src)*(1.-dst)},
      "darken"=>src.min(dst),"lighten"=>src.max(dst),
      "difference"=>(dst-src).abs(),"lighter"=>(src+dst).min(1.),
      "soft-light"=>if src<=0.5{dst-(1.-2.*src)*dst*(1.-dst)}else{
          dst+(2.*src-1.)*((if dst<=0.25{((16.*dst-12.)*dst+4.)*dst}else{dst.sqrt()})-dst)},
      _=>src,
    }
}
fn blend_pixel_mode(dst:&mut[u8],src:[u8;4],opacity:f64,mode:&str){
    let a=(src[3] as f64/255.*opacity).clamp(0.,1.);
    if a==0.{return;}
    for i in 0..3{
        let base=dst[i] as f64/255.;let incoming=src[i] as f64/255.;
        dst[i]=((base*(1.-a)+blend_channel(incoming,base,mode)*a)*255.).round().clamp(0.,255.) as u8;
    }
    dst[3]=255;
}
fn color_effects(frame:&mut [u8],width:u32,height:u32,clip:&NativeVisualClip,local:f64)->Result<(),String>{
    if frame.len()!=width as usize*height as usize*4{return Err("Invalid native effect frame length".into());}
    for effect in &clip.effects{
        let amount=keyed_value(&effect.keyframes,"amount",local,effect.amount);
        // Resolve parameter keyframes at the same clip-local clock as the effect amount.
        // Unknown parameter types are not invented: the original data stays intact.
        let mut parameters=if effect.parameters.is_object(){effect.parameters.clone()}
            else{Value::Object(serde_json::Map::new())};
        if let Some(fields)=parameters.as_object_mut() {
            let mut animated=std::collections::HashSet::new();
            for key in &effect.keyframes {
                if key.parameter!="amount"&&animated.insert(&key.parameter) {
                    let base=fields.get(&key.parameter).and_then(Value::as_f64).unwrap_or(0.);
                    fields.insert(key.parameter.clone(),Value::from(keyed_value(&effect.keyframes,&key.parameter,local,base)));
                }
            }
        }
        // Preserve the exact order of authored effects, including their masks.
        let before=effect.mask.as_ref().map(|_|frame.to_vec());
        if effect.kind=="video-filter"{filter_lut::apply(frame,amount,&parameters)?;}
        else if effect.kind=="outline" {
            let scale=effect.reference_width.map(|r|width as f64/r).unwrap_or(1.);
            let mut scaled=parameters.clone();
            if let Some(fields)=scaled.as_object_mut(){for key in ["softness","outlineGap","secondaryWidth"]{
                if let Some(value)=fields.get(key).and_then(Value::as_f64){fields.insert(key.into(),Value::from(value*scale));}
            }}
            silhouette_outline::apply(frame,width,height,amount*scale,effect.color.as_deref().unwrap_or("#ffffff"),&scaled)?;
        } else if effect.kind=="pixelate" {
            let scale=effect.reference_width.map(|r|width as f64/r).unwrap_or(1.);
            spatial_effects::pixelate(frame,width,height,amount*scale,&parameters,scale);
        } else if effect.kind=="boxblur" {
            let scale=effect.reference_width.map(|r|width as f64/r).unwrap_or(1.);
            spatial_effects::box_blur(frame,width,height,amount*scale,&parameters,scale);
        } else if effect.kind=="posterize" {
            spatial_effects::posterize(frame,width,amount,&parameters);
        } else if effect.kind=="solarize" {
            spatial_effects::solarize(frame,amount,&parameters);
        } else {
        let alpha=(amount/100.).clamp(0.,1.);
        for pix in frame.chunks_exact_mut(4){
            let (mut r,mut g,mut b)=(pix[0] as f64/255.,pix[1] as f64/255.,pix[2] as f64/255.);
            match effect.kind.as_str(){
              "brightness"=>{let factor=amount/100.;r*=factor;g*=factor;b*=factor;},
              "contrast"=>{let factor=amount/100.;r=(r-0.5)*factor+0.5;g=(g-0.5)*factor+0.5;b=(b-0.5)*factor+0.5;},
              "saturate"|"saturation"=>{let lum=0.213*r+0.715*g+0.072*b;let k=amount/100.;
                    r=lum+(r-lum)*k;g=lum+(g-lum)*k;b=lum+(b-lum)*k;},
              "grayscale"=>{let lum=0.213*r+0.715*g+0.072*b;
                    r=r*(1.-alpha)+lum*alpha;g=g*(1.-alpha)+lum*alpha;b=b*(1.-alpha)+lum*alpha;},
              "invert"=>{r=r*(1.-alpha)+(1.-r)*alpha;g=g*(1.-alpha)+(1.-g)*alpha;b=b*(1.-alpha)+(1.-b)*alpha;},
              "sepia"=>{let rr=(0.393*r+0.769*g+0.189*b).min(1.);
                    let gg=(0.349*r+0.686*g+0.168*b).min(1.);
                    let bb=(0.272*r+0.534*g+0.131*b).min(1.);
                    r=r*(1.-alpha)+rr*alpha;g=g*(1.-alpha)+gg*alpha;b=b*(1.-alpha)+bb*alpha;},
              "exposure"=>{let stops=(amount/100.-1.)*2.;let factor=2f64.powf(stops);
                    r*=factor;g*=factor;b*=factor;},
              "gamma"=>{let gamma=(amount/100.).max(0.01);
                    r=r.max(0.).powf(1./gamma);g=g.max(0.).powf(1./gamma);b=b.max(0.).powf(1./gamma);},
              _=>{},
            }
            pix[0]=(r*255.).round().clamp(0.,255.) as u8;
            pix[1]=(g*255.).round().clamp(0.,255.) as u8;
            pix[2]=(b*255.).round().clamp(0.,255.) as u8;
        }
        } // End color-effect branch.
        if let (Some(original),Some(mask))=(before.as_deref(),effect.mask.as_ref()) {
            // Evaluate the authored effect on the full frame then mix by mask.
            // No masked pixels are ignored or silently dropped.
            for (index,(dst,source)) in frame.chunks_exact_mut(4).zip(original.chunks_exact(4)).enumerate(){
                let x=(index%width as usize) as f64/width as f64;
                let y=(index/width as usize) as f64/height as f64;
                let coverage=mask_coverage(mask,x,y).clamp(0.,1.);
                for channel in 0..4 {dst[channel]=(source[channel] as f64*(1.-coverage)+dst[channel] as f64*coverage).round() as u8;}
            }
        }
    }
    if let Some(grade)=&clip.grade{
        if let Some(basic)=grade.get("basic"){
            let value=|name:&str|basic.get(name).and_then(Value::as_f64).unwrap_or(0.);
            let exposure=2f64.powf(2.*value("exposure"));
            let contrast=1.+value("contrast")*0.85+value("clarity")*0.22;
            let saturation=1.+value("saturation");
            let fade=value("fade")*0.2;
            for px in frame.chunks_exact_mut(4){
                let l=(px[0] as f64*0.2126+px[1] as f64*0.7152+px[2] as f64*0.0722)/255.;
                let tonal=value("highlights")*l*l*0.44+value("shadows")*(1.-l).powi(2)*0.38+
                    value("whites")*l.powi(4)*0.32+value("blacks")*(1.-l).powi(4)*0.26+
                    value("brilliance")*4.*l*(1.-l)*0.16;
                let balance=[value("temperature")*0.14+value("tint")*0.05,-value("tint")*0.12,
                    -value("temperature")*0.14+value("tint")*0.05];
                for c in 0..3{
                    let raw=px[c] as f64/255.;let v=(l+(raw-l)*saturation)*exposure;
                    px[c]=(((((v-0.5)*contrast+0.5+tonal+balance[c])*(1.-fade)+fade*0.6)*255.).clamp(0.,255.)) as u8;
                }
            }
        }
    }
    if let Some(key)=&clip.chroma_key{
        let color=rgb_from_hex(&key.color);let [kr,kg,kb]=color.map(|v|v as f64/255.);
        let lum=|r:f64,g:f64,b:f64|0.2126*r+0.7152*g+0.0722*b;
        let level=lum(kr,kg,kb);let cb=(kb-level)*0.539;let cr=(kr-level)*0.635;
        let (ax,ay,az)=(kr-level,kg-level,kb-level);let energy=ax*ax+ay*ay+az*az;let gray=energy<0.015;
        let softness=key.softness.max(0.001);
        for px in frame.chunks_exact_mut(4){
            let (r,g,b)=(px[0] as f64/255.,px[1] as f64/255.,px[2] as f64/255.);
            let y=lum(r,g,b);let db=(b-y)*0.539-cb;let dr=(r-y)*0.635-cr;
            let dl=if gray{(y-level)*0.75}else{0.};let distance=(db*db+dr*dr+dl*dl).sqrt();
            let edge=((distance-key.tolerance)/softness).clamp(0.,1.);
            px[3]=((px[3] as f64)*edge*edge*(3.-2.*edge)).round() as u8;
            if !gray&&key.spill>0.&&energy>0.{
                let near=(1.-distance/(key.tolerance+softness+0.25)).clamp(0.,1.);
                let excess=(((r-y)*ax+(g-y)*ay+(b-y)*az)/energy).max(0.)*key.spill*near;
                px[0]=((r-excess*ax)*255.).clamp(0.,255.) as u8;
                px[1]=((g-excess*ay)*255.).clamp(0.,255.) as u8;
                px[2]=((b-excess*az)*255.).clamp(0.,255.) as u8;
            }
        }
    }
    Ok(())
}

/// Rasterize native vector shapes and system-font titles without WebView.
/// Only the subset checked by the compiler is accepted; missing fonts are errors.
#[cfg(windows)]
fn system_font(family:&str,weight:u16,italic:bool)->Result<Arc<fontdue::Font>,String>{
    use std::sync::OnceLock;
    static FONTS:OnceLock<Mutex<HashMap<String,Arc<fontdue::Font>>>>=OnceLock::new();
    let cache=FONTS.get_or_init(||Mutex::new(HashMap::new()));
    let key=format!("{family}:{weight}:{italic}");
    if let Some(font)=cache.lock().map_err(|_|"Native font cache unavailable")?.get(&key){return Ok(font.clone());}
    let mut db=fontdb::Database::new();db.load_system_fonts();
    let id=db.query(&fontdb::Query{families:&[fontdb::Family::Name(family),fontdb::Family::SansSerif],
      weight:fontdb::Weight(weight),style:if italic{fontdb::Style::Italic}else{fontdb::Style::Normal},
      ..fontdb::Query::default()}).ok_or_else(||format!("No installed native font for {family}"))?;
    let parsed=db.with_face_data(id,|data,index|fontdue::Font::from_bytes(data.to_vec(),
      fontdue::FontSettings{collection_index:index,..Default::default()}))
      .ok_or_else(||format!("Cannot load native font {family}"))?
      .map_err(|e|format!("Native font parse error {family}: {e}"))?;
    let font=Arc::new(parsed);
    cache.lock().map_err(|_|"Native font cache unavailable")?.insert(key,font.clone());
    Ok(font)
}
#[cfg(windows)]
fn render_synthetic(clip:&NativeVisualClip,width:u32,height:u32,time:f64)->Result<Vec<u8>,String>{
    let mut output=vec![0u8;width as usize*height as usize*4];
    if let Some(shape)=&clip.shape{
        let fill=rgb_from_hex(&shape.fill);let stroke=rgb_from_hex(&shape.stroke);
        let (half_w,half_h)=(shape.width*0.5,shape.height*0.5);
        let radius=half_w.min(half_h).max(1e-6);
        let points:Vec<[f64;2]>=if shape.kind=="diamond"{vec![[0.,-1.],[1.,0.],[0.,1.],[-1.,0.]]}
          else if shape.kind=="arrow"{vec![[-1.,-0.34],[0.26,-0.34],[0.26,-1.],[1.,0.],[0.26,1.],[0.26,0.34],[-1.,0.34]]}
          else if shape.kind=="star"{(0..10).map(|i|{let angle=(i as f64)*std::f64::consts::PI/5.-std::f64::consts::FRAC_PI_2;
            let r=if i%2==0{1.}else{0.44};[angle.cos()*r,angle.sin()*r]}).collect()}
          else {Vec::new()};
        for y in 0..height as usize{
            for x in 0..width as usize{
                let nx=(x as f64+0.5)/width as f64-0.5;let ny=(y as f64+0.5)/height as f64-0.5;
                let inside=if shape.kind=="ellipse"{(nx/radius).powi(2)+(ny/radius).powi(2)<=1.}
                  else if shape.kind=="rectangle"{nx.abs()<=half_w&&ny.abs()<=half_h}
                  else {let mut inside=false;let mut j=points.len().saturating_sub(1);
                    for i in 0..points.len(){let a=points[i];let b=points[j];
                        let u=nx/half_w.max(1e-6);let v=ny/half_h.max(1e-6);
                        if (a[1]>v)!=(b[1]>v)&&u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0]{inside=!inside;}
                        j=i;
                    }inside};
                if inside {let pos=(y*width as usize+x)*4;
                    output[pos..pos+4].copy_from_slice(&[fill[0],fill[1],fill[2],255]);}
            }
        }
        // A distinct border is composed in the same native frame. The width
        // is normalized relative to the output, as in the authored shape model.
        if shape.stroke_width>0.{
            let border_px=(shape.stroke_width*width as f64).ceil().clamp(1.,24.) as usize;
            let base=output.clone();
            for y in 0..height as usize{for x in 0..width as usize{
                let pos=(y*width as usize+x)*4;
                if base[pos+3]==0{continue;}
                let mut edge=false;
                for (dx,dy) in [(-(border_px as i64),0),(border_px as i64,0),(0,-(border_px as i64)),(0,border_px as i64)]{
                    let xx=x as i64+dx;let yy=y as i64+dy;
                    if xx<0||yy<0||xx>=width as i64||yy>=height as i64||
                        base[(yy as usize*width as usize+xx as usize)*4+3]==0{edge=true;break;}
                }
                if edge{output[pos..pos+3].copy_from_slice(&stroke);}
            }}
        }
    }
    if clip.kind=="title"{
        let style=clip.text_style.as_ref();
        let font=system_font(style.and_then(|s|s.font_family.as_deref()).unwrap_or("Segoe UI"),
            style.and_then(|s|s.font_weight).unwrap_or(700),style.is_some_and(|s|s.italic))?;
        let mut size=style.and_then(|s|s.font_size).unwrap_or(54.).clamp(1.,400.) as f32;
        let color=rgb_from_hex(style.and_then(|s|s.color.as_deref()).unwrap_or("#ffffff"));
        let letter_spacing=style.and_then(|s|s.letter_spacing).unwrap_or(0.) as f32;
        let reveal=style.and_then(|s|s.reveal).map(|seconds|(time-clip.start).max(0.)/seconds);
        let lines:Vec<&str>=clip.title.lines().take(30).collect();
        // Text width is a project-relative fraction in the video authoring model.
        // Apply it to glyph metrics rather than ignoring it during native export.
        let maximum_width=style.and_then(|s|s.width).filter(|w|w.is_finite()&&*w>0.0)
            .map(|w|if w<=1.0{w*width as f64}else{w}).unwrap_or(width as f64*0.94)
            .clamp(1.0,width as f64);
        let widest=lines.iter().map(|line|line.chars().take(4096)
            .map(|c|font.metrics(c,size).advance_width as f64+letter_spacing as f64).sum::<f64>())
            .fold(0.0_f64,f64::max);
        if widest>maximum_width {size=(size as f64*maximum_width/widest).max(1.0) as f32;}
        let lineheight=size as f64*style.and_then(|s|s.line_height).unwrap_or(1.2);
        let initial_baseline=height as f64/2.-lineheight*(lines.len() as f64-1.)*0.5+size as f64*0.35;
        // Existing template backgrounds are an authored visual element; honor
        // them in the native frame instead of suppressing unused-field warnings.
        if let Some(background)=style.and_then(|s|s.background.as_deref())
            .filter(|c|c.len()==7&&c.starts_with('#')&&c[1..].bytes().all(|c|c.is_ascii_hexdigit())){
            let fill=rgb_from_hex(background);
            let padding=(size as f64*0.23).max(4.0);
            let rect_w=(maximum_width+2.0*padding).min(width as f64);
            let rect_h=(lineheight*lines.len() as f64+2.0*padding).min(height as f64);
            let left=((width as f64-rect_w)*0.5).max(0.0) as usize;
            let top=((height as f64-rect_h)*0.5).max(0.0) as usize;
            let right=((left as f64+rect_w).ceil() as usize).min(width as usize);
            let bottom=((top as f64+rect_h).ceil() as usize).min(height as usize);
            for y in top..bottom {for x in left..right {
                let pixel=(y*width as usize+x)*4;
                output[pixel..pixel+3].copy_from_slice(&fill);
                output[pixel+3]=255;
            }}
        }
        let mut visible=reveal.map(|v|((clip.title.chars().count() as f64)*v.clamp(0.,1.)).ceil() as usize).unwrap_or(usize::MAX);
        for (index,line) in lines.iter().enumerate(){
            let characters:Vec<char>=line.chars().take(4096).collect();
            let advance:f64=characters.iter().map(|c|font.metrics(*c,size).advance_width as f64+letter_spacing as f64).sum();
            let align=style.and_then(|s|s.align.as_deref()).unwrap_or("center");
            let mut pen_x=match align{"left"=>width as f64*0.075,"right"=>width as f64*0.925-advance,_=>(width as f64-advance)*0.5};
            let baseline=initial_baseline+index as f64*lineheight;
            for c in characters{
                if visible==0{break;} visible=visible.saturating_sub(1);
                let (metrics,bitmap)=font.rasterize(c,size);
                let top=(baseline-metrics.ymin as f64-metrics.height as f64).round() as i64;
                let left=(pen_x+metrics.xmin as f64).round() as i64;
                for gy in 0..metrics.height{for gx in 0..metrics.width{
                    let x=left+gx as i64;let y=top+gy as i64;
                    if x<0||y<0||x>=width as i64||y>=height as i64{continue;}
                    let pos=(y as usize*width as usize+x as usize)*4;
                    let alpha=bitmap[gy*metrics.width+gx] as f64/255.;
                    let old=output[pos+3] as f64/255.;let total=old+alpha*(1.-old);
                    if total>0.{for i in 0..3{output[pos+i]=((color[i] as f64*alpha+
                        output[pos+i] as f64*old*(1.-alpha))/total).round().clamp(0.,255.) as u8;}}
                    output[pos+3]=(total*255.).round().clamp(0.,255.) as u8;
                }}
                pen_x+=metrics.advance_width as f64+letter_spacing as f64;
            }
            visible=visible.saturating_sub(1);
        }
        // Draw a true-distance, alpha-aware text stroke after assembling the
        // glyph mask, using the same primitive as the native outline effect.
        // This does not stroke the rectangular video clip bounds.
        if let Some(stroke)=style.and_then(|s|s.stroke.as_deref()) {
            let stroke_width=style.and_then(|s|s.stroke_width).unwrap_or(0.);
            if stroke_width>0. {
                silhouette_outline::apply(&mut output,width,height,stroke_width.min(200.),stroke,&Value::Null)?;
            }
        }
    }
    Ok(output)
}

fn validate_plan(plan:&mut NativeTimelinePlan)->Result<(),String>{
    if plan.graph_version!=2 {return Err("Unsupported Huelith native timeline graph version".into());}
    stream::validate_stream(&mut plan.stream)?;
    if !plan.range_start.is_finite()||plan.range_start<0.||plan.range_start>21600. {
        return Err("Invalid native export start time".into());
    }
    if plan.clips.len()>4096 {return Err("Native export exceeds the timeline clip limit".into());}
    for clip in &mut plan.clips {
        let values=[clip.start,clip.duration,clip.source_in,clip.x,clip.y,clip.scale,clip.scale_y,
            clip.rotation,clip.opacity,clip.fade_in,clip.fade_out,
            clip.crop[0],clip.crop[1],clip.crop[2],clip.crop[3]];
        if !values.iter().all(|n|n.is_finite())||clip.id.is_empty()||clip.id.len()>128
            ||clip.start<0.||clip.duration<=0.||clip.duration>21600.||clip.source_in<0.
            ||clip.scale<=0.||clip.scale_y<=0.||clip.scale>32.||clip.scale_y>32.
            ||!(0. ..=1.).contains(&clip.opacity)||clip.fade_in<0.||clip.fade_out<0.
            ||clip.fade_in>clip.duration||clip.fade_out>clip.duration
            ||!(-10. ..=10.).contains(&clip.x)||!(-10. ..=10.).contains(&clip.y)
            ||!(0. ..=1.).contains(&clip.crop[0])||!(0. ..=1.).contains(&clip.crop[1])
            ||clip.crop[2]<=0.||clip.crop[3]<=0.
            ||clip.crop[0]+clip.crop[2]>1.000001||clip.crop[1]+clip.crop[3]>1.000001
            ||!matches!(clip.fit.as_str(),"fit"|"fill"|"stretch")
            ||!matches!(clip.kind.as_str(),"video"|"image"|"title"|"shape") {
            return Err(format!("Invalid native visual clip: {}",clip.id));
        }
        validate_clip_operations(clip)?;
        if matches!(clip.kind.as_str(),"video"|"image"){
            clip.path=validate_source_file(&clip.path)?.to_string_lossy().into_owned();
        }
    }
    Ok(())
}

#[cfg(windows)]
struct PixelSource {
    kind:PixelKind,
    previous_time:Option<f64>,
    previous:Arc<Vec<u8>>,
    width:u32,height:u32,
}
#[cfg(windows)]
enum PixelKind {
    Video(super::windows_mf::NativeFrameReader),
    Buffered(decode_ahead::DecodeAhead),
    Still,
}
#[cfg(windows)]
impl PixelSource {
    fn buffered(clip:&NativeVisualClip,start:f64,fps:u32,count:u32,cancelled:Arc<AtomicBool>)->Result<Self,String>{
        Ok(Self{kind:PixelKind::Buffered(decode_ahead::DecodeAhead::new(clip.clone(),start,fps,count,cancelled)?),
            previous_time:None,previous:Arc::new(Vec::new()),width:0,height:0})
    }
    fn open(clip:&NativeVisualClip)->Result<Self,String>{
        if clip.kind=="video" {
            return Ok(Self{kind:PixelKind::Video(super::windows_mf::NativeFrameReader::open(&PathBuf::from(&clip.path))?),
                previous_time:None,previous:Arc::new(Vec::new()),width:0,height:0});
        }
        let reader=image::ImageReader::open(&clip.path).map_err(|e|format!("Cannot open still image {}: {e}",clip.path))?
            .with_guessed_format().map_err(|e|format!("Cannot inspect still image {}: {e}",clip.path))?;
        let (width,height)=reader.into_dimensions().map_err(|e|format!("Cannot read still image dimensions: {e}"))?;
        if width==0||height==0||width>8192||height>8192{return Err("Image exceeds native render limits".into());}
        let img=image::open(&clip.path).map_err(|e|format!("Cannot decode native still image {}: {e}",clip.path))?.to_rgba8();
        Ok(Self{kind:PixelKind::Still,previous_time:Some(0.),previous:Arc::new(img.into_raw()),width,height})
    }
    fn frame(&mut self,time:f64)->Result<(&[u8],u32,u32),String>{
        match &mut self.kind {
            PixelKind::Still=>{},
            PixelKind::Buffered(reader)=>{
                if self.previous_time.is_none_or(|t|(time-t).abs()>0.000001){
                    let (pixels,w,h)=reader.frame_at(time)?;
                    if w==0||h==0||w>3840||h>2160||pixels.len()!=w as usize*h as usize*4{
                        return Err("Source lookahead returned invalid frame dimensions".into());
                    }
                    self.width=w;self.height=h;self.previous=pixels;self.previous_time=Some(time);
                }
            }
            PixelKind::Video(reader)=>{
                if self.previous_time.is_none_or(|t|(time-t).abs()>0.000001){
                    let (pixels,w,h)=reader.frame_at(time)?;
                    if w==0||h==0||w>3840||h>2160||pixels.len()!=w as usize*h as usize*4{
                        return Err("Native decoder returned invalid frame dimensions".into());
                    }
                    self.width=w;self.height=h;self.previous=pixels;self.previous_time=Some(time);
                }
            }
        }
        Ok((&self.previous,self.width,self.height))
    }
    fn shared_frame(&mut self,time:f64)->Result<(Arc<Vec<u8>>,u32,u32),String>{
        self.frame(time)?;Ok((Arc::clone(&self.previous),self.width,self.height))
    }
}

/// A preview plan uses the same validated clips and compositor as MP4 export,
/// without constructing a stream writer or downloading pixels from a WebView.
#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct NativePreviewPlan {
    graph_version:u32,
    width:u32,height:u32,fps:u32,background:[u8;3],clips:Vec<NativeVisualClip>,
}
fn validate_preview(plan:&mut NativePreviewPlan)->Result<(),String>{
    if plan.graph_version!=2 {return Err("Unsupported Huelith native preview graph version".into());}
    if plan.width==0||plan.height==0||plan.width>3840||plan.height>2160
        ||plan.width as u64*plan.height as u64>8_294_400
        ||plan.fps==0||plan.fps>120||plan.clips.len()>4096 {
        return Err("Invalid native timeline preview resolution, rate, or clip count".into());
    }
    // Reuse export's source and geometry validation rather than trusting IPC.
    // No file output is opened by this command.
    for clip in &mut plan.clips {
        let fields=[clip.start,clip.duration,clip.source_in,clip.x,clip.y,clip.scale,clip.scale_y,
          clip.rotation,clip.opacity,clip.fade_in,clip.fade_out,
          clip.crop[0],clip.crop[1],clip.crop[2],clip.crop[3]];
        if clip.id.is_empty()||clip.id.len()>128||!fields.iter().all(|n|n.is_finite())
          ||clip.start<0.||clip.duration<=0.||clip.duration>21600.||clip.source_in<0.
          ||clip.scale<=0.||clip.scale_y<=0.||clip.scale>32.||clip.scale_y>32.
          ||!(0. ..=1.).contains(&clip.opacity)||clip.fade_in<0.||clip.fade_out<0.
          ||clip.fade_in>clip.duration||clip.fade_out>clip.duration
          ||!(-10. ..=10.).contains(&clip.x)||!(-10. ..=10.).contains(&clip.y)
          ||!(0. ..=1.).contains(&clip.crop[0])||!(0. ..=1.).contains(&clip.crop[1])
          ||clip.crop[2]<=0.||clip.crop[3]<=0.
          ||clip.crop[0]+clip.crop[2]>1.000001||clip.crop[1]+clip.crop[3]>1.000001
          ||!matches!(clip.fit.as_str(),"fit"|"fill"|"stretch")
          ||!matches!(clip.kind.as_str(),"video"|"image"|"title"|"shape") {
            return Err(format!("Invalid native preview clip: {}",clip.id));
        }
        validate_clip_operations(clip)?;
        if matches!(clip.kind.as_str(),"video"|"image"){
            clip.path=validate_source_file(&clip.path)?.to_string_lossy().into_owned();
        }
    }
    Ok(())
}

#[cfg(windows)]
struct NativePreviewSession {
    plan:NativePreviewPlan,
    sources:HashMap<String,PixelSource>,
    synthetic:HashMap<String,Vec<u8>>,
}
#[cfg(windows)]
impl NativePreviewSession {
    fn new(plan:NativePreviewPlan)->Self{Self{plan,sources:HashMap::new(),synthetic:HashMap::new()}}
    fn render(&mut self,time:f64)->Result<Vec<u8>,String>{
        if !time.is_finite()||time<0.||time>21600. {return Err("Invalid native preview timestamp".into());}
        let plan=&self.plan;
        let mut output=vec![0u8;plan.width as usize*plan.height as usize*4];
        for pixel in output.chunks_exact_mut(4){pixel.copy_from_slice(&[plan.background[0],plan.background[1],plan.background[2],255]);}
        for clip in &plan.clips {
            if !active_at(clip,time){continue;}
            if matches!(clip.kind.as_str(),"title"|"shape") {
                let dynamic=clip.text_style.as_ref().and_then(|s|s.reveal).is_some() ||
                    clip.effects.iter().any(|effect|!effect.keyframes.is_empty());
                if dynamic||!self.synthetic.contains_key(&clip.id){
                    let mut pixels=render_synthetic(clip,plan.width,plan.height,time)?;
                    color_effects(&mut pixels,plan.width,plan.height,clip,time-clip.start)?;
                    self.synthetic.insert(clip.id.clone(),pixels);
                }
                let pixels=self.synthetic.get(&clip.id).ok_or("Native title cache missing")?;
                if authored_transition::needs_treatment(clip,time){
                    let mut working=pixels.to_vec();
                    authored_transition::treat_frame(clip,time,&mut working,plan.width,plan.height);
                    composite_layer(&mut output,plan.width,plan.height,&working,plan.width,plan.height,clip,time);
                }else{composite_layer(&mut output,plan.width,plan.height,pixels,plan.width,plan.height,clip,time);}
                continue;
            }
            if !self.sources.contains_key(&clip.id){self.sources.insert(clip.id.clone(),PixelSource::open(clip)?);}
            let source=self.sources.get_mut(&clip.id).ok_or("Native preview source disappeared")?;
            let (frame,width,height)=source.frame(source_time(clip,(time-clip.start).clamp(0.,(clip.duration-0.00001).max(0.))))?;
            let treatment=authored_transition::needs_treatment(clip,time);
            if clip.effects.is_empty()&&clip.grade.is_none()&&clip.chroma_key.is_none()&&!treatment{
                composite_layer(&mut output,plan.width,plan.height,frame,width,height,clip,time);
            }else{
                let mut pixels=frame.to_vec();color_effects(&mut pixels,width,height,clip,time-clip.start)?;
                if treatment{authored_transition::treat_frame(clip,time,&mut pixels,width,height);}
                composite_layer(&mut output,plan.width,plan.height,&pixels,width,height,clip,time);
            }
        }
        // A frame scrub can move in either direction; retain only readers
        // that still correspond to clips in the current, immutable session.
        Ok(output)
    }
}

#[cfg(windows)]
enum NativePreviewRequest {
    Frame{time:f64,reply:mpsc::Sender<Result<Vec<u8>,String>>},
    Stop,
}
#[cfg(windows)]
#[derive(Default)]
pub struct NativeTimelinePreviews(Mutex<HashMap<String,mpsc::Sender<NativePreviewRequest>>>);
#[cfg(not(windows))]
#[derive(Default)]
pub struct NativeTimelinePreviews;

#[tauri::command]
pub async fn media_open_native_preview(preview_id:String,mut plan:NativePreviewPlan,
    state:tauri::State<'_,NativeTimelinePreviews>)->Result<(),String>{
    if preview_id.is_empty()||preview_id.len()>128{return Err("Invalid preview identifier".into());}
    validate_preview(&mut plan)?;
    #[cfg(windows)] {
        let mut sessions=state.0.lock().map_err(|_|"Native preview registry unavailable")?;
        if sessions.len()>=8{return Err("Too many native preview sessions".into());}
        if sessions.contains_key(&preview_id){return Err("Duplicate native preview session".into());}
        // Each reader is created, used, and released on ONE dedicated
        // Media Foundation thread; never transfer an apartment-bound COM
        // decoder between unrelated Tokio worker threads.
        let (tx,rx)=mpsc::channel::<NativePreviewRequest>();
        std::thread::Builder::new().name("huelith-native-preview".into()).spawn(move||{
            let mut session=NativePreviewSession::new(plan);
            while let Ok(request)=rx.recv(){
                match request {
                    NativePreviewRequest::Frame{time,reply}=>{let _=reply.send(session.render(time));}
                    NativePreviewRequest::Stop=>break,
                }
            }
        }).map_err(|e|format!("Cannot start native preview worker: {e}"))?;
        sessions.insert(preview_id,tx);
        return Ok(());
    }
    #[cfg(not(windows))] {let _=(preview_id,plan,state);Err("Native preview requires Windows".into())}
}

#[tauri::command]
pub async fn media_read_native_preview(preview_id:String,time:f64,
    state:tauri::State<'_,NativeTimelinePreviews>)->Result<tauri::ipc::Response,String>{
    if !time.is_finite()||time<0.||time>21600. {return Err("Invalid native preview timestamp".into());}
    #[cfg(windows)] {
        let sender={let sessions=state.0.lock().map_err(|_|"Native preview registry unavailable")?;
            sessions.get(&preview_id).cloned().ok_or("Native preview session has closed")?};
        let bytes=tauri::async_runtime::spawn_blocking(move||{
            let (reply_tx,reply_rx)=mpsc::channel();
            sender.send(NativePreviewRequest::Frame{time,reply:reply_tx})
              .map_err(|_|"Native preview worker disconnected".to_string())?;
            reply_rx.recv_timeout(Duration::from_secs(45))
              .map_err(|_|"Native preview worker timed out".to_string())?
        }).await.map_err(|e|e.to_string())??;
        return Ok(tauri::ipc::Response::new(bytes));
    }
    #[cfg(not(windows))] {let _=(preview_id,state);Err("Native preview requires Windows".into())}
}

#[tauri::command]
pub fn media_close_native_preview(preview_id:String,
    state:tauri::State<'_,NativeTimelinePreviews>)->Result<(),String>{
    #[cfg(windows)] {
        let session=state.0.lock().map_err(|_|"Native preview registry unavailable")?.remove(&preview_id);
        if let Some(tx)=session{let _=tx.send(NativePreviewRequest::Stop);}
        return Ok(());
    }
    #[cfg(not(windows))] {let _=(preview_id,state);Err("Native preview requires Windows".into())}
}

/// One-off screenshot/thumbnail uses the same source reader and Rust compositor
/// as native MP4 export and persistent native editor preview.
#[tauri::command]
pub async fn media_render_native_png(mut plan:NativePreviewPlan,time:f64)->Result<tauri::ipc::Response,String>{
    validate_preview(&mut plan)?;
    if !time.is_finite()||time<0.||time>21600. {return Err("Invalid native PNG timestamp".into());}
    #[cfg(windows)] {
        let bytes=tauri::async_runtime::spawn_blocking(move||{
            use image::ImageEncoder;
            let width=plan.width;let height=plan.height;
            let pixels=NativePreviewSession::new(plan).render(time)?;
            let mut output=Vec::new();
            image::codecs::png::PngEncoder::new(&mut output)
              .write_image(&pixels,width,height,image::ColorType::Rgba8.into())
              .map_err(|e|format!("Native PNG compression failed: {e}"))?;
            Ok::<_,String>(output)
        }).await.map_err(|e|e.to_string())??;
        return Ok(tauri::ipc::Response::new(bytes));
    }
    #[cfg(not(windows))] {let _=(plan,time);Err("Native frame export requires Windows".into())}
}

fn opacity(clip:&NativeVisualClip,time:f64)->f64{
    let local=(time-clip.start).clamp(0.,clip.duration);
    let enter=if clip.fade_in>0.&&clip.cut_in.is_none(){(local/clip.fade_in).min(1.)}else{1.};
    let leave=if clip.fade_out>0.&&clip.cut_out.is_none(){((clip.duration-local)/clip.fade_out).min(1.)}else{1.};
    let mut factor=1.;
    if let Some(cut)=&clip.cut_in{
        if cut.kind!="effect"{factor*=((time-cut.start)/(cut.end-cut.start)).clamp(0.,1.);}
    }
    if let Some(cut)=&clip.cut_out{
        if cut.kind!="effect"{factor*=(1.-(time-cut.start)/(cut.end-cut.start)).clamp(0.,1.);}
    }
    (transform_at(clip,local).opacity*enter*leave*transition_opacity(clip,local)*factor).clamp(0.,1.)
}

/// Alpha-correct source-over blend onto the opaque MP4 output framebuffer.
fn blend_rgba_pixel(dst:&mut [u8],src:[u8;4],opacity:f64){
    let a=(src[3] as f64/255.*opacity).clamp(0.,1.);
    if a>=1.-1e-8 {dst.copy_from_slice(&[src[0],src[1],src[2],255]);return;}
    if a<=0. {return;}
    let inv=1.-a;
    for i in 0..3 {dst[i]=(src[i] as f64*a+dst[i] as f64*inv).round().clamp(0.,255.) as u8;}
    dst[3]=255;
}

/// Bilinear RGBA sampler for non-unity transforms and image scaling.
fn sample_rgba(frame:&[u8],w:u32,h:u32,x:f64,y:f64)->[u8;4]{
    let x=x.clamp(0.,(w-1) as f64);let y=y.clamp(0.,(h-1) as f64);
    let x0=x.floor() as usize;let y0=y.floor() as usize;
    let x1=(x0+1).min(w as usize-1);let y1=(y0+1).min(h as usize-1);
    let tx=x-x0 as f64;let ty=y-y0 as f64;
    let pixel=|px:usize,py:usize,c:usize|frame[(py*w as usize+px)*4+c] as f64;
    let mut result=[0;4];
    for c in 0..4{
        let upper=pixel(x0,y0,c)*(1.-tx)+pixel(x1,y0,c)*tx;
        let lower=pixel(x0,y1,c)*(1.-tx)+pixel(x1,y1,c)*tx;
        result[c]=(upper*(1.-ty)+lower*ty).round().clamp(0.,255.) as u8;
    }
    result
}

/// A native CPU compositor for basic video/image clip geometry. Unsupported
/// dynamic timeline features are REJECTED by frontend gate, never skipped.
fn composite_layer(output:&mut [u8],out_w:u32,out_h:u32,source:&[u8],src_w:u32,src_h:u32,
    clip:&NativeVisualClip,time:f64){
    let alpha=opacity(clip,time);
    if alpha<=0. {return;}
    let mut transform=transform_at(clip,time-clip.start);
    authored_transition::motion(clip,time,&mut transform);
    let (crop_x,crop_y,crop_w,crop_h)=(clip.crop[0],clip.crop[1],clip.crop[2],clip.crop[3]);
    let (cropped_w,cropped_h)=(src_w as f64*crop_w,src_h as f64*crop_h);
    let (fitted_w,fitted_h)=match clip.fit.as_str(){
        "stretch"=>(out_w as f64,out_h as f64),
        "fill"=>{let factor=(out_w as f64/cropped_w).max(out_h as f64/cropped_h);(cropped_w*factor,cropped_h*factor)},
        _=>{let factor=(out_w as f64/cropped_w).min(out_h as f64/cropped_h);(cropped_w*factor,cropped_h*factor)},
    };
    let dw=fitted_w*transform.scale;let dh=fitted_h*transform.scale_y;
    if dw<=0.||dh<=0.{return;}
    let cx=out_w as f64*(0.5+transform.x);let cy=out_h as f64*(0.5+transform.y);
    let (sin,cos)=transform.rotation.to_radians().sin_cos();
    // Fast path: lossless direct copy for 1:1, untransformed opaque video.
    if alpha>=1.&&transform.x==0.&&transform.y==0.&&transform.rotation==0.
      &&transform.scale==1.&&transform.scale_y==1.
      &&clip.mask.is_none()&&clip.transition_in.is_none()&&clip.transition_out.is_none()
      &&clip.cut_in.is_none()&&clip.cut_out.is_none()
      &&matches!(clip.blend_mode.as_str(),""|"source-over")
      &&!clip.flip_x&&!clip.flip_y&&clip.fit=="fit"&&src_w==out_w&&src_h==out_h
      &&clip.crop==[0.,0.,1.,1.]&&(clip.kind=="video"||source.chunks_exact(4).all(|p|p[3]==255)){
        output.copy_from_slice(source);return;
    }
    let half_x=(dw*cos.abs()+dh*sin.abs())/2.;
    let half_y=(dw*sin.abs()+dh*cos.abs())/2.;
    let min_x=((cx-half_x).floor() as i64).clamp(0,out_w as i64) as usize;
    let max_x=((cx+half_x).ceil() as i64).clamp(0,out_w as i64) as usize;
    let min_y=((cy-half_y).floor() as i64).clamp(0,out_h as i64) as usize;
    let max_y=((cy+half_y).ceil() as i64).clamp(0,out_h as i64) as usize;
    for y in min_y..max_y{
        for x in min_x..max_x{
            let dx=x as f64+0.5-cx;let dy=y as f64+0.5-cy;
            let mut u=( cos*dx+sin*dy)/dw+0.5;
            let mut v=(-sin*dx+cos*dy)/dh+0.5;
            if clip.flip_x{u=1.-u;}if clip.flip_y{v=1.-v;}
            if !(0. ..1.).contains(&u)||!(0. ..1.).contains(&v){continue;}
            let src_x=src_w as f64*(crop_x+u*crop_w)-0.5;
            let src_y=src_h as f64*(crop_y+v*crop_h)-0.5;
            let mut sample=sample_rgba(source,src_w,src_h,src_x,src_y);
            authored_transition::tint(clip,time,&mut sample);
            let luma=(sample[0] as f64*0.2126+sample[1] as f64*0.7152+sample[2] as f64*0.0722)/255.;
            let coverage=transition_coverage(clip,time-clip.start,
                (x as f64+0.5)/out_w as f64,(y as f64+0.5)/out_h as f64,luma)*
                clip.mask.as_ref().map(|mask|mask_coverage(mask,(x as f64+0.5)/out_w as f64,
                  (y as f64+0.5)/out_h as f64)).unwrap_or(1.);
            if coverage<=0.{continue;}
            let dst=&mut output[(y*out_w as usize+x)*4..(y*out_w as usize+x+1)*4];
            if matches!(clip.blend_mode.as_str(),""|"source-over"){
                blend_rgba_pixel(dst,sample,alpha*coverage);
            }else{blend_pixel_mode(dst,sample,alpha*coverage,&clip.blend_mode);}
        }
    }
}

fn gpu_clip_supported(clip:&NativeVisualClip,time:f64)->bool{
    let local=time-clip.start;
    clip.mask.is_none()&&matches!(clip.blend_mode.as_str(),""|"source-over")&&
        !clip.transition_in.as_ref().is_some_and(|t|local<t.duration&&!matches!(t.kind.as_str(),"cross-dissolve"|"effect"))&&
        !clip.transition_out.as_ref().is_some_and(|t|local>clip.duration-t.duration&&!matches!(t.kind.as_str(),"cross-dissolve"|"effect"))&&
        !clip.cut_in.as_ref().is_some_and(|t|time>=t.start&&time<t.end&&!matches!(t.kind.as_str(),"cross-dissolve"|"effect"))&&
        !clip.cut_out.as_ref().is_some_and(|t|time>=t.start&&time<t.end&&!matches!(t.kind.as_str(),"cross-dissolve"|"effect"))&&
        authored_transition::gpu_coverage(clip,time).is_some()
}

fn gpu_geometry(clip:&NativeVisualClip,time:f64,width:u32,height:u32,sw:u32,sh:u32)->[f32;20]{
    let mut transform=transform_at(clip,time-clip.start);
    authored_transition::motion(clip,time,&mut transform);
    let (cw,ch)=(sw as f64*clip.crop[2],sh as f64*clip.crop[3]);
    let factor=if clip.fit=="fill"{(width as f64/cw).max(height as f64/ch)}else{(width as f64/cw).min(height as f64/ch)};
    let (x,y)=if clip.fit=="stretch"{(1.,1.)}else{(cw*factor/width as f64,ch*factor/height as f64)};
    let (sin,cos)=transform.rotation.to_radians().sin_cos();
    [transform.x as f32,transform.y as f32,(x*transform.scale*if clip.flip_x{-1.}else{1.}) as f32,
        (y*transform.scale_y*if clip.flip_y{-1.}else{1.}) as f32,
        cos as f32,-sin as f32,(opacity(clip,time)*authored_transition::gpu_coverage(clip,time).unwrap_or(1.)) as f32,width as f32/height as f32,
        clip.crop[0] as f32,clip.crop[1] as f32,clip.crop[2] as f32,clip.crop[3] as f32,
        0.,0.,1.,1.,0.,0.,x as f32,y as f32]
}

#[cfg(windows)]
fn gpu_frame(renderer:&mut retained_gpu::Renderer,clips:&[NativeVisualClip],sources:&mut HashMap<String,PixelSource>,
    synthetic:&mut HashMap<String,Arc<Vec<u8>>>,time:f64,width:u32,height:u32,background:[u8;3])
    ->Result<(Vec<u8>,f64,f64),String>{
    let mut layers=Vec::new();let mut source_ms=0.;let mut compose_ms=0.;
    for clip in clips.iter().filter(|c|active_at(c,time)){
        let start=Instant::now();let local=time-clip.start;
        let (mut pixels,sw,sh)=if matches!(clip.kind.as_str(),"title"|"shape"){
            let dynamic=clip.text_style.as_ref().and_then(|s|s.reveal).is_some()||clip.effects.iter().any(|e|!e.keyframes.is_empty());
            if dynamic||!synthetic.contains_key(&clip.id){
                let mut raster=render_synthetic(clip,width,height,time)?;
                color_effects(&mut raster,width,height,clip,local)?;
                synthetic.insert(clip.id.clone(),Arc::new(raster));
            }
            (Arc::clone(&synthetic[&clip.id]),width,height)
        }else{
            if !sources.contains_key(&clip.id){sources.insert(clip.id.clone(),PixelSource::open(clip)?);}
            sources.get_mut(&clip.id).unwrap().shared_frame(source_time(clip,local.clamp(0.,(clip.duration-0.00001).max(0.))))?
        };
        source_ms+=start.elapsed().as_secs_f64()*1000.;let start=Instant::now();
        let graphics=matches!(clip.kind.as_str(),"title"|"shape");
        let mut transform=transform_at(clip,local);
        authored_transition::motion(clip,time,&mut transform);
        let filter=if !graphics&&clip.effects.len()==1&&clip.effects[0].kind=="video-filter"&&clip.effects[0].mask.is_none()
            &&clip.effects[0].keyframes.iter().all(|k|k.parameter=="amount")&&clip.grade.is_none()&&clip.chroma_key.is_none()
            &&sw==width&&sh==height&&clip.crop==[0.,0.,1.,1.]&&transform.scale==1.&&transform.scale_y==1.&&transform.rotation==0.
            &&(transform.x*width as f64).fract().abs()<1e-6&&(transform.y*height as f64).fract().abs()<1e-6{
            let effect=&clip.effects[0];let (key,cube)=filter_lut::gpu_cube(&effect.parameters)?;
            Some(retained_gpu::Filter{key,cube,strength:(keyed_value(&effect.keyframes,"amount",local,effect.amount)/100.).clamp(0.,1.) as f32})
        }else{None};
        if !graphics&&filter.is_none()&&(!clip.effects.is_empty()||clip.grade.is_some()||clip.chroma_key.is_some()){
            color_effects(Arc::make_mut(&mut pixels).as_mut_slice(),sw,sh,clip,local)?;
        }
        layers.push(retained_gpu::Layer{id:clip.id.clone(),width:sw,height:sh,pixels,filter,
            geometry:gpu_geometry(clip,time,width,height,sw,sh)});
        compose_ms+=start.elapsed().as_secs_f64()*1000.;
    }
    let begun=Instant::now();let output=renderer.render(&layers,background)?;
    Ok((output,source_ms,compose_ms+begun.elapsed().as_secs_f64()*1000.))
}

#[cfg(windows)]
fn render_plan(plan:NativeTimelinePlan,cancelled:Arc<AtomicBool>,job_id:String,
    progress:impl Fn(NativeTimelineProgress))->Result<ExportReport,String>{
    use std::sync::atomic::Ordering::Relaxed;
    let mut sources:HashMap<String,PixelSource>=HashMap::new();
    let mut synthetic:HashMap<String,Arc<Vec<u8>>>=HashMap::new();
    // Open source readers ONLY when they become visible. Long projects can
    // have hundreds of sequential clips; pre-opening them exhausts decoder
    // memory and prevents a fast native timeline export from starting.
    let destination=validate_output_path(None,&plan.stream.output_path)?;
    let config=plan.stream;
    let mut gpu=if std::env::var("HUELITH_VIDEO_COMPOSITOR").is_ok_and(|v|v=="reference"){None}
        else{match retained_gpu::Renderer::new(config.width,config.height){
            Ok(renderer)=>{eprintln!("Huelith export GPU: {}",renderer.adapter);Some(renderer)},
            Err(error)=>{eprintln!("Huelith uses its reference compositor: {error}");None}
        }};
    const GPU_BACKEND:&str="Native GPU composition + Media Foundation";
    const REFERENCE_BACKEND:&str="Native Windows Media Foundation + Rust compositor";
    let mut gpu_frames=0u32;let mut reference_frames=0u32;
    let writer_config=config.clone();let writer_dest=destination.clone();
    let (tx,rx)=mpsc::sync_channel::<ExportPacket>(3);
    let (ready_tx,ready_rx)=mpsc::channel();
    let writer_cancel=cancelled.clone();
    let writer=std::thread::spawn(move||super::windows_mf::stream_export(&writer_dest,&writer_config,rx,writer_cancel,ready_tx));
    let mut completed=0u32;
    let start=Instant::now();
    let mut pending:VecDeque<(u32,mpsc::Receiver<Result<stream::NativeFrameStages,String>>,f64,f64,Instant,&'static str)>=VecDeque::new();
    let mut last_report=Instant::now()-Duration::from_secs(1);
    let outcome=(||->Result<ExportReport,String>{
        ready_rx.recv_timeout(Duration::from_secs(60)).map_err(|_|"Native H.264 encoder startup timed out".to_string())??;
        // A long seek/first-frame decode is not a completed video frame. Tell
        // the frontend that native initialization succeeded before decoding.
        progress(NativeTimelineProgress{
            job_id:job_id.clone(),completed:0,total:config.frame_count,
            source_ms:0.,composite_ms:0.,encode_ms:0.,
            backend:"Native decoder ready — preparing first frame",native:stream::NativeFrameStages::default(),
        });
        for index in 0..config.frame_count {
            if cancelled.load(Relaxed){return Err("Native export cancelled".into());}
            let timestamp=plan.range_start+index as f64/config.fps as f64;
            // Warm the next cut's reader before it is visible. Four workers
            // maximum, one queued frame each; long timelines do not create a
            // decoder for every clip or retain a whole video in memory.
            for clip in plan.clips.iter().filter(|c|c.kind=="video"){
                let enter=clip.cut_in.as_ref().map_or(clip.start,|c|c.start.min(clip.start));
                let leave=clip.cut_out.as_ref().map_or(clip.start+clip.duration,|c|c.end.max(clip.start+clip.duration));
                if sources.len()>=4{break;}
                if enter<=timestamp+0.25&&leave>timestamp&&!sources.contains_key(&clip.id){
                    sources.insert(clip.id.clone(),PixelSource::buffered(clip,plan.range_start,config.fps,config.frame_count,Arc::clone(&cancelled))?);
                }
            }
            let eligible=gpu.is_some()&&plan.clips.iter().filter(|c|active_at(c,timestamp)).all(|c|gpu_clip_supported(c,timestamp));
            let rendered=if eligible{
                match gpu_frame(gpu.as_mut().unwrap(),&plan.clips,&mut sources,&mut synthetic,timestamp,config.width,config.height,plan.background){
                    Ok(frame)=>Some(frame),
                    Err(error)=>{eprintln!("Huelith continues with the reference compositor: {error}");gpu=None;None}
                }
            }else{None};
            let use_gpu=rendered.is_some();
            if use_gpu{gpu_frames+=1;}else{reference_frames+=1;}
            let backend=if use_gpu{GPU_BACKEND}else{REFERENCE_BACKEND};
            let (mut output,mut source_ms,mut composite_ms)=rendered.unwrap_or_else(||
                (vec![0u8;config.width as usize*config.height as usize*4],0.,0.));
            if !use_gpu {
            for pixel in output.chunks_exact_mut(4){pixel.copy_from_slice(&[plan.background[0],plan.background[1],plan.background[2],255]);}
            for clip in &plan.clips {
                if !active_at(clip,timestamp){continue;}
                let local_time=timestamp-clip.start;
                let source_started=Instant::now();
                if matches!(clip.kind.as_str(),"title"|"shape") {
                    let dynamic=clip.text_style.as_ref().and_then(|s|s.reveal).is_some() ||
                        clip.effects.iter().any(|effect|!effect.keyframes.is_empty());
                    if dynamic||!synthetic.contains_key(&clip.id){
                        let mut rgba=render_synthetic(clip,config.width,config.height,timestamp)?;
                        color_effects(&mut rgba,config.width,config.height,clip,timestamp-clip.start)?;
                        synthetic.insert(clip.id.clone(),Arc::new(rgba));
                    }
                    source_ms+=source_started.elapsed().as_secs_f64()*1000.;
                    let composite_started=Instant::now();
                    let rgba=synthetic.get(&clip.id).ok_or("Native graphics cache missing")?;
                    if authored_transition::needs_treatment(clip,timestamp){
                        let mut working=rgba.to_vec();
                        authored_transition::treat_frame(clip,timestamp,&mut working,config.width,config.height);
                        composite_layer(&mut output,config.width,config.height,&working,config.width,config.height,clip,timestamp);
                    }else{composite_layer(&mut output,config.width,config.height,rgba,config.width,config.height,clip,timestamp);}
                    composite_ms+=composite_started.elapsed().as_secs_f64()*1000.;
                    continue;
                }
                if !sources.contains_key(&clip.id) {
                    sources.insert(clip.id.clone(),PixelSource::open(clip)?);
                }
                let source=sources.get_mut(&clip.id).ok_or("Native source disappeared")?;
                let (frame,width,height)=source.frame(source_time(clip,local_time.clamp(0.,(clip.duration-0.00001).max(0.))))?;
                source_ms+=source_started.elapsed().as_secs_f64()*1000.;
                let composite_started=Instant::now();
                let treatment=authored_transition::needs_treatment(clip,timestamp);
                if clip.effects.is_empty()&&clip.grade.is_none()&&clip.chroma_key.is_none()&&!treatment{
                    composite_layer(&mut output,config.width,config.height,frame,width,height,clip,timestamp);
                }else{
                    let mut rgba=frame.to_vec();color_effects(&mut rgba,width,height,clip,local_time)?;
                    if treatment{authored_transition::treat_frame(clip,timestamp,&mut rgba,width,height);}
                    composite_layer(&mut output,config.width,config.height,&rgba,width,height,clip,timestamp);
                }
                composite_ms+=composite_started.elapsed().as_secs_f64()*1000.;
            }
            }
            // Reclaim decoders from clips that finished. Prune once per second
            // rather than scanning the entire timeline for every output frame.
            if index%config.fps==0 {
                sources.retain(|id,_|plan.clips.iter().any(|clip|clip.id==*id &&
                    clip.cut_out.as_ref().map_or(clip.start+clip.duration,|cut|cut.end)>timestamp));
                synthetic.retain(|id,_|plan.clips.iter().any(|clip|clip.id==*id && clip.start+clip.duration>timestamp));
            }
            let (reply_tx,reply_rx)=mpsc::channel();
            tx.send(ExportPacket::Frame{index,rgba:output,ack:reply_tx})
                .map_err(|_|"Native H.264 encoder stopped accepting frames".to_string())?;
            pending.push_back((index,reply_rx,source_ms,composite_ms,Instant::now(),backend));
            // A bounded three-frame queue overlaps source decoding with the
            // encoder; completions remain strictly ordered and verified.
            if pending.len()>=3 {
                let (i,reply,decode,compose,submitted,frame_backend)=pending.pop_front().unwrap();
                let stages=reply.recv_timeout(Duration::from_secs(120))
                    .map_err(|_|"Native encoder frame timed out".to_string())??;
                completed=i+1;
                if last_report.elapsed()>=Duration::from_millis(100) {
                    progress(NativeTimelineProgress{
                        job_id:job_id.clone(),completed,total:config.frame_count,source_ms:decode,
                        composite_ms:compose,encode_ms:submitted.elapsed().as_secs_f64()*1000.,
                        backend:frame_backend,native:stages});
                    last_report=Instant::now();
                }
            }
        }
        while let Some((i,reply,decode,compose,submitted,frame_backend))=pending.pop_front(){
            if cancelled.load(Relaxed){return Err("Native export cancelled".into());}
            let stages=reply.recv_timeout(Duration::from_secs(120)).map_err(|_|"Native encoder frame timed out".to_string())??;
            completed=i+1;
            progress(NativeTimelineProgress{
                job_id:job_id.clone(),completed,total:config.frame_count,source_ms:decode,
                composite_ms:compose,encode_ms:submitted.elapsed().as_secs_f64()*1000.,
                backend:frame_backend,native:stages});
        }
        let (finish_tx,finish_rx)=mpsc::channel();
        tx.send(ExportPacket::Finish(finish_tx)).map_err(|_|"Native H.264 encoder stopped before finalizing".to_string())?;
        let mut report=finish_rx.recv_timeout(Duration::from_secs(300)).map_err(|_|"Native export finalization timed out".to_string())??;
        report.elapsed_ms=start.elapsed().as_millis();
        report.backend=if gpu_frames==0{REFERENCE_BACKEND}else if reference_frames==0{GPU_BACKEND}
            else{"Native GPU + reference composition + Media Foundation"};
        Ok(report)
    })();
    if outcome.is_err(){cancelled.store(true,Relaxed);let _=tx.try_send(ExportPacket::Cancel);}
    drop(tx);
    let _=writer.join();
    if outcome.is_ok()&&completed!=config.frame_count {return Err("Native export finished without acknowledging every frame".into());}
    outcome
}

#[tauri::command]
pub async fn media_export_native_timeline(app:AppHandle,job_id:String,mut plan:NativeTimelinePlan,
    state:tauri::State<'_,NativeTimelineJobs>)->Result<ExportReport,String>{
    if job_id.is_empty()||job_id.len()>128 {return Err("Invalid native export job identifier".into());}
    validate_plan(&mut plan)?;
    let cancelled=Arc::new(AtomicBool::new(false));
    {
        let mut jobs=state.0.lock().map_err(|_|"Native render job registry unavailable")?;
        if jobs.len()>=2{return Err("Too many native timeline exports running".into());}
        if jobs.contains_key(&job_id){return Err("Duplicate native export identifier".into());}
        jobs.insert(job_id.clone(),cancelled.clone());
    }
    #[cfg(windows)]
    let result=match tauri::async_runtime::spawn_blocking({let app=app.clone();let job_id=job_id.clone();
        move||render_plan(plan,cancelled,job_id,|p|{let _=app.emit("huelith-native-timeline-progress",p);})
    }).await {Ok(result)=>result,Err(e)=>Err(e.to_string())};
    #[cfg(not(windows))]
    let result:Result<ExportReport,String>={let _=(plan,cancelled,app);Err("Native-only video exporting requires Windows".into())};
    state.0.lock().map_err(|_|"Native render job registry unavailable")?.remove(&job_id);
    result
}

#[tauri::command]
pub fn media_cancel_native_timeline(job_id:String,state:tauri::State<'_,NativeTimelineJobs>)->Result<bool,String>{
    let jobs=state.0.lock().map_err(|_|"Native render job registry unavailable")?;
    if let Some(cancel)=jobs.get(&job_id){cancel.store(true,Ordering::Relaxed);Ok(true)}else{Ok(false)}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    #[ignore = "Uses a local timeline and Windows codecs; run with HUELITH_BENCH_PLAN"]
    fn production_timeline_throughput() {
        let path=std::env::var("HUELITH_BENCH_PLAN").expect("Set HUELITH_BENCH_PLAN to a compiled timeline JSON");
        let mut plan:NativeTimelinePlan=serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        plan.stream.output_path=std::env::temp_dir().join(format!("huelith-timeline-{nonce}.mp4")).to_string_lossy().into_owned();
        validate_plan(&mut plan).unwrap();
        let frames=plan.stream.frame_count;
        let report=render_plan(plan,Arc::new(AtomicBool::new(false)),"benchmark".into(),|p|{
            if p.completed>0 {println!("ack {} / {}: source {:.2}ms, compose {:.2}ms, queue+encode {:.2}ms; {}",
                p.completed,p.total,p.source_ms,p.composite_ms,p.encode_ms,p.backend);}
        }).expect("Production timeline export failed");
        assert_eq!(report.frames_written,frames);
        println!("PRODUCTION_TIMELINE: {} frames; {} ms; {:.2} completed FPS; output {}",
            frames,report.elapsed_ms,frames as f64*1000./report.elapsed_ms.max(1) as f64,report.output_path);
    }
    #[test]
    #[ignore = "Runs the production shader on the physical GPU"]
    fn production_gpu_matches_filter_reference(){
        let (w,h)=(96,54);let mut renderer=retained_gpu::Renderer::new(w,h).expect("Hardware GPU");
        let mut source=vec![0u8;w as usize*h as usize*4];
        for (i,pixel) in source.chunks_exact_mut(4).enumerate(){
            pixel.copy_from_slice(&[(i*17%256) as u8,(i*61%256) as u8,(i*113%256) as u8,255]);
        }
        let parameters=serde_json::json!({"lookId":"parity","nativeRecipe":{
            "exposure":0.2,"contrast":1.15,"saturation":0.8,"gamma":1.1,"lift":0.01,
            "temperature":0.13,"tint":-0.04,"fade":0.07,"shadow":[0.02,0.,0.03],
            "highlight":[0.02,0.01,0.],"split":0.2,"hue":9.}});
        let (key,cube)=filter_lut::gpu_cube(&parameters).unwrap();
        let mut clip=basic_clip();let original=Arc::new(source.clone());
        let layer=retained_gpu::Layer{id:"filtered".into(),width:w,height:h,pixels:original,
            geometry:gpu_geometry(&clip,0.,w,h,w,h),filter:Some(retained_gpu::Filter{key,cube,strength:0.73})};
        let actual=renderer.render(&[layer],[0,0,0]).unwrap();
        filter_lut::apply(&mut source,73.,&parameters).unwrap();
        let max=actual.iter().zip(&source).map(|(a,b)|a.abs_diff(*b)).max().unwrap();
        assert!(max<=1,"CPU/GPU filter parity exceeded one byte: {max}");
        clip.x=0.09;clip.y=-0.08;clip.rotation=24.;clip.scale=0.6;clip.scale_y=0.7;
        let source=[93,173,241,255].repeat(w as usize*h as usize);
        let mut expected=[7,9,13,255].repeat(w as usize*h as usize);
        composite_layer(&mut expected,w,h,&source,w,h,&clip,0.);
        let actual=renderer.render(&[retained_gpu::Layer{id:"rotated".into(),width:w,height:h,
            pixels:Arc::new(source),geometry:gpu_geometry(&clip,0.,w,h,w,h),filter:None}],[7,9,13]).unwrap();
        let bad=actual.chunks_exact(4).zip(expected.chunks_exact(4)).filter(|(a,b)|a.iter().zip(*b).any(|(a,b)|a.abs_diff(*b)>1)).count();
        assert!(bad<((w+h)*3) as usize,"Affine transform differs beyond rasterized edges ({bad} pixels)");
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Requires HUELITH_BENCH_PLAN and its real source media"]
    fn production_source_filter_parity(){
        let path=std::env::var("HUELITH_BENCH_PLAN").unwrap();
        let plan:NativeTimelinePlan=serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let clip=plan.clips.iter().find(|c|c.kind=="video"&&c.effects.iter().any(|e|e.kind=="video-filter")).unwrap();
        let effect=clip.effects.iter().find(|e|e.kind=="video-filter").unwrap();
        let mut source=PixelSource::open(clip).unwrap();
        let time=clip.start+0.75;
        let (raw,w,h)=source.shared_frame(source_time(clip,time-clip.start)).unwrap();
        let mut reference=raw.to_vec();color_effects(&mut reference,w,h,clip,time-clip.start).unwrap();
        let (key,cube)=filter_lut::gpu_cube(&effect.parameters).unwrap();
        let mut renderer=retained_gpu::Renderer::new(w,h).unwrap();
        let rendered=renderer.render(&[retained_gpu::Layer{id:"real-source".into(),width:w,height:h,pixels:raw,
            geometry:[0.,0.,1.,1.,1.,0.,1.,w as f32/h as f32,0.,0.,1.,1.,0.,0.,1.,1.,0.,0.,1.,1.],
            filter:Some(retained_gpu::Filter{key,cube,strength:effect.amount as f32/100.})}],plan.background).unwrap();
        let errors:Vec<_>=rendered.iter().zip(&reference).map(|(a,b)|(*a as i32-*b as i32).unsigned_abs()).collect();
        let max=errors.iter().copied().max().unwrap();
        let mean=errors.iter().map(|&v|v as f64).sum::<f64>()/errors.len() as f64;
        println!("REAL_SOURCE_GPU_PARITY: max {max}, mean {mean:.6} levels");
        assert!(max<=1,"Source filter differs by {max}, mean {mean}");
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Cancels a real production export using HUELITH_BENCH_PLAN"]
    fn production_cancellation_closes_lookahead_and_never_publishes(){
        let path=std::env::var("HUELITH_BENCH_PLAN").unwrap();
        let mut plan:NativeTimelinePlan=serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let output=std::env::temp_dir().join(format!("huelith-cancel-{nonce}.mp4"));
        plan.stream.output_path=output.to_string_lossy().into_owned();
        validate_plan(&mut plan).unwrap();
        let cancelled=Arc::new(AtomicBool::new(false));
        let result=render_plan(plan,Arc::clone(&cancelled),"cancel-check".into(),|p|{
            if p.completed>=3{cancelled.store(true,Ordering::Relaxed);}
        });
        assert!(result.is_err());assert!(cancelled.load(Ordering::Relaxed));
        assert!(!output.exists(),"A cancelled partial movie was published");
    }
    fn basic_clip()->NativeVisualClip{NativeVisualClip{id:"clip".into(),path:"unused.mp4".into(),kind:"video".into(),
      start:0.,duration:2.,source_in:0.,x:0.,y:0.,scale:1.,scale_y:1.,rotation:0.,
      opacity:1.,fade_in:0.,fade_out:0.,flip_x:false,flip_y:false,fit:"fit".into(),crop:[0.,0.,1.,1.],title:String::new(),blend_mode:String::new(),
      text_style:None,shape:None,mask:None,chroma_key:None,transition_in:None,transition_out:None,
      keyframes:Vec::new(),animation:NativeAnimation::default(),source_map:Vec::new(),hold_frame:None,
      effects:Vec::new(),grade:None,cut_in:None,cut_out:None}}
    #[test]fn opaque_source_over_blend(){let mut pixel=[20,40,60,255];blend_rgba_pixel(&mut pixel,[220,140,80,128],1.);
      assert_eq!(pixel,[120,90,70,255]);}
    #[test]fn transparent_source_does_not_erase_background(){let mut pixel=[20,40,60,255];blend_rgba_pixel(&mut pixel,[255,255,255,0],1.);
      assert_eq!(pixel,[20,40,60,255]);}
    #[test]fn native_animated_transform_interpolates(){
        let mut clip=basic_clip();
        clip.keyframes=vec![NativeKey{parameter:"x".into(),time:0.,value:0.,..Default::default()},
           NativeKey{parameter:"x".into(),time:2.,value:0.5,..Default::default()}];
        assert!((transform_at(&clip,1.).x-0.25).abs()<1e-6);
    }
    #[test]fn native_source_retiming_uses_interpolation(){
        let mut clip=basic_clip();
        clip.source_map=vec![NativeTimePoint{time:0.,source:2.},NativeTimePoint{time:2.,source:6.}];
        assert!((source_time(&clip,1.)-4.).abs()<1e-6);
    }
    #[test]fn native_mask_excludes_pixels_outside_rectangle(){
        let mask=NativeMask{shape:"rectangle".into(),region:NativeRegion{x:0.25,y:0.25,width:0.5,height:0.5},
            feather:0.,rotation:0.,invert:false,vertices:Vec::new()};
        assert_eq!(mask_coverage(&mask,0.5,0.5),1.);
        assert_eq!(mask_coverage(&mask,0.05,0.05),0.);
    }
    #[test]fn native_pixel_effect_preserves_alpha(){
        let mut clip=basic_clip();
        clip.effects.push(NativeEffect{kind:"invert".into(),amount:100.,parameters:Value::Null,color:None,reference_width:None,mask:None,keyframes:Vec::new()});
        let mut pixels=vec![10,20,30,128];
        color_effects(&mut pixels,1,1,&clip,0.).unwrap();
        assert_eq!(pixels,[245,235,225,128]);
    }
    #[test]fn source_images_are_not_flipped_by_default(){let mut output=vec![0u8;16*16*4];let mut clip=basic_clip();clip.fit="stretch".into();
      let mut pixels=vec![0u8;16*16*4];for (i,p) in pixels.chunks_exact_mut(4).enumerate(){p.copy_from_slice(&[(i%16) as u8,0,0,255]);}
      composite_layer(&mut output,16,16,&pixels,16,16,&clip,0.);
      assert_eq!(&output[..4],&[0,0,0,255]);assert_eq!(&output[15*4..15*4+4],&[15,0,0,255]);}
}
