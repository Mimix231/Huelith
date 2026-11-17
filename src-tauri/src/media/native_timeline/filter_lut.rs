//! Native implementation of Video Editor filter presets. The compiled grade
//! recipe comes from VIDEO_FILTER_LOOKUP and is the same recipe the WebView
//! filter catalog uses. The 33-cube LUT and trilinear interpolation reproduce
//! the authoring filter arithmetic; no browser frame processing is involved.
use serde::Deserialize;
use serde_json::Value;
use std::{collections::HashMap,sync::{Arc,Mutex,OnceLock}};
const SIDE:usize=33;
const STRIDE:usize=SIDE*SIDE;

#[derive(Clone,Debug,Deserialize)]
pub(super) struct GradeRecipe {
    exposure:f64,contrast:f64,saturation:f64,gamma:f64,lift:f64,
    temperature:f64,tint:f64,fade:f64,shadow:[f64;3],highlight:[f64;3],split:f64,hue:f64,
}
impl GradeRecipe {
    pub(super) fn validate(&self)->Result<(),String>{
        let scalars=[self.exposure,self.contrast,self.saturation,self.gamma,self.lift,
            self.temperature,self.tint,self.fade,self.split,self.hue];
        if !scalars.iter().chain(self.shadow.iter()).chain(self.highlight.iter()).all(|n|n.is_finite())
            ||self.gamma<=0.||scalars.iter().any(|n|n.abs()>1e6){return Err("Invalid native filter grade recipe".into());}
        Ok(())
    }
    fn grade(&self,r:f64,g:f64,b:f64)->[f64;3]{
        let exposure=2f64.powf(self.exposure);let power=1./self.gamma;
        let red=self.lift+self.temperature*0.045+self.tint*0.018;
        let green=self.lift-self.tint*0.035;
        let blue=self.lift-self.temperature*0.045+self.tint*0.018;
        let angle=self.hue*std::f64::consts::PI/180.;let (sin,cos)=angle.sin_cos();
        let fade=1.-self.fade;let gray=self.fade*0.5;
        let rr=(r*exposure+red).max(0.).powf(power);
        let gg=(g*exposure+green).max(0.).powf(power);
        let bb=(b*exposure+blue).max(0.).powf(power);
        let lum=rr*0.2126+gg*0.7152+bb*0.0722;
        let u=(bb-lum)*self.saturation;let v=(rr-lum)*self.saturation;
        let ur=u*cos-v*sin;let vr=u*sin+v*cos;
        let tone=(lum-0.5)*self.contrast+0.5;
        let bounded=lum.clamp(0.,1.);
        let dark=(1.-bounded).powi(2)*self.split;
        let bright=bounded.powi(2)*self.split;
        [
          ((tone+vr*self.contrast+self.shadow[0]*dark+self.highlight[0]*bright)*fade+gray).clamp(0.,1.),
          ((tone-(0.2126*vr+0.0722*ur)/0.7152*self.contrast+self.shadow[1]*dark+self.highlight[1]*bright)*fade+gray).clamp(0.,1.),
          ((tone+ur*self.contrast+self.shadow[2]*dark+self.highlight[2]*bright)*fade+gray).clamp(0.,1.),
        ]
    }
}

pub(super) fn decode_recipe(parameters:&Value)->Result<(String,GradeRecipe),String>{
    let look=parameters.get("lookId").and_then(Value::as_str).ok_or("Native filter lacks lookId")?;
    if look.is_empty()||look.len()>120{return Err("Invalid native filter lookId".into());}
    let value=parameters.get("nativeRecipe").ok_or("Native filter grade recipe missing")?;
    let recipe:GradeRecipe=serde_json::from_value(value.clone()).map_err(|e|format!("Native filter recipe: {e}"))?;
    recipe.validate()?;
    Ok((look.to_owned(),recipe))
}

