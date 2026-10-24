// Phase K: exact, full-size, premultiplied RGBA reference box kernel.
// Three native GPU compute passes: horizontal -> vertical -> unpremultiply.
// Numeric details mirror cpu_blur; no quality/resolution shortcuts.
struct Parameters {
  count: u32,
  kind: u32,
  amount: f32,
  _padding: u32,
  width: u32,
  height: u32,
  _padding2: u32,
  _padding3: u32,
};
@group(0) @binding(0) var<storage, read> source: array<u32>;
@group(0) @binding(1) var<storage, read_write> destination: array<u32>;
@group(0) @binding(2) var<uniform> params: Parameters;
fn c(v:u32, channel:u32)->u32 { return (v >> (channel * 8u)) & 255u; }
fn make(r:u32,g:u32,b:u32,a:u32)->u32 {return r | (g<<8u) | (b<<16u) | (a<<24u);}
fn premul(v:u32, channel:u32)->u32 {
  if (channel == 3u) {return c(v,3u);}
  return (c(v,channel) * c(v,3u) + 127u) / 255u;
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global: vec3<u32>) {
  let i = global.x;
  if (i >= params.count) { return; }
  let radius = min(u32(max(0.0,round(params.amount))), 80u);
  let x = i % params.width;
  let y = i / params.width;
  if (params.kind == 7u) {
    let pixel=source[i]; let a=c(pixel,3u);
    if (a==0u) {destination[i]=0u;return;}
    // Match CPU's float round on unpremultiplication.
    destination[i]=make(
      u32(clamp(floor(f32(c(pixel,0u))*255.0/f32(a)+0.5),0.0,255.0)),
      u32(clamp(floor(f32(c(pixel,1u))*255.0/f32(a)+0.5),0.0,255.0)),
      u32(clamp(floor(f32(c(pixel,2u))*255.0/f32(a)+0.5),0.0,255.0)),a);
    return;
  }
  var totals=vec4<u32>(0u);
  var count=0u;
  if (params.kind==5u) {
    let lo=x-radius; // guard underflow explicitly below
    let start=select(lo,0u,x<radius);
    let end=min(params.width-1u,x+radius);
    for(var xx=start;xx<=end;xx=xx+1u) {
      let p=source[y*params.width+xx];
      totals=totals+vec4<u32>(premul(p,0u),premul(p,1u),premul(p,2u),premul(p,3u));
      count=count+1u;
    }
  } else {
    let lo=y-radius;
    let start=select(lo,0u,y<radius);
    let end=min(params.height-1u,y+radius);
    for(var yy=start;yy<=end;yy=yy+1u) {
      let p=source[yy*params.width+x];
      totals=totals+vec4<u32>(c(p,0u),c(p,1u),c(p,2u),c(p,3u));
      count=count+1u;
    }
  }
  let v=(totals+vec4<u32>(count/2u))/vec4<u32>(count);
  destination[i]=make(v.x,v.y,v.z,v.w);
}
