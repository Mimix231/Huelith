//! Exact RGBA8 -> BGRX8 conversion for the Media Foundation RGB32 input.
//! The source is straight-alpha RGBA; Windows MP4 exports composite it over
//! black. Previously a debug-build nested pointer loop multiplied every
//! component of every pixel. The opaque path now performs channel swizzling
//! only, using SSSE3 when available. No output pixel is skipped or approximated.

#[inline(always)]
fn pixel(src: &[u8], dst: &mut [u8]) {
    let alpha = src[3];
    if alpha == 255 {
        dst[0] = src[2]; dst[1] = src[1]; dst[2] = src[0]; dst[3] = 0;
    } else if alpha == 0 {
        dst[..4].fill(0);
    } else {
        let a = u16::from(alpha);
        dst[0] = ((u16::from(src[2]) * a + 127) / 255) as u8;
        dst[1] = ((u16::from(src[1]) * a + 127) / 255) as u8;
        dst[2] = ((u16::from(src[0]) * a + 127) / 255) as u8;
        dst[3] = 0;
    }
}

/// The caller must provide matching, four-byte aligned frame lengths. The
/// destination points to a locked IMFMediaBuffer, so this function neither
/// allocates nor owns the pixels.
pub(super) fn rgba_to_bgrx(src: &[u8], dst: &mut [u8]) -> Result<(), &'static str> {
    if src.len() != dst.len() || src.len() % 4 != 0 {
        return Err("RGBA and BGRX buffers must have matching pixel counts");
    }
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    if std::arch::is_x86_feature_detected!("ssse3") {
        // SAFETY: SSSE3 is checked at runtime; all loads and stores are
        // unaligned and bounded by the 16-byte chunks of the supplied slices.
        unsafe { rgba_to_bgrx_ssse3(src, dst); }
        return Ok(());
    }
    for (input, output) in src.chunks_exact(4).zip(dst.chunks_exact_mut(4)) {
        pixel(input, output);
    }
    Ok(())
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
#[target_feature(enable = "ssse3")]
unsafe fn rgba_to_bgrx_ssse3(src: &[u8], dst: &mut [u8]) {
    #[cfg(target_arch = "x86")]
    use std::arch::x86::{__m128i, _mm_loadu_si128, _mm_setr_epi8, _mm_shuffle_epi8, _mm_storeu_si128};
    #[cfg(target_arch = "x86_64")]
    use std::arch::x86_64::{__m128i, _mm_loadu_si128, _mm_setr_epi8, _mm_shuffle_epi8, _mm_storeu_si128};
    let shuffle = _mm_setr_epi8(2, 1, 0, -1, 6, 5, 4, -1, 10, 9, 8, -1, 14, 13, 12, -1);
    let blocks = src.len() / 16;
    for i in 0..blocks {
        let offset = i * 16;
        let source = &src[offset..offset + 16];
        if source[3] == 255 && source[7] == 255 && source[11] == 255 && source[15] == 255 {
            // SAFETY: each range contains at least 16 bytes, SSSE3 is
            // supported, and store is to a distinct mutable destination.
            let vector = _mm_loadu_si128(source.as_ptr().cast::<__m128i>());
            let converted = _mm_shuffle_epi8(vector, shuffle);
            _mm_storeu_si128(dst.as_mut_ptr().add(offset).cast::<__m128i>(), converted);
        } else {
            for (source_pixel, target_pixel) in source.chunks_exact(4)
                .zip(dst[offset..offset + 16].chunks_exact_mut(4)) {
                pixel(source_pixel, target_pixel);
            }
        }
    }
    for (source_pixel, target_pixel) in src[blocks * 16..].chunks_exact(4)
        .zip(dst[blocks * 16..].chunks_exact_mut(4)) {
        pixel(source_pixel, target_pixel);
    }
}