fn create_lut(recipe:&GradeRecipe)->Vec<[f64;3]>{
    let mut lut=Vec::with_capacity(SIDE*SIDE*SIDE);
    for r in 0..SIDE{for g in 0..SIDE{for b in 0..SIDE{
        let c=recipe.grade(r as f64/32.,g as f64/32.,b as f64/32.);
        lut.push([c[0]*255.,c[1]*255.,c[2]*255.]);
    }}}
    lut
}
pub(super) fn gpu_cube(parameters:&Value)->Result<(String,Arc<Vec<[f32;4]>>),String>{
    let (look,recipe)=decode_recipe(parameters)?;
    let key=format!("{look}:{}",parameters.get("nativeRecipe").unwrap_or(&Value::Null));
    static CUBES:OnceLock<Mutex<HashMap<String,Arc<Vec<[f32;4]>>>>>=OnceLock::new();
    let mut cache=CUBES.get_or_init(||Mutex::new(HashMap::new())).lock().map_err(|_|"GPU LUT cache poisoned")?;
    if let Some(cube)=cache.get(&key){return Ok((key,cube.clone()));}
    let cube=Arc::new(create_lut(&recipe).iter().map(|c|[(c[0]/255.) as f32,(c[1]/255.) as f32,(c[2]/255.) as f32,1.]).collect());
    if cache.len()>=8 {cache.clear();}
    cache.insert(key.clone(),Arc::clone(&cube));Ok((key,cube))
}
fn sample(lut:&[[f64;3]],p:[u8;3])->[f64;3]{
    let v=p.map(|n|n as f64*32./255.);
    let base=v.map(|n|(n.floor() as usize).min(31));
    let delta=[v[0]-base[0] as f64,v[1]-base[1] as f64,v[2]-base[2] as f64];
    let i=base[0]*STRIDE+base[1]*SIDE+base[2];
    let (x,y,z)=(delta[0],delta[1],delta[2]);
    let mut out=[0.;3];
    for ch in 0..3{
        let c00=lut[i][ch]*(1.-x)+lut[i+STRIDE][ch]*x;
        let c01=lut[i+1][ch]*(1.-x)+lut[i+STRIDE+1][ch]*x;
        let c10=lut[i+SIDE][ch]*(1.-x)+lut[i+STRIDE+SIDE][ch]*x;
        let c11=lut[i+SIDE+1][ch]*(1.-x)+lut[i+STRIDE+SIDE+1][ch]*x;
        out[ch]=(c00*(1.-y)+c10*y)*(1.-z)+(c01*(1.-y)+c11*y)*z;
    }
    out
}

pub(super) fn apply(frame:&mut [u8],amount:f64,parameters:&Value)->Result<(),String>{
    let strength=(amount/100.).clamp(0.,1.);
    if strength<=0.{return Ok(());}
    let (look,recipe)=decode_recipe(parameters)?;
    // LUT keys are a fixed Huelith catalog ID plus the exact serialized recipe;
    // even custom/migrated projects cannot accidentally reuse a different LUT.
    let key=format!("{look}:{}",parameters.get("nativeRecipe").unwrap_or(&Value::Null));
    static LUTS:OnceLock<Mutex<HashMap<String,Arc<Vec<[f64;3]>>>>>=OnceLock::new();
    let cache=LUTS.get_or_init(||Mutex::new(HashMap::new()));
    let lut={
        let mut map=cache.lock().map_err(|_|"Native filter LUT cache poisoned")?;
        if let Some(lut)=map.get(&key){Arc::clone(lut)}else{
            if map.len()>=8{map.clear();}
            let lut=Arc::new(create_lut(&recipe));map.insert(key,lut.clone());lut
        }
    };
    for pixel in frame.chunks_exact_mut(4){
        if pixel[3]==0{continue;}
        let graded=sample(&lut,[pixel[0],pixel[1],pixel[2]]);
        for ch in 0..3{
            pixel[ch]=(pixel[ch] as f64+(graded[ch]-pixel[ch] as f64)*strength).round().clamp(0.,255.) as u8;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests{
  use super::*;
  #[test]fn neutral_grade_keeps_rgb(){
    let neutral=serde_json::json!({"lookId":"neutral","nativeRecipe":{"exposure":0.,"contrast":1.,"saturation":1.,"gamma":1.,"lift":0.,"temperature":0.,"tint":0.,"fade":0.,"shadow":[0.,0.,0.],"highlight":[0.,0.,0.],"split":0.,"hue":0.}});
    let mut pix=[25,120,222,255,190,20,17,0];apply(&mut pix,100.,&neutral).unwrap();
    assert!((pix[0] as i32-25).abs()<=1 && (pix[1] as i32-120).abs()<=1 && (pix[2] as i32-222).abs()<=1);
    assert_eq!(pix[7],0);
  }
  #[test]fn malformed_grade_fails_closed(){assert!(decode_recipe(&serde_json::json!({"lookId":"x"})).is_err());}
}
