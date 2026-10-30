//! Real luminance sorting, not a displacement/"glitch" imitation.
use super::{CpuEffect, RgbaImage};
fn lum(px: &[u8]) -> u32 { (px[0] as u32*2126+px[1] as u32*7152+px[2] as u32*722)/10000 }
fn sort_segment(input: &[u8], output: &mut [u8], amount: f32) {
    let mut indices: Vec<usize> = (0..input.len()/4).collect();
    indices.sort_by_key(|&index| lum(&input[index*4..index*4+4]));
    for (target, origin) in indices.into_iter().enumerate() {
        for channel in 0..4 {
            let original = input[target*4+channel] as f32;
            let ordered = input[origin*4+channel] as f32;
            output[target*4+channel] = (original+(ordered-original)*amount).round().clamp(0.0,255.0) as u8;
        }
    }
}
pub fn render(image:&RgbaImage,fx:&CpuEffect) -> RgbaImage {
    let amount=fx.amount.clamp(0.0,100.0)/100.0;
    if amount==0.0 { return image.clone(); }
    let threshold=fx.parameters.as_ref().and_then(|p|p.threshold).unwrap_or(45.0).clamp(0.0,100.0)*2.55;
    let richness=fx.parameters.as_ref().and_then(|p|p.color_mix).unwrap_or(50.0).clamp(0.0,100.0)/50.0;
    let vertical=fx.parameters.as_ref().and_then(|p|p.angle).unwrap_or(0.0).rem_euclid(180.0)>=45.0 &&
        fx.parameters.as_ref().and_then(|p|p.angle).unwrap_or(0.0).rem_euclid(180.0)<135.0;
    let mut output=image.pixels.clone();
    let (width,height)=(image.width,image.height);
    let line_count=if vertical {width}else{height};
    let length=if vertical {height}else{width};
    for line in 0..line_count {
        let mut source=Vec::with_capacity(length*4);
        for pos in 0..length {
            let i=if vertical {(pos*width+line)*4}else{(line*width+pos)*4};
            source.extend_from_slice(&image.pixels[i..i+4]);
        }
        let mut sorted=source.clone();
        let mut start=0;
        while start<length {
            let i=start*4;
            if source[i+3]==0 || (lum(&source[i..i+4]) as f32)<threshold {start+=1;continue;}
            let mut end=start+1;
            while end<length {
                let j=end*4;
                if source[j+3]==0 || (lum(&source[j..j+4]) as f32)<threshold {break;}
                end+=1;
            }
            sort_segment(&source[start*4..end*4],&mut sorted[start*4..end*4],amount);
            start=end;
        }
        for pos in 0..length {
            let i=if vertical {(pos*width+line)*4}else{(line*width+pos)*4};
            output[i..i+4].copy_from_slice(&sorted[pos*4..pos*4+4]);
            // At neutral richness (50) sorting is a strict pixel permutation.
            // Other values may desaturate/boost the sorted colors deliberately.
            if (richness-1.0).abs()>0.001 {
                let l=lum(&output[i..i+4]) as f32;
                for c in 0..3 {
                    output[i+c]=(l+(output[i+c] as f32-l)*richness).round().clamp(0.0,255.0) as u8;
                }
            }
        }
    }
    RgbaImage {width,height,pixels:output}
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sorts_actual_pixels_not_offsets_and_preserves_alpha() {
        let src=RgbaImage{width:4,height:1,pixels:vec![200,0,0,255,100,0,0,255,180,0,0,255,220,0,0,255]};
        let fx=CpuEffect {kind:"atelier_3_12".into(),amount:100.0,parameters:Some(super::super::super::NativeParameters{threshold:Some(0.0),..Default::default()})};
        let out=render(&src,&fx);
        assert_eq!(out.pixels,vec![100,0,0,255,180,0,0,255,200,0,0,255,220,0,0,255]);
        let zero=CpuEffect {amount:0.0,..fx};
        assert_eq!(render(&src,&zero).pixels,src.pixels);
    }
}