/// Media Foundation's decoded RGB32 samples are BGRX; the editor consumes
/// tightly packed RGBA. The source alpha byte is not meaningful for RGB32,
/// so the output is always opaque. This is the same output as the old nested
/// `copy_rgb_sample` loops, with an SSSE3 swizzle on capable CPUs.
pub(super) fn bgrx_to_rgba(src: &[u8], dst: &mut [u8]) -> Result<(), &'static str> {
    if src.len() != dst.len() || src.len() % 4 != 0 {
        return Err("BGRX and RGBA buffers must have matching pixel counts");
    }
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    if std::arch::is_x86_feature_detected!("ssse3") {
        // SAFETY: runtime CPU feature gate and unaligned, in-bounds loads.
        unsafe { bgrx_to_rgba_ssse3(src, dst); }
        return Ok(());
    }
    for (input, output) in src.chunks_exact(4).zip(dst.chunks_exact_mut(4)) {
        output[0] = input[2]; output[1] = input[1];
        output[2] = input[0]; output[3] = 255;
    }
    Ok(())
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
#[target_feature(enable = "ssse3")]
unsafe fn bgrx_to_rgba_ssse3(src: &[u8], dst: &mut [u8]) {
    #[cfg(target_arch = "x86")]
    use std::arch::x86::{__m128i, _mm_loadu_si128, _mm_setr_epi8, _mm_shuffle_epi8,
        _mm_storeu_si128, _mm_or_si128, _mm_set1_epi32};
    #[cfg(target_arch = "x86_64")]
    use std::arch::x86_64::{__m128i, _mm_loadu_si128, _mm_setr_epi8, _mm_shuffle_epi8,
        _mm_storeu_si128, _mm_or_si128, _mm_set1_epi32};
    let swizzle = _mm_setr_epi8(2, 1, 0, -1, 6, 5, 4, -1, 10, 9, 8, -1, 14, 13, 12, -1);
    let alpha = _mm_set1_epi32(0xff000000_u32 as i32);
    let blocks = src.len() / 16;
    for i in 0..blocks {
        let offset = i * 16;
        // SAFETY: each block covers exactly 16 bytes of valid input/output.
        let value = _mm_loadu_si128(src.as_ptr().add(offset).cast::<__m128i>());
        let converted = _mm_or_si128(_mm_shuffle_epi8(value, swizzle), alpha);
        _mm_storeu_si128(dst.as_mut_ptr().add(offset).cast::<__m128i>(), converted);
    }
    for (input, output) in src[blocks * 16..].chunks_exact(4)
        .zip(dst[blocks * 16..].chunks_exact_mut(4)) {
        output[0] = input[2]; output[1] = input[1];
        output[2] = input[0]; output[3] = 255;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn reference(source: &[u8]) -> Vec<u8> {
        let mut output = vec![0; source.len()];
        for (input, dst) in source.chunks_exact(4).zip(output.chunks_exact_mut(4)) {
            let a = u16::from(input[3]);
            dst[0] = ((u16::from(input[2]) * a + 127) / 255) as u8;
            dst[1] = ((u16::from(input[1]) * a + 127) / 255) as u8;
            dst[2] = ((u16::from(input[0]) * a + 127) / 255) as u8;
            dst[3] = 0;
        }
        output
    }
    #[test]
    fn opaque_transparent_and_partial_alpha_preserve_old_encoder_math() {
        let input: Vec<u8> = vec![255, 12, 8, 255, 255, 50, 1, 0, 155, 100, 220, 127,
            1, 2, 3, 255, 4, 5, 6, 255, 200, 210, 220, 254, 7, 8, 9, 0];
        let mut actual = vec![0; input.len()];
        rgba_to_bgrx(&input, &mut actual).unwrap();
        assert_eq!(actual, reference(&input));
        assert!(rgba_to_bgrx(&input, &mut actual[1..]).is_err());
    }
    #[test]
    fn randomized_images_match_scalar_reference_including_partial_blocks() {
        let mut seed = 0x12345678_u32;
        for count in [1, 2, 3, 4, 5, 7, 13, 16, 21, 253, 1009] {
            let mut src = vec![0u8; count * 4];
            for byte in &mut src {
                seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
                *byte = seed as u8;
            }
            let mut dst = vec![0; src.len()];
            rgba_to_bgrx(&src, &mut dst).unwrap();
            assert_eq!(dst, reference(&src), "failed for {count} pixels");
        }
    }
    #[test]
    fn decode_bgrx_to_rgba_matches_original_scalar_for_unaligned_sizes() {
        for count in [1, 2, 3, 4, 5, 9, 31, 1009] {
            let input: Vec<u8> = (0..count*4).map(|i|((i*47+193) % 256) as u8).collect();
            let mut actual = vec![0; input.len()];
            bgrx_to_rgba(&input, &mut actual).unwrap();
            for index in 0..count {
                assert_eq!(&actual[4*index..4*index+4],
                    &[input[4*index+2], input[4*index+1], input[4*index], 255]);
            }
        }
    }
    #[test]
    fn conversion_throughput_benchmark_non_gating() {
        let frame = vec![255u8; 1920 * 1080 * 4];
        let mut converted = vec![0u8; frame.len()];
        let start = std::time::Instant::now();
        for _ in 0..32 { rgba_to_bgrx(&frame, &mut converted).unwrap(); }
        let elapsed = start.elapsed().as_secs_f64();
        eprintln!("Huelith 1080p RGBA->BGRX: {:.1} FPS, {:.2} ms/frame (native pixel conversion only)",
            32.0 / elapsed, elapsed * 1000.0 / 32.0);
        // This is a real measurement, not a hardware-dependent pass threshold.
        assert_eq!(converted[3], 0);
    }
}

/// Studio-range BT.709 NV12 for H.264 hardware transforms. The output is
/// top-down Y followed by interleaved 2x2-averaged UV, with no frame-sized
/// temporary allocations. Transparent RGBA pixels are composited over black
/// before YUV conversion, matching the RGB32 native export background.
/// This is a *different* color-conversion path from Media Foundation's RGB32
/// negotiation, so Windows fidelity and throughput must be checked on-device.
fn nv12_rows(src:&[u8],y:&mut [u8],uv:&mut [u8],width:usize){
    #[inline(always)] fn rgb(src:&[u8],offset:usize)->(i32,i32,i32){
        let a=src[offset+3] as i32;
        let mix=|channel:u8|if a==255{channel as i32}else{(channel as i32*a+127)/255};
        (mix(src[offset]),mix(src[offset+1]),mix(src[offset+2]))
    }
    let rows=src.len()/(width*4);
    for row in (0..rows).step_by(2){
        for col in (0..width).step_by(2){
            let offsets=[(row*width+col)*4,(row*width+col+1)*4,
                ((row+1)*width+col)*4,((row+1)*width+col+1)*4];
            let mut sum_r=0;let mut sum_g=0;let mut sum_b=0;
            for (i,&offset) in offsets.iter().enumerate(){
                let (r,g,b)=rgb(src,offset);
                sum_r+=r;sum_g+=g;sum_b+=b;
                let pos=(row+i/2)*width+col+i%2;
                y[pos]=(16+((47*r+157*g+16*b+128)>>8)).clamp(16,235) as u8;
            }
            let (r,g,b)=((sum_r+2)/4,(sum_g+2)/4,(sum_b+2)/4);
            let p=(row/2)*width+col;
            uv[p]=(128+((-26*r-87*g+113*b+128)>>8)).clamp(16,240) as u8;
            uv[p+1]=(128+((112*r-102*g-10*b+128)>>8)).clamp(16,240) as u8;
        }
    }
}

