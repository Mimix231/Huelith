// Shared preview/export filter vertices retain floating point values. Manual trilinear sampling
// matches the reference LUT without requiring float32-filterable GPU features.
@group(0) @binding(3) var native_cube: texture_3d<f32>;
fn native_filter(pixel: vec4<f32>) -> vec4<f32> {
    let strength = layer.material.x;
    if (strength <= 0.0 || pixel.a <= 0.0) { return pixel; }
    let value = pixel.rgb * 32.0;
    let base = min(vec3<i32>(floor(value)), vec3<i32>(31));
    let delta = value - vec3<f32>(base);
    // LUT storage is red-major, blue-minor: texture x is blue and z is red.
    let p = base.bgr;
    let c00 = mix(textureLoad(native_cube,p,0).rgb, textureLoad(native_cube,p+vec3<i32>(0,0,1),0).rgb,delta.r);
    let c01 = mix(textureLoad(native_cube,p+vec3<i32>(1,0,0),0).rgb,textureLoad(native_cube,p+vec3<i32>(1,0,1),0).rgb,delta.r);
    let c10 = mix(textureLoad(native_cube,p+vec3<i32>(0,1,0),0).rgb,textureLoad(native_cube,p+vec3<i32>(0,1,1),0).rgb,delta.r);
    let c11 = mix(textureLoad(native_cube,p+vec3<i32>(1,1,0),0).rgb,textureLoad(native_cube,p+vec3<i32>(1,1,1),0).rgb,delta.r);
    let graded = mix(mix(c00,c10,delta.g),mix(c01,c11,delta.g),delta.b);
    return vec4<f32>(round(clamp(mix(pixel.rgb,graded,strength),vec3<f32>(0.0),vec3<f32>(1.0))*255.0)/255.0,pixel.a);
}
