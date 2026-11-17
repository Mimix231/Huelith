//! Native classic outline: Euclidean distance from the original alpha silhouette.
//! Uses two linear-time distance-transform passes, matching layer-distance.ts.
//! Effect alpha remains straight (nonpremultiplied) until final compositing.
use serde_json::Value;
const INF:f64=1.0e14;

fn edt_line(cost:&[f64],result:&mut[f64]) {
    let n=cost.len();if n==0{return;}
    let mut sites=Vec::<usize>::with_capacity(n);
    let mut cuts=Vec::<f64>::with_capacity(n+1);
    for q in 0..n {
        let value=cost[q];if value>=INF{continue;}
        let mut cut=f64::NEG_INFINITY;
        while let Some(&p)=sites.last(){
            cut=((value+(q*q) as f64)-(cost[p]+(p*p) as f64))/(2.*(q-p) as f64);
            if cut>*cuts.last().unwrap(){break;}
            sites.pop();cuts.pop();
        }
        if sites.is_empty(){cut=f64::NEG_INFINITY;}
        sites.push(q);cuts.push(cut);
    }
    if sites.is_empty(){result.fill(INF);return;}
    let mut p=0;
    for q in 0..n {
        while p+1<cuts.len()&&cuts[p+1]<(q as f64){p+=1;}
        let delta=q as f64-sites[p] as f64;
        result[q]=delta*delta+cost[sites[p]];
    }
}
fn squared_distance(rgba:&[u8],w:usize,h:usize)->Vec<f64>{
    let mut stage=vec![INF;w*h];let mut result=vec![INF;w*h];
    let mut input=vec![INF;h.max(w)];let mut transformed=vec![INF;h.max(w)];
    for x in 0..w {
        for y in 0..h {input[y]=if rgba[(y*w+x)*4+3]>=15 {0.}else{INF};}
        edt_line(&input[..h],&mut transformed[..h]);
        for y in 0..h {stage[y*w+x]=transformed[y];}
    }
    for y in 0..h {
        input[..w].copy_from_slice(&stage[y*w..(y+1)*w]);
        edt_line(&input[..w],&mut result[y*w..(y+1)*w]);
    }
    result
}
fn color(value:&str)->Result<[u8;3],String>{
    let hex=value.strip_prefix('#').ok_or("Native outline color must be hex")?;
    if hex.len()!=6{return Err("Native outline color must have six digits".into());}
    let n=u32::from_str_radix(hex,16).map_err(|_|"Invalid native outline color")?;
    Ok([(n>>16) as u8,(n>>8) as u8,n as u8])
}
pub fn apply(frame:&mut[u8],w:u32,h:u32,amount:f64,hex:&str,parameters:&Value)->Result<(),String>{
    let (w,h)=(w as usize,h as usize);
    if w==0||h==0||frame.len()!=w*h*4{return Err("Invalid outline surface".into());}
    if !amount.is_finite()||amount<0.||amount>1024.{return Err("Invalid native outline width".into());}
    if amount==0.{return Ok(());}
    let style=parameters.get("outlineStyle").and_then(Value::as_str).unwrap_or("classic");
    if style!="classic"{return styled_alpha(frame,w,h,amount,hex,parameters);}
    let rgba=color(hex)?;
    let opacity=parameters.get("opacity").and_then(Value::as_f64).unwrap_or(100.).clamp(0.,100.)/100.;
    let softness=parameters.get("softness").and_then(Value::as_f64).unwrap_or(0.).clamp(0.,256.);
    let field=squared_distance(frame,w,h);
    for (index,px) in frame.chunks_exact_mut(4).enumerate(){
        let source_alpha=px[3] as f64/255.;if source_alpha>=1.{continue;}
        let distance=field[index].sqrt();
        let coverage=if softness>0. {((amount+softness-distance)/(2.*softness)).clamp(0.,1.)}
            else if distance<=amount {1.}else{0.};
        let halo=coverage*opacity*(1.-source_alpha);
        let total=source_alpha+halo;if total<=0.{continue;}
        for c in 0..3 {px[c]=((px[c] as f64*source_alpha+rgba[c] as f64*halo)/total).round().clamp(0.,255.) as u8;}
        px[3]=(total*255.).round().clamp(0.,255.) as u8;
    }
    Ok(())
}

