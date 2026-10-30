//! Tone-dependent dot coverage in continuous screen coordinates.
use super::{CpuEffect,RgbaImage};
pub fn render(image:&RgbaImage,fx:&CpuEffect)->RgbaImage {
    let strength=fx.amount.clamp(0.0,100.0)/100.0;
    if strength==0.0 {return image.clone();}
    let frequency=fx.parameters.as_ref().and_then(|p|p.frequency).unwrap_or(50.0).clamp(1.0,100.0);
    let cell=(13.0-frequency*0.11).clamp(2.0,13.0);
    let richness=fx.parameters.as_ref().and_then(|p|p.color_mix).unwrap_or(50.0).clamp(0.0,100.0)/100.0;
    let angle=fx.parameters.as_ref().and_then(|p|p.angle).unwrap_or(45.0).to_radians();
    let (cos,sin)=(angle.cos(),angle.sin());
    let mut out=image.clone();
    for y in 0..image.height {for x in 0..image.width {
        let i=(y*image.width+x)*4;
        if image.pixels[i+3]==0 {continue;}
        let p=&image.pixels[i..i+4];
        let luma=(0.2126*p[0] as f32+0.7152*p[1] as f32+0.0722*p[2] as f32)/255.0;
        // Ink area grows in shadows, shrinks in highlights.
        let dot_radius=(1.0-luma).sqrt()*0.70;
        let a=(x as f32*cos+y as f32*sin)/cell;
        let b=(-(x as f32)*sin+y as f32*cos)/cell;
        let dx=a-a.round();let dy=b-b.round();
        let dist=(dx*dx+dy*dy).sqrt();
        let coverage=(dot_radius-dist).mul_add(cell,0.5).clamp(0.0,1.0);
        let value=255.0*(1.0-coverage);
        for channel in 0..3 {
            let paper=value*(1.0-richness*0.3)+p[channel] as f32*richness*0.3*(1.0-coverage);
            out.pixels[i+channel]=(p[channel] as f32*(1.0-strength)+paper*strength).round().clamp(0.0,255.0) as u8;
        }
    }}
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn dots_vary_by_luminance_and_zero_is_identity() {
        let source=RgbaImage{width:40,height:20,pixels:(0..800).flat_map(|i| {
            let v=if i%40<20{30}else{220};[v,v,v,255]
        }).collect()};
        let fx=CpuEffect{kind:"atelier_4_0".into(),amount:100.0,parameters:None};
        let output=render(&source,&fx);
        assert_ne!(output.pixels,source.pixels);
        let dark=(0..20).flat_map(|y|(0..20).map(move|x|(y*40+x)*4)).filter(|i|output.pixels[*i]<100).count();
        let light=(0..20).flat_map(|y|(20..40).map(move|x|(y*40+x)*4)).filter(|i|output.pixels[*i]<100).count();
        assert!(dark>light,"dark tones must occupy more black dot area");
        assert_eq!(render(&source,&CpuEffect{amount:0.0,..fx}).pixels,source.pixels);
    }
}