pub(super) fn rgba_to_nv12(src:&[u8],dst:&mut [u8],width:u32,height:u32)->Result<(),&'static str>{
    if width==0||height==0||width%2!=0||height%2!=0{return Err("NV12 dimensions must be even");}
    let pixels=(width as usize).checked_mul(height as usize).ok_or("NV12 dimensions overflow")?;
    if src.len()!=pixels.checked_mul(4).ok_or("RGBA frame overflow")?
        ||dst.len()!=pixels.checked_mul(3).ok_or("NV12 frame overflow")?/2 {
        return Err("RGBA and NV12 buffers have invalid lengths");
    }
    let w=width as usize;
    let (y,uv)=dst.split_at_mut(pixels);
    let pairs=height as usize/2;
    let workers=std::thread::available_parallelism().map(|count|count.get()).unwrap_or(1).min(4).min(pairs);
    // 1080p/4K conversions can use four CPU cores without cloning any pixel
    // data; small frames stay inline to avoid spawning short-lived workers.
    if pixels<1280*720 || workers<=1 {nv12_rows(src,y,uv,w);}
    else {
        let pairs_per=(pairs+workers-1)/workers;
        let source_bytes=pairs_per*w*8;
        let luma_bytes=pairs_per*w*2;
        let chroma_bytes=pairs_per*w;
        std::thread::scope(|scope|{
            for ((source,y_rows),uv_rows) in src.chunks(source_bytes)
                .zip(y.chunks_mut(luma_bytes)).zip(uv.chunks_mut(chroma_bytes)) {
                scope.spawn(move||nv12_rows(source,y_rows,uv_rows,w));
            }
        });
    }
    Ok(())
}

