//! Native photographic highlight halation. Linear scalar blur avoids 8-bit
//! quantization destroying isolated highlight emissions before compositing.
//! Three box passes approximate a spatial Gaussian diffusion kernel.
use super::{CpuEffect,RgbaImage};
fn blur_pass(input:&[f32],w:usize,h:usize,radius:usize,horizontal:bool)->Vec<f32>{
    let mut out=vec![0.0;input.len()];
    if horizontal {
        for y in 0..h {
            let mut sum=0.0;
            for x in 0..w {
                if x==0 { for v in &input[y*w..y*w+(radius+1).min(w)] {sum+=v;} }
                else {
                    if x>radius {sum-=input[y*w+x-radius-1];}
                    if x+radius<w {sum+=input[y*w+x+radius];}
                }
                let count=(x+radius+1).min(w)-x.saturating_sub(radius);
                out[y*w+x]=sum/count as f32;
            }
        }
    }else{
        for x in 0..w {
            let mut sum=0.0;
            for y in 0..h {
                if y==0 {for yy in 0..(radius+1).min(h){sum+=input[yy*w+x];}}
                else {
                    if y>radius {sum-=input[(y-radius-1)*w+x];}
                    if y+radius<h {sum+=input[(y+radius)*w+x];}
                }
                let count=(y+radius+1).min(h)-y.saturating_sub(radius);
                out[y*w+x]=sum/count as f32;
            }
        }
    }
    out
}
pub fn render(image:&RgbaImage,fx:&CpuEffect,_threads:usize)->RgbaImage {
    let strength=fx.amount.clamp(0.0,100.0)/100.0;
    if strength==0.0 {return image.clone();}
    let threshold=fx.parameters.as_ref().and_then(|p|p.threshold).unwrap_or(70.0).clamp(0.0,100.0)*2.55;
    let frequency=fx.parameters.as_ref().and_then(|p|p.frequency).unwrap_or(50.0).clamp(10.0,150.0);
    let radius=fx.parameters.as_ref().and_then(|p|p.radius)
        .unwrap_or(12.0*frequency/50.0).clamp(1.0,80.0).round() as usize;
    let richness=fx.parameters.as_ref().and_then(|p|p.color_mix).unwrap_or(50.0).clamp(0.0,100.0)/100.0;
    let mut light=vec![0.0;image.width*image.height];
    for (px,mask) in image.pixels.chunks_exact(4).zip(light.iter_mut()) {
        let luminance=px[0] as f32*0.2126+px[1] as f32*0.7152+px[2] as f32*0.0722;
        *mask=((luminance-threshold)/(255.0-threshold).max(1.0)).clamp(0.0,1.0)*px[3] as f32/255.0;
    }
    for _ in 0..3 {
        light=blur_pass(&light,image.width,image.height,radius,true);
        light=blur_pass(&light,image.width,image.height,radius,false);
    }
    let mut output=image.clone();
    for (pixel,field) in output.pixels.chunks_exact_mut(4).zip(light.iter()) {
        let glow=(field*strength).clamp(0.0,1.0);
        pixel[0]=pixel[0].saturating_add(((130.0+100.0*richness)*glow).round() as u8);
        pixel[1]=pixel[1].saturating_add(((95.0-60.0*richness)*glow).round() as u8);
        pixel[2]=pixel[2].saturating_add(((33.0-32.0*richness)*glow).round() as u8);
        pixel[3]=pixel[3].saturating_add(((255-pixel[3]) as f32*glow).round() as u8);
    }
    output
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn creates_light_outside_source_highlight(){
        let mut src=RgbaImage{width:21,height:11,pixels:vec![0;21*11*4]};
        let center=(5*21+10)*4;
        src.pixels[center..center+4].copy_from_slice(&[255,255,255,255]);
        let fx=CpuEffect{kind:"atelier_7_0".into(),amount:100.0,
            parameters:Some(super::super::super::NativeParameters{radius:Some(2.0),..Default::default()})};
        let out=render(&src,&fx,1);
        assert!(out.pixels[center+4]>0,"light should spread beyond highlight pixel");
        assert!(out.pixels[center+7]>0,"halo should spread into transparency");
        assert_eq!(render(&src,&CpuEffect{amount:0.0,..fx},1).pixels,src.pixels);
    }
}
