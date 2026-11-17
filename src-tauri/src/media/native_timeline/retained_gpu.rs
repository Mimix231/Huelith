//! Production GPU composition. Resources belong to one timeline render thread.
//! Sources and output remain full resolution; only the encoder's final RGBA
//! transfer returns to CPU. No JSON pixel arrays or WebView round trips.
use std::{collections::{HashMap,HashSet},sync::Arc};

#[derive(Clone)]
pub(super) struct Layer {
    pub id:String,pub width:u32,pub height:u32,pub pixels:Arc<Vec<u8>>,
    pub geometry:[f32;20],pub filter:Option<Filter>,
}
#[derive(Clone)]
pub(super) struct Filter {pub key:String,pub cube:Arc<Vec<[f32;4]>>,pub strength:f32}

struct Texture {
    texture:wgpu::Texture,uniform:wgpu::Buffer,group:wgpu::BindGroup,
    pixels:Arc<Vec<u8>>,size:(u32,u32),filter_key:String,
}
pub(super) struct Renderer {
    device:wgpu::Device,queue:wgpu::Queue,pipeline:wgpu::RenderPipeline,
    sampler:wgpu::Sampler,output:wgpu::Texture,download:wgpu::Buffer,
    width:u32,height:u32,stride:u32,layers:HashMap<String,Texture>,
    cubes:HashMap<String,wgpu::Texture>,pub adapter:String,
}
impl Renderer {
    pub fn new(width:u32,height:u32)->Result<Self,String>{
        pollster::block_on(async {
            let instance=wgpu::Instance::default();
            let adapter=instance.request_adapter(&wgpu::RequestAdapterOptions{
                power_preference:wgpu::PowerPreference::HighPerformance,
                compatible_surface:None,force_fallback_adapter:false,
            }).await.ok_or("No hardware video adapter")?;
            let info=adapter.get_info();
            if info.device_type==wgpu::DeviceType::Cpu{return Err("Only a software GPU is available".into());}
            let (device,queue)=adapter.request_device(&wgpu::DeviceDescriptor{
                label:Some("Huelith production timeline"),required_features:wgpu::Features::empty(),
                required_limits:wgpu::Limits::downlevel_defaults().using_resolution(adapter.limits()),
            },None).await.map_err(|e|e.to_string())?;
            device.push_error_scope(wgpu::ErrorFilter::Validation);
            let source=include_str!("../../../../src/editor/video/gpu/composite.wgsl")
                .replace("mask_flags: vec4<f32>,", "mask_flags: vec4<f32>,\n    material: vec4<f32>,")
                .replace("let color = textureSample(layer_texture, layer_sampler, uv);",
                    "let color = native_filter(textureSample(layer_texture, layer_sampler, uv));");
            let shader=device.create_shader_module(wgpu::ShaderModuleDescriptor{
                label:Some("Huelith production composition and color"),
                source:wgpu::ShaderSource::Wgsl(format!("{source}\n{}",include_str!("../../../../src/editor/video/gpu/color-filter.wgsl")).into()),
            });
            let layout=device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor{
                label:Some("Huelith retained layer"),entries:&[
                    wgpu::BindGroupLayoutEntry{binding:0,visibility:wgpu::ShaderStages::FRAGMENT,
                        ty:wgpu::BindingType::Texture{sample_type:wgpu::TextureSampleType::Float{filterable:true},
                            view_dimension:wgpu::TextureViewDimension::D2,multisampled:false},count:None},
                    wgpu::BindGroupLayoutEntry{binding:1,visibility:wgpu::ShaderStages::FRAGMENT,
                        ty:wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),count:None},
                    wgpu::BindGroupLayoutEntry{binding:2,visibility:wgpu::ShaderStages::VERTEX_FRAGMENT,
                        ty:wgpu::BindingType::Buffer{ty:wgpu::BufferBindingType::Uniform,has_dynamic_offset:false,min_binding_size:None},count:None},
                    wgpu::BindGroupLayoutEntry{binding:3,visibility:wgpu::ShaderStages::FRAGMENT,
                        ty:wgpu::BindingType::Texture{sample_type:wgpu::TextureSampleType::Float{filterable:false},
                            view_dimension:wgpu::TextureViewDimension::D3,multisampled:false},count:None},
                ],
            });
            let pipeline_layout=device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor{
                label:None,bind_group_layouts:&[&layout],push_constant_ranges:&[],
            });
            let pipeline=device.create_render_pipeline(&wgpu::RenderPipelineDescriptor{
                label:Some("Huelith export render pass"),layout:Some(&pipeline_layout),
                vertex:wgpu::VertexState{module:&shader,entry_point:"vertex_main",buffers:&[]},
                fragment:Some(wgpu::FragmentState{module:&shader,entry_point:"fragment_main",targets:&[Some(wgpu::ColorTargetState{
                    format:wgpu::TextureFormat::Rgba8Unorm,blend:Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),write_mask:wgpu::ColorWrites::ALL,
                })]}),primitive:wgpu::PrimitiveState::default(),depth_stencil:None,
                multisample:wgpu::MultisampleState::default(),multiview:None,
            });
            let sampler=device.create_sampler(&wgpu::SamplerDescriptor{
                mag_filter:wgpu::FilterMode::Linear,min_filter:wgpu::FilterMode::Linear,..Default::default()
            });
            let output=device.create_texture(&wgpu::TextureDescriptor{
                label:Some("Retained full resolution export target"),
                size:wgpu::Extent3d{width,height,depth_or_array_layers:1},mip_level_count:1,sample_count:1,
                dimension:wgpu::TextureDimension::D2,format:wgpu::TextureFormat::Rgba8Unorm,
                usage:wgpu::TextureUsages::RENDER_ATTACHMENT|wgpu::TextureUsages::COPY_SRC,view_formats:&[],
            });
            let stride=(width*4+255)&!255;
            let download=device.create_buffer(&wgpu::BufferDescriptor{
                label:Some("Retained encoder readback"),size:stride as u64*height as u64,
                usage:wgpu::BufferUsages::MAP_READ|wgpu::BufferUsages::COPY_DST,mapped_at_creation:false,
            });
            let mut renderer=Self{device,queue,pipeline,sampler,output,download,width,height,stride,
                layers:HashMap::new(),cubes:HashMap::new(),adapter:info.name};
            renderer.cube("",&[[0.,0.,0.,1.]],1);
            if let Some(error)=renderer.device.pop_error_scope().await{return Err(error.to_string());}
            Ok(renderer)
        })
    }
    fn cube(&mut self,key:&str,data:&[[f32;4]],size:u32){
        if self.cubes.contains_key(key){return;}
        let texture=self.device.create_texture(&wgpu::TextureDescriptor{
            label:Some("Native float color cube"),size:wgpu::Extent3d{width:size,height:size,depth_or_array_layers:size},
            mip_level_count:1,sample_count:1,dimension:wgpu::TextureDimension::D3,format:wgpu::TextureFormat::Rgba32Float,
            usage:wgpu::TextureUsages::TEXTURE_BINDING|wgpu::TextureUsages::COPY_DST,view_formats:&[],
        });
        self.queue.write_texture(texture.as_image_copy(),bytemuck::cast_slice(data),
            wgpu::ImageDataLayout{offset:0,bytes_per_row:Some(size*16),rows_per_image:Some(size)},texture.size());
        self.cubes.insert(key.to_owned(),texture);
    }
    pub fn render(&mut self,layers:&[Layer],background:[u8;3])->Result<Vec<u8>,String>{
        if layers.len()>24{return Err("Too many GPU layers".into());}
        let bytes:usize=layers.iter().map(|l|l.pixels.len()).sum();
        if bytes>256*1024*1024{return Err("Scene exceeds the retained GPU source budget".into());}
        for layer in layers {
            if layer.width==0||layer.height==0||layer.width>self.device.limits().max_texture_dimension_2d||
                layer.height>self.device.limits().max_texture_dimension_2d||
                layer.pixels.len()!=layer.width as usize*layer.height as usize*4 {
                return Err("Invalid or oversized GPU source".into());
            }
        }
        self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        let result=self.render_inner(layers,background);
        let validation=pollster::block_on(self.device.pop_error_scope());
        if let Some(error)=validation{return Err(error.to_string());}
        result
    }
    fn render_inner(&mut self,layers:&[Layer],background:[u8;3])->Result<Vec<u8>,String>{
        let visible:HashSet<_>=layers.iter().map(|l|l.id.as_str()).collect();
        self.layers.retain(|id,_|visible.contains(id.as_str()));
        // Retain only the visible/lookahead graph's cubes, bounding long edits.
        let keys:HashSet<_>=layers.iter().filter_map(|l|l.filter.as_ref().map(|f|f.key.as_str())).collect();
        self.cubes.retain(|key,_|key.is_empty()||keys.contains(key.as_str()));
        for layer in layers {
            let filter_key=layer.filter.as_ref().map(|f|f.key.as_str()).unwrap_or("");
            if let Some(filter)=&layer.filter {self.cube(&filter.key,&filter.cube,33);}
            if self.layers.get(&layer.id).is_some_and(|old|old.size!=(layer.width,layer.height)||old.filter_key!=filter_key){
                self.layers.remove(&layer.id);
            }
            if !self.layers.contains_key(&layer.id){
                let texture=self.device.create_texture(&wgpu::TextureDescriptor{
                    label:Some("Retained source texture"),size:wgpu::Extent3d{width:layer.width,height:layer.height,depth_or_array_layers:1},
                    mip_level_count:1,sample_count:1,dimension:wgpu::TextureDimension::D2,format:wgpu::TextureFormat::Rgba8Unorm,
                    usage:wgpu::TextureUsages::TEXTURE_BINDING|wgpu::TextureUsages::COPY_DST,view_formats:&[],
                });
                let uniform=self.device.create_buffer(&wgpu::BufferDescriptor{label:None,size:96,
                    usage:wgpu::BufferUsages::UNIFORM|wgpu::BufferUsages::COPY_DST,mapped_at_creation:false});
                let view=texture.create_view(&Default::default());
                let cube=self.cubes[filter_key].create_view(&Default::default());
                let group=self.device.create_bind_group(&wgpu::BindGroupDescriptor{
                    label:None,layout:&self.pipeline.get_bind_group_layout(0),entries:&[
                        wgpu::BindGroupEntry{binding:0,resource:wgpu::BindingResource::TextureView(&view)},
                        wgpu::BindGroupEntry{binding:1,resource:wgpu::BindingResource::Sampler(&self.sampler)},
                        wgpu::BindGroupEntry{binding:2,resource:uniform.as_entire_binding()},
                        wgpu::BindGroupEntry{binding:3,resource:wgpu::BindingResource::TextureView(&cube)},
                    ],
                });
                self.layers.insert(layer.id.clone(),Texture{texture,uniform,group,
                    pixels:Arc::new(Vec::new()),size:(layer.width,layer.height),filter_key:filter_key.into()});
            }
            let retained=self.layers.get_mut(&layer.id).unwrap();
            if !Arc::ptr_eq(&retained.pixels,&layer.pixels){
                self.queue.write_texture(retained.texture.as_image_copy(),&layer.pixels,
                    wgpu::ImageDataLayout{offset:0,bytes_per_row:Some(layer.width*4),rows_per_image:Some(layer.height)},retained.texture.size());
                retained.pixels=Arc::clone(&layer.pixels);
            }
            let mut parameters=[0f32;24];parameters[..20].copy_from_slice(&layer.geometry);
            parameters[20]=layer.filter.as_ref().map(|f|f.strength).unwrap_or(0.);
            self.queue.write_buffer(&retained.uniform,0,bytemuck::cast_slice(&parameters));
        }
        let view=self.output.create_view(&Default::default());
        let mut encoder=self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor{label:Some("Production timeline frame")});
        {
            let mut pass=encoder.begin_render_pass(&wgpu::RenderPassDescriptor{
                label:Some("Compose every visual layer"),color_attachments:&[Some(wgpu::RenderPassColorAttachment{
                    view:&view,resolve_target:None,ops:wgpu::Operations{
                        load:wgpu::LoadOp::Clear(wgpu::Color{r:background[0] as f64/255.,g:background[1] as f64/255.,b:background[2] as f64/255.,a:1.}),
                        store:wgpu::StoreOp::Store,
                    },
                })],depth_stencil_attachment:None,occlusion_query_set:None,timestamp_writes:None,
            });
            pass.set_pipeline(&self.pipeline);
            for layer in layers {pass.set_bind_group(0,&self.layers[&layer.id].group,&[]);pass.draw(0..6,0..1);}
        }
        encoder.copy_texture_to_buffer(self.output.as_image_copy(),wgpu::ImageCopyBuffer{
            buffer:&self.download,layout:wgpu::ImageDataLayout{offset:0,bytes_per_row:Some(self.stride),rows_per_image:Some(self.height)},
        },self.output.size());
        self.queue.submit(Some(encoder.finish()));
        let slice=self.download.slice(..);let (tx,rx)=std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read,move|result|{let _=tx.send(result);});
        self.device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|_|"GPU readback closed")?.map_err(|e|e.to_string())?;
        let map=slice.get_mapped_range();let mut pixels=Vec::with_capacity(self.width as usize*self.height as usize*4);
        for row in map.chunks_exact(self.stride as usize){pixels.extend_from_slice(&row[..self.width as usize*4]);}
        drop(map);self.download.unmap();
        Ok(pixels)
    }
}
