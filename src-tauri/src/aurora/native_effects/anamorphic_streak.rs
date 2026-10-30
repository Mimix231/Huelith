//! Anamorphic-style horizontal streaks sourced only from bright pixels.
//! No full-screen horizontal bands drawn irrespective of artwork.
use super::{CpuEffect,RgbaImage};
pub fn render(image:&RgbaImage,fx:&CpuEffect)->RgbaImage {
    let strength=fx.amount.clamp(0.0,100.0)/100.0;
    if strength==0.0 {return image.clone();}
    let threshold=fx.parameters.as_ref().and_then(|p|p.threshold).unwrap_or(70.0).clamp(0.0,100.0)*2.55;
    let frequency=fx.parameters.as_ref().and_then(|p|p.frequency).unwrap_or(50.0).clamp(10.0,150.0);
    let radius=fx.parameters.as_ref().and_then(|p|p.radius)
        .unwrap_or(32.0*frequency/50.0).clamp(2.0,512.0).round() as usize;
    let richness=fx.parameters.as_ref().and_then(|p|p.color_mix).unwrap_or(50.0).clamp(0.0,100.0)/100.0;
    let mut out=image.clone();
    for y in 0..image.height {
        // Weighted box window: constant work per pixel independent of streak width.
        let mut prefixes=vec![0f32;image.width+1];
        for x in 0..image.width {
            let i=(y*image.width+x)*4;
            let px=&image.pixels[i..i+4];
            let l=px[0] as f32*0.2126+px[1] as f32*0.7152+px[2] as f32*0.0722;
            let emission=((l-threshold)/(255.0-threshold).max(1.0)).clamp(0.0,1.0)*px[3] as f32/255.0;
            prefixes[x+1]=prefixes[x]+emission;
        }
        for x in 0..image.width {
            let left=x.saturating_sub(radius);
            let right=(x+radius+1).min(image.width);
            let average=(prefixes[right]-prefixes[left])/(right-left) as f32;
            let flare=(average*strength*3.2).clamp(0.0,1.0);
            let i=(y*image.width+x)*4;
            out.pixels[i]=out.pixels[i].saturating_add(((145.0-100.0*richness)*flare) as u8);
            out.pixels[i+1]=out.pixels[i+1].saturating_add((145.0*flare) as u8);
            out.pixels[i+2]=out.pixels[i+2].saturating_add(((130.0+125.0*richness)*flare) as u8);
            out.pixels[i+3]=out.pixels[i+3].saturating_add(((255-out.pixels[i+3]) as f32*flare) as u8);
        }
    }
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn flares_stay_near_bright_rows() {
        let mut src=RgbaImage{width:60,height:4,pixels:vec![0;60*4*4]};
        let i=(1*60+30)*4;src.pixels[i..i+4].copy_from_slice(&[255,255,255,255]);
        let fx=CpuEffect{kind:"atelier_7_1".into(),amount:90.0,parameters:None};
        let out=render(&src,&fx);
        assert!(out.pixels[(1*60+27)*4]>0);
        assert_eq!(out.pixels[(0*60+27)*4],0);
    }
}
