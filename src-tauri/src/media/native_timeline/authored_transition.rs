//! Timed native implementation of Huelith's authored reveal recipes.
//! Recipes are compiled by TypeScript from transition-recipes.ts and carried
//! with the native graph so the original mask/motion/tint choices survive.
use super::{NativeVisualClip,NativeRecipe,NativeReveal,RenderTransform,rgb_from_hex};
use std::f64::consts::PI;
mod fx;
fn cap(x:f64)->f64{x.clamp(0.,1.)}
fn smooth(x:f64)->f64{x*x*(3.-2.*x)}
fn num(n:Option<f64>)->f64{n.unwrap_or(0.)}

pub(super) fn validate(recipe:Option<&NativeRecipe>)->Result<(),String>{
    let r=recipe.ok_or("Authored transition has no compiled recipe")?;
    if r.id.len()>100 || r.id.is_empty() || !matches!(r.group.as_str(),"Fade In"|"Fade Out"|"Combo"|"Legacy"){
        return Err("Invalid native authored transition identity".into());
    }
    if r.legacy_effects.len()>16||r.legacy_effects.iter().any(|fx|!fx::supports(&fx.kind)||!fx.peak.is_finite()){
        return Err("Native legacy transition contains an unsupported treatment".into());
    }
    for reveal in std::iter::once(&r.reveal).chain(r.leave.iter()){
        if reveal.id.len()>64 || reveal.id.is_empty(){return Err("Invalid authored reveal".into());}
        if let Some(mask)=reveal.mask.as_deref(){
            if !matches!(mask,"luma"|"inverse-luma"|"dither"|"horizontal"|"vertical"|"diagonal"|"split"|"corner"|"clock"|"iris"|"diamond"|"ring"|"blinds"|"tiles"|"star"|"paper"){
                return Err(format!("Unimplemented native reveal mask {mask}"));
            }
        }
        if let Some(tint)=&reveal.tint{
            if tint.len()!=7 || !tint.starts_with('#') || !tint[1..].bytes().all(|c|c.is_ascii_hexdigit()){
                return Err("Invalid authored transition tint".into());
            }
        }
        let motion=reveal.motion.as_ref();
        let entries=[reveal.flash,reveal.pulse,motion.and_then(|m|m.x),motion.and_then(|m|m.y),
            motion.and_then(|m|m.zoom),motion.and_then(|m|m.rotation),motion.and_then(|m|m.bounce),motion.and_then(|m|m.blur)];
        if entries.into_iter().flatten().any(|n|!n.is_finite()||n.abs()>10000.){
            return Err("Invalid authored transition movement".into());
        }
        if let Some(effect)=&reveal.fx{
            if !effect.amount.is_finite() || !fx::supports(&effect.kind){
                return Err(format!("Native authored transition has no effect processor for {}",effect.kind));
            }
        }
    }
    Ok(())
}

struct Active<'a>{recipe:&'a NativeRecipe,reveal:&'a NativeReveal,visibility:f64,exit:bool,
    incoming:bool}
