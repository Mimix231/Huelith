async page => page.evaluate(async () => {
  const e=await import('/src/editor/types.ts'),a=await import('/src/editor/animation.ts');
  const {newEffect}=await import('/src/editor/fx.ts');
  const {writeProjectFile}=await import('/src/editor/files.ts');
  const {recordRecentProject}=await import('/src/editor/project-hub.ts');
  const doc=e.createDocument('Animation timing QA',320,180,'#161c30');
  const ink=e.makeVector('Persistent vector and text');
  const shape={id:e.uid(),kind:'rect',x:25,y:60,width:85,height:78,fill:'#f16844',stroke:'none',strokeWidth:0};
  const title={id:e.uid(),kind:'text',x:25,y:15,width:270,height:35,fill:'#ffffff',stroke:'none',strokeWidth:0,text:'Huelith: held cels',fontSize:22,fontFamily:'sans-serif'};
  ink.shapes=[shape,title];doc.layers=[ink];doc.activeLayerId=ink.id;a.enableAnimation(doc,10);
  a.insertFrame(doc,true);a.holdLayer(doc,1,ink.id);
  a.insertFrame(doc,false);doc.layers[0].shapes=[{...shape,id:e.uid(),x:190,fill:'#29b9bc'},title];a.syncActiveCel(doc);
  a.setTrackEffects(doc,ink.id,[newEffect('exposure',30),newEffect('outline',3),newEffect('glow',7)]);
  [100,300,200].forEach((ms,i)=>doc.animation.frames[i].durationMs=ms);a.selectFrame(doc,0);
  if(!e.isDocument(doc))throw Error('Animation QA fixture is invalid');
  const path='E:\\ChatGPTProjects\\Huelith\\output\\stage-dg\\animation-fixture.huelith';
  await writeProjectFile(path,new TextEncoder().encode(JSON.stringify(doc,null,2)));await recordRecentProject(doc,path);
  window.__animationQaDocument=doc;
  return {path,frames:doc.animation.frames.map(f=>({durationMs:f.durationMs,holds:f.holdFrom})),effects:doc.animation.trackEffects[ink.id].map(f=>f.kind)};
})