#[cfg(test)] mod nv12_tests {
    use super::*;
    #[test] fn nv12_neutral_black_white_and_transparency(){
        let pixels=[0,0,0,255,255,255,255,255,255,0,0,0,12,34,56,0];
        let mut output=[0u8;6];
        rgba_to_nv12(&pixels,&mut output,2,2).unwrap();
        assert_eq!(output[0],16);
        assert!((output[1] as i16-235).abs()<=1);
        assert_eq!(output[3],16); // transparent pixels are black
        assert_eq!(output.len(),6);
        assert!(rgba_to_nv12(&pixels,&mut output,1,4).is_err());
        assert!(rgba_to_nv12(&pixels,&mut output[..5],2,2).is_err());
    }
    #[test] fn nv12_stride_and_chroma_are_stable(){
        let src:Vec<_>=(0..4*4).flat_map(|i|[i as u8*14,22,53,255]).collect();
        let mut output=vec![0u8;24];
        rgba_to_nv12(&src,&mut output,4,4).unwrap();
        assert_eq!(output.len(),24);
        for row in 0..2 { for col in 0..2 {
            assert!(output[16+row*4+col*2]>=16);
            assert!(output[16+row*4+col*2+1]>=16);
        }}
    }
    #[test] fn nv12_parallel_matches_scalar_at_1080p(){
        let width=1920usize;
        let height=1080usize;
        let src:Vec<u8>=(0..width*height).flat_map(|i|{
            let col=i%width;
            let row=i/width;
            [((col*37+row*7)%256) as u8,((col*3+row*13)%256) as u8,
             ((col*5+row*11)%256) as u8,((i*31)%256) as u8]
        }).collect();
        let mut actual=vec![0u8;width*height*3/2];
        let mut reference=vec![0u8;actual.len()];
        rgba_to_nv12(&src,&mut actual,width as u32,height as u32).unwrap();
        let (y,uv)=reference.split_at_mut(width*height);
        nv12_rows(&src,y,uv,width);
        assert_eq!(actual,reference,"parallel 2x2 chroma blocks must match scalar output exactly");
    }
    #[test] fn nv12_1080p_conversion_throughput_non_gating(){
        let rgba=vec![255u8;1920*1080*4];
        let mut nv12=vec![0u8;1920*1080*3/2];
        let begin=std::time::Instant::now();
        for _ in 0..8 {rgba_to_nv12(&rgba,&mut nv12,1920,1080).unwrap();}
        eprintln!("Huelith CPU NV12 conversion: {:.1} frames/s (not total encoder FPS)",8./begin.elapsed().as_secs_f64());
        assert_eq!(nv12[0],235);
    }
}