fn find<'a>(clip:&'a NativeVisualClip,time:f64)->Option<Active<'a>>{
    let local=time-clip.start;
    if let Some(cut)=&clip.cut_in{
        if cut.kind=="effect" && time>=cut.start && time<=cut.end{
            let recipe=cut.native_recipe.as_ref()?;
            let raw=cap((time-cut.start)/(cut.end-cut.start));
            let progress=if recipe.reveal.linear{raw}else{smooth(raw)};
            return Some(Active{recipe,reveal:&recipe.reveal,visibility:progress,exit:false,incoming:true});
        }
    }
    if let Some(cut)=&clip.cut_out{
        if cut.kind=="effect" && time>=cut.start && time<=cut.end{
            let recipe=cut.native_recipe.as_ref()?;
            let raw=cap((time-cut.start)/(cut.end-cut.start));
            let progress=if recipe.reveal.linear{raw}else{smooth(raw)};
            let leave=recipe.leave.as_ref().unwrap_or(&recipe.reveal);
            return Some(Active{recipe,reveal:leave,visibility:1.-progress,exit:true,incoming:false});
        }
    }
    if let Some(t)=&clip.transition_in{
        if t.kind=="effect" && t.placement.as_deref()!=Some("cut") && local>=0.&&local<t.duration{
            let recipe=t.native_recipe.as_ref()?;
            let raw=cap(local/t.duration);
            let progress=if recipe.reveal.linear{raw}else{smooth(raw)};
            return Some(Active{recipe,reveal:&recipe.reveal,visibility:progress,exit:false,incoming:true});
        }
    }
    if let Some(t)=&clip.transition_out{
        if t.kind=="effect" && local>clip.duration-t.duration && local<=clip.duration{
            let recipe=t.native_recipe.as_ref()?;
            let raw=cap((local-(clip.duration-t.duration))/t.duration);
            let progress=if recipe.reveal.linear{raw}else{smooth(raw)};
            return Some(Active{recipe,reveal:&recipe.reveal,visibility:1.-progress,exit:true,incoming:false});
        }
    }
    None
}
fn threshold(mask:&str,x:f64,y:f64,luma:f64)->f64{
    let dx=x-0.5;let dy=y-0.5;
    match mask{
        "luma"=>0.06+0.88*(1.-luma),
        "inverse-luma"=>0.06+0.88*luma,
        "dither"=>{
            let xx=((x*44.).floor() as u32).wrapping_add(13).wrapping_mul(1103515245);
            let yy=((y*30.).floor() as u32).wrapping_add(7).wrapping_mul(19349663);
            (((xx^yy)>>8)%1000) as f64 /1000.
        },
        "horizontal"=>x,"vertical"=>y,"diagonal"=>(x+y)/2.,
        "split"=>dx.abs()*2.,"corner"=>x.max(y)*0.65+x.hypot(y)*0.25,
        "clock"=>(dx.atan2(-dy)+2.*PI)%(2.*PI)/(2.*PI),
        "iris"=>dx.hypot(dy)/0.7072,"diamond"=>dx.abs()+dy.abs(),
        "ring"=>(dx.hypot(dy)-0.28).abs()/0.428,
        "blinds"=>(y*9.).fract()*0.75+x*0.25,
        "tiles"=>(((x*9.).floor() as i64+(y*6.).floor() as i64)%5) as f64/7.+
           ((x*9.).fract()+(y*6.).fract())/5.,
        "star"=>cap(dx.hypot(dy)/(0.52+0.16*(dy.atan2(dx)*5.).cos())),
        "paper"=>cap(x*0.76+y*0.18+0.045*(y*97.).sin()+0.035*(y*37.).cos()),
        _=>1.,
    }
}
fn mask_coverage(kind:&str,progress:f64,x:f64,y:f64,luma:f64)->f64{
    let feather=match kind{"luma"|"inverse-luma"=>0.16,"paper"=>0.046,_=>0.035};
    let cutoff=feather*0.5+cap(threshold(kind,x,y,luma))*(1.-feather);
    cap((progress-cutoff)/feather+0.5)
}

/// Applies exactly the authored mask threshold logic, independent of the
/// fallback older transition kinds; two adjacent clips use complementary masks.
pub(super) fn coverage(clip:&NativeVisualClip,time:f64,x:f64,y:f64,luma:f64)->f64{
    let Some(active)=find(clip,time) else{return 1.;};
    if let Some(mask)=active.recipe.reveal.mask.as_deref(){
        let incoming_coverage=mask_coverage(mask,if active.incoming{active.visibility}else{1.-active.visibility},x,y,luma);
        return if active.incoming{incoming_coverage}else{1.-incoming_coverage};
    }
    active.visibility
}