fn styled_alpha(frame:&mut[u8],w:usize,h:usize,radius:f64,hex:&str,p:&Value)->Result<(),String>{
    let style=p.get("outlineStyle").and_then(Value::as_str).unwrap_or("classic");
    if !matches!(style,"neon"|"soft"|"double"|"gradient"|"electric"){return Err(format!("Unknown outline style: {style}"));}
    let secondary=color(p.get("secondaryColor").and_then(Value::as_str).unwrap_or("#8257ff"))?;let color=color(hex)?;
    let value=|key:&str,base:f64,limit:f64|p.get(key).and_then(Value::as_f64).unwrap_or(base).clamp(0.,limit);
    let (radius,softness,gap,second,opacity)=(radius.clamp(0.,120.),value("softness",8.,90.),
        value("outlineGap",3.,200.),value("secondaryWidth",4.,200.),value("opacity",96.,100.)/100.);
    let foreground:Vec<bool>=frame.chunks_exact(4).map(|px|px[3]>40).collect();
    let mut distance:Vec<f32>=foreground.iter().map(|&inside|if inside{0.}else{65_535.}).collect();
    let d=std::f32::consts::SQRT_2;
    for y in 0..h{for x in 0..w{let i=y*w+x;
        if x>0{distance[i]=distance[i].min(distance[i-1]+1.);}
        if y>0{distance[i]=distance[i].min(distance[i-w]+1.);}
        if x>0&&y>0{distance[i]=distance[i].min(distance[i-w-1]+d);}
        if x+1<w&&y>0{distance[i]=distance[i].min(distance[i-w+1]+d);}
    }}
    for y in (0..h).rev(){for x in (0..w).rev(){let i=y*w+x;
        if x+1<w{distance[i]=distance[i].min(distance[i+1]+1.);}
        if y+1<h{distance[i]=distance[i].min(distance[i+w]+1.);}
        if x+1<w&&y+1<h{distance[i]=distance[i].min(distance[i+w+1]+d);}
        if x>0&&y+1<h{distance[i]=distance[i].min(distance[i+w-1]+d);}
    }}
    for (i,px) in frame.chunks_exact_mut(4).enumerate(){
        let a=px[3] as f64/255.;let distance=distance[i] as f64;
        let mut ring=0.;let mut tint=color;
        if !foreground[i]{
            let core=if distance<=radius{1.}else{0.};
            let glow=if softness>0.{(-2.*((distance-radius).max(0.)/softness).powi(2)).exp()}else{0.};
            let second_start=radius+gap;
            let stripe=if matches!(style,"double"|"neon"|"electric"|"gradient"){
                (distance-second_start+1.).min(second_start+second-distance).clamp(0.,1.)}else{0.};
            let bloom=if matches!(style,"neon"|"soft"|"electric"){
                (-((distance-radius).max(0.)/(softness*if style=="soft"{2.}else{1.5}).max(1.)).powi(2)).exp()*0.38}else{0.};
            let flicker=if style=="electric"{0.55+0.45*(i as f64*0.013+distance*1.8).sin()}else{1.};
            ring=((core*if style=="soft"{0.53}else{0.92}+glow*0.3+stripe*0.85+bloom)*opacity*flicker).clamp(0.,1.);
            if ring<=0.005{ring=0.;}else{ring=(ring*255.).round()/255.;}
            if stripe>0.35||style=="gradient"&&distance>radius*0.55{tint=secondary;}
        }
        // The reference draws source -> ring -> source, preserving antialiased
        // glyph coverage and its exact neon/secondary stroke appearance.
        let behind=a+ring*(1.-a);let alpha=a+behind*(1.-a);
        if alpha>0.{for ch in 0..3{
            let under=px[ch] as f64*a*(1.-ring)+tint[ch] as f64*ring;
            px[ch]=((px[ch] as f64*a+under*(1.-a))/alpha).round().clamp(0.,255.) as u8;
        }}
        px[3]=(alpha*255.).round() as u8;
    }
    Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test]fn styled_outlines_match_authoring_canvas_golden_pixels(){
        let source=image::load_from_memory(include_bytes!("../../../../tests/fixtures/native-outline/source.png")).unwrap().to_rgba8();
        let cases:[(&str,&[u8]);5]=[
            ("neon",include_bytes!("../../../../tests/fixtures/native-outline/neon.png")),
            ("soft",include_bytes!("../../../../tests/fixtures/native-outline/soft.png")),
            ("double",include_bytes!("../../../../tests/fixtures/native-outline/double.png")),
            ("gradient",include_bytes!("../../../../tests/fixtures/native-outline/gradient.png")),
            ("electric",include_bytes!("../../../../tests/fixtures/native-outline/electric.png")),
        ];
        for (style,bytes) in cases{
            let mut actual=source.clone().into_raw();
            let expected=image::load_from_memory(bytes).unwrap().to_rgba8();
            let p=serde_json::json!({"outlineStyle":style,"silhouetteMode":"alpha","softness":4.,
                "opacity":96.,"outlineGap":2.,"secondaryWidth":2.,"secondaryColor":"#efc9ff"});
            apply(&mut actual,64,36,3.,"#b579ff",&p).unwrap();
            for (i,(a,b)) in actual.chunks_exact(4).zip(expected.chunks_exact(4)).enumerate(){
                assert!((a[3] as i32-b[3] as i32).abs()<=1,"{style}: alpha differs at {i}: native {} vs canvas {}",a[3],b[3]);
                for c in 0..3{
                    let premult=|p:&[u8]|(p[c] as f64*p[3] as f64/255.).round() as i32;
                    assert!((premult(a)-premult(b)).abs()<=2,"{style}: visible color differs at {i}");
                }
            }
        }
    }
    #[test]fn outline_uses_alpha_not_full_frame(){
        let mut data=vec![0;5*5*4];data[(2*5+2)*4..(2*5+2)*4+4].copy_from_slice(&[255,0,0,255]);
        apply(&mut data,5,5,1.,"#00ff00",&Value::Null).unwrap();
        assert_eq!(&data[(2*5+2)*4..(2*5+2)*4+4],&[255,0,0,255]);
        assert_eq!(&data[(2*5+1)*4..(2*5+1)*4+4],&[0,255,0,255]);
        assert_eq!(&data[..4],&[0,0,0,0]);
    }
    #[test]fn zero_amount_is_identity(){
        let mut data=vec![0,0,0,0,1,2,3,255];let before=data.clone();
        apply(&mut data,2,1,0.,"#ffffff",&Value::Null).unwrap();assert_eq!(data,before);
    }
}
