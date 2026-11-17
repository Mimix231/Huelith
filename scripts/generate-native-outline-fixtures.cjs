/** Golden pixels from the real authoring renderer, including antialiased alpha.
 * Run only when intentionally reviewing changes to the reference outline math.
 * Native tests compare premultiplied colors, allowing Canvas8 quantization.
 */
const fs=require('node:fs'),path=require('node:path');
const {Canvas}=require('skia-canvas'),{buildSync}=require('esbuild');
const root=path.resolve(__dirname,'..');
global.document={createElement:()=>new Canvas(1,1)};
const code=buildSync({stdin:{contents:"export {renderSubjectOutline} from './src/editor/subject-outline';",
  resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const api={exports:{}};
new Function('module','exports','require',code)(api,api.exports,require);
async function main(){
  const input=()=>{
    const source=new Canvas(64,36),ctx=source.getContext('2d');
    ctx.fillStyle='#ece6ff';ctx.fillRect(21,12,12,10);
    ctx.fillStyle='#b579ff80';ctx.fillRect(33,12,3,10);
    ctx.fillStyle='#cec3ef19';ctx.fillRect(36,12,2,10);
    return source;
  };
  const dir=path.join(root,'tests/fixtures/native-outline');fs.mkdirSync(dir,{recursive:true});
  await fs.promises.writeFile(path.join(dir,'source.png'),await input().toBuffer('png'));
  for(const style of ['neon','soft','double','gradient','electric']){
    const result=api.exports.renderSubjectOutline(input(),{kind:'outline',amount:3,color:'#b579ff',
      parameters:{outlineStyle:style,silhouetteMode:'alpha',softness:4,opacity:96,
        outlineGap:2,secondaryWidth:2,secondaryColor:'#efc9ff'}});
    await fs.promises.writeFile(path.join(dir,style+'.png'),await result.toBuffer('png'));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
