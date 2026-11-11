import type {AppearanceMode,Workspace} from '../editor/types';

type Palette = readonly [accent:string,ground:string,paper:string];
type ThemeIdentity = {
  name:string;
  subtitle:string;
  glyph:string;
  radius:number;
  light:Palette;
  dark:Palette;
};

export const THEME_IDENTITIES:Record<Workspace,ThemeIdentity> = {
  glass:{name:'Spectrum Glass',subtitle:'Frosted slate and lavender light',glyph:'✧',radius:12,
    light:['#5546a8','#eceff9','#f9faff'],dark:['#c3b7ff','#14172a','#24283e']},
  material:{name:'Material You',subtitle:'Soft graphite and mauve',glyph:'◆',radius:18,
    light:['#6750a4','#efe9f5','#f9f5fc'],dark:['#d4b8ff','#1d1925','#2c2638']},
  classic:{name:'Classic Desktop',subtitle:'Pearl panels and navy insets',glyph:'▦',radius:3,
    light:['#335c91','#e2e6ed','#f4f5f7'],dark:['#bbd8f5','#191d27','#292e38']},
  midnight:{name:'Spectrum Midnight',subtitle:'Ink blue and periwinkle',glyph:'☾',radius:6,
    light:['#3158a4','#e7eefc','#f6f9ff'],dark:['#9ab1ff','#101726','#1c2742']},
  studio:{name:'Spectrum Studio',subtitle:'Charcoal and cool cyan',glyph:'▥',radius:5,
    light:['#176779','#e7eff0','#f6faf9'],dark:['#8bd5df','#141d22','#253238']},
  strawberry:{name:'Strawberry',subtitle:'Berry milk and raspberry',glyph:'♥',radius:14,
    light:['#a52c54','#f8e6ed','#fff8fb'],dark:['#ff92b8','#2a1723','#3d2637']},
  melon:{name:'Melon',subtitle:'Celadon and jade',glyph:'◈',radius:12,
    light:['#126d56','#e4f2e9','#f6fcf8'],dark:['#7de2b5','#152921','#244035']},
  peach:{name:'Peach',subtitle:'Blush and toasted coral',glyph:'✦',radius:16,
    light:['#a94b38','#fae8de','#fff7f1'],dark:['#ffb397','#2b1f1f','#412f2c']},
  lemon:{name:'Lemon',subtitle:'Ivory and sharp ochre',glyph:'☼',radius:5,
    light:['#796000','#f7f0ce','#fffcec'],dark:['#f7d873','#28261a','#393521']},
  mango:{name:'Mango',subtitle:'Cinnamon and saffron',glyph:'✺',radius:10,
    light:['#a15016','#f9e8cc','#fff7e8'],dark:['#ffbb69','#2a2018','#433124']},
  sakura:{name:'Sakura',subtitle:'Petal pink and wine',glyph:'❀',radius:13,
    light:['#8f3f71','#f6e6ef','#fff7fb'],dark:['#e6a7ce','#291b2b','#3a283e']},
  blossom:{name:'Blossom',subtitle:'Plum and lilac',glyph:'✿',radius:15,
    light:['#6a419d','#eee5f7','#fbf7ff'],dark:['#c7afff','#251c34','#392943']},
  shadow:{name:'Shadow',subtitle:'Quiet ink and pewter',glyph:'◐',radius:4,
    light:['#54556b','#e8e8ed','#f6f6f9'],dark:['#bfc1d7','#171821','#252630']},
  forest:{name:'Forest',subtitle:'Pine, moss and antique gold',glyph:'❧',radius:9,
    light:['#3c6236','#e9eedf','#f6f8ed'],dark:['#c5da8d','#101d18','#21342a']},
  ember:{name:'Ember',subtitle:'Espresso and brushed copper',glyph:'✷',radius:7,
    light:['#9c451f','#f3e5da','#fff4ea'],dark:['#ffa877','#201613','#3b2822']},
  blueprint:{name:'Blueprint',subtitle:'Indigo and drafting cyan',glyph:'⊞',radius:3,
    light:['#215b96','#e4edf8','#f4f8fe'],dark:['#82dafa','#101b34','#1b2d4b']},
  porcelain:{name:'Porcelain',subtitle:'Warm enamel and cobalt',glyph:'◇',radius:15,
    light:['#305b9f','#eeeae0','#fffdf5'],dark:['#aac5ff','#1e2027','#2f3442']},
};

export const THEME_COLLECTIONS:readonly {name:string;themes:readonly Workspace[]}[] = [
  {name:'Workspace originals',themes:['glass','material','classic','midnight','studio']},
  {name:'Colorful collection',themes:['strawberry','melon','peach','lemon','mango','sakura','blossom','shadow']},
  {name:'Workshop collection',themes:['forest','ember','blueprint','porcelain']},
];

export function isWorkspace(value:unknown):value is Workspace {
  return typeof value==='string'&&Object.hasOwn(THEME_IDENTITIES,value);
}

export function themeVariables(workspace:Workspace,tone:AppearanceMode) {
  const {radius,[tone]:[accent,ground,paper]}=THEME_IDENTITIES[workspace];
  return {
    '--theme-accent':accent,'--theme-ground':ground,'--theme-paper':paper,
    '--theme-radius':`${radius}px`,
  };
}