/// Mask-free, untinted dissolves and affine reveals have a uniform alpha;
/// reproduce it in the GPU layer without rasterizing a per-pixel CPU mask.
pub(super) fn gpu_coverage(clip:&NativeVisualClip,time:f64)->Option<f64>{
    let Some(active)=find(clip,time)else{return Some(1.);};
    if active.recipe.reveal.mask.is_some()||active.reveal.tint.is_some()||needs_treatment(clip,time){return None;}
    Some(active.visibility)
}

pub(super) fn motion(clip:&NativeVisualClip,time:f64,t:&mut RenderTransform){
    let Some(active)=find(clip,time)else{return;};
    let Some(m)=active.reveal.motion.as_ref()else{return;};
    let distance=1.-active.visibility;let direction=if active.exit{-1.}else{1.};
    let zoom=1.+num(m.zoom)*distance+num(m.bounce)*(2.*PI*active.visibility).sin();
    let fold=(PI*active.visibility/2.).sin().max(0.02);
    t.x+=num(m.x)*distance*direction;
    t.y+=num(m.y)*distance*direction;
    t.rotation+=num(m.rotation)*distance*direction;
    t.scale*=zoom*if m.fold_x{fold}else{1.};
    t.scale_y*=zoom*if m.fold_y{fold}else{1.};
    t.scale=t.scale.max(0.02);t.scale_y=t.scale_y.max(0.02);
}

pub(super) fn tint(clip:&NativeVisualClip,time:f64,pixel:&mut [u8;4]){
    let Some(active)=find(clip,time) else{return;};
    let Some(tint)=active.reveal.tint.as_ref() else{return;};
    let phase=(PI*active.visibility).sin();
    let pulse=active.reveal.pulse.map_or(1.,|pulse|(active.visibility*PI*pulse).sin().abs());
    let amount=cap(active.reveal.flash.unwrap_or(0.6)*phase*pulse);
    let color=rgb_from_hex(tint);
    for c in 0..3{pixel[c]=(pixel[c] as f64*(1.-amount)+color[c] as f64*amount).round() as u8;}
}

pub(super) fn needs_treatment(clip:&NativeVisualClip,time:f64)->bool{
    find(clip,time).is_some_and(|active|active.reveal.fx.is_some()||!active.recipe.legacy_effects.is_empty()||
      active.reveal.motion.as_ref().is_some_and(|m|m.blur.is_some_and(|n|n>0.)))
}
pub(super) fn treat_frame(clip:&NativeVisualClip,time:f64,rgba:&mut [u8],w:u32,h:u32){
    let Some(active)=find(clip,time) else{return;};
    if let Some(m)=&active.reveal.motion{
        let radius=(num(m.blur)*(1.-active.visibility)*w as f64/960.).round() as usize;
        if radius>0{fx::box_blur(rgba,w,h,radius.min(64));}
    }
    if let Some(effect)=&active.reveal.fx{
        let distance=1.-active.visibility;
        let neutral=if effect.kind=="pixelate"{1.}else{0.};
        fx::apply(rgba,w,h,&effect.kind,neutral+(effect.amount-neutral)*distance,time);
    }
    if active.recipe.group=="Legacy"{
        // Legacy transitions author effects over the crossfade envelope.
        // Both sources receive the identical treatment before their timed blend.
        let progress=if active.exit{1.-active.visibility}else{active.visibility};
        let envelope=(PI*progress).sin().max(0.);
        for effect in &active.recipe.legacy_effects{
            let neutral=if effect.kind=="contrast"{100.}else if effect.kind=="pixelate"{1.}else{0.};
            fx::apply(rgba,w,h,&effect.kind,neutral+(effect.peak-neutral)*envelope,time);
        }
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn authored_mask_progresses(){
        assert!(mask_coverage("horizontal",0.2,0.1,0.5,0.5)>mask_coverage("horizontal",0.2,0.9,0.5,0.5));
        assert!(mask_coverage("iris",0.4,0.5,0.5,0.5)>mask_coverage("iris",0.4,0.,0.,0.5));
    }
    #[test]fn dither_is_bounded(){assert!((0. ..=1.).contains(&threshold("dither",0.3,0.4,0.2)));}
}
