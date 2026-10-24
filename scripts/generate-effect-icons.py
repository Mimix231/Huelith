#!/usr/bin/env python3
"""Generate checked-in semantic SVG icons. Run explicitly; production never generates assets."""
from pathlib import Path
import re, hashlib
root=Path(__file__).resolve().parents[1]
catalog=(root/'src/editor/effect-catalog.ts').read_text()
filter_names=re.findall(r"kind: '([a-z]+)', label: '([^']+)'",catalog)
fx_names=['Hyper Outline','Neon Pulse','Shadow Forge','Dream Bloom','Glitch Matrix','Comic Pop','Frostbite','Ember Glow','Prism Split','Golden Hour','Aurora Flow','Electric Edge','Holographic','Retro Vision','Spectrum Burst']
# Explicit pictogram families chosen for visual semantics, not arbitrary reused stars.
icons={
 'brightness':'sun','contrast':'yin','saturate':'drops','hue':'rainbow','grayscale':'mono','sepia':'hourglass','invert':'swap','exposure':'camera','highlights':'sunrise','shadows':'moon',
 'whites':'spark','blacks':'eclipse','temperature':'thermometer','tint':'balance','vibrance':'petals','gamma':'gamma','curves':'chart','levels':'histogram',
 'balance':'balance','selective':'target','mixer':'channels','gradientmap':'gradient','duotone':'duotone','solarize':'halfmoon',
 'blur':'blur','boxblur':'box','motionblur':'arrows','radialblur':'rings','zoomblur':'zoom','lensblur':'aperture','surfaceblur':'layers',
 'sharpen':'sharp','unsharp':'diamond','highpass':'line','clarity':'diamond','texture':'texture','denoise':'dissolve','grain':'dots',
 'noise':'scatter','emboss':'cube','edges':'outline','pixelate':'pixel','halftone':'dots','dither':'checker','vignette':'vignette',
 'aurora':'aurora','burst':'rays','posterize':'steps','cartoon':'comic','comicink':'ink','oilpaint':'brush','watercolor':'drops',
 'sketch':'pencil','ink':'pen','neonedge':'neon','chromatic':'channels','glitch':'glitch','vhs':'tape','crt':'monitor','mosaic':'tiles',
 'swirl':'swirl','ripple':'rings','wave':'wave','glass':'prism','frosted':'snow','cutout':'scissors','outline':'outline','glow':'neon','shadow':'layers','backdrop':'frame',
 'Hyper Outline':'outline','Neon Pulse':'neon','Shadow Forge':'layers','Dream Bloom':'petals','Glitch Matrix':'glitch',
 'Comic Pop':'comic','Frostbite':'snow','Ember Glow':'flame','Prism Split':'prism','Golden Hour':'sunrise','Aurora Flow':'aurora',
 'Electric Edge':'bolt','Holographic':'rainbow','Retro Vision':'monitor','Spectrum Burst':'rays',
}
# All icons are vector, not emoji/font dependent. Each gets a meaningful motif and distinct detail arrangement.
patterns={
 'sun':'<circle cx="24" cy="24" r="8"/><path d="M24 7v6m0 22v6M7 24h6m22 0h6M12 12l5 5m14 14 5 5m0-24-5 5m-14 14-5 5"/>',
 'yin':'<path d="M24 8a16 16 0 1 0 0 32a8 8 0 0 0 0-16a8 8 0 0 1 0-16Z"/><circle cx="24" cy="16" r="2"/>',
 'drops':'<path d="M17 11C12 20 9 23 9 28a8 8 0 0 0 16 0c0-5-3-8-8-17Zm15 2c-3 5-5 8-5 11a6 6 0 0 0 12 0c0-3-2-6-7-11Z"/>',
 'rainbow':'<path d="M7 33a17 17 0 0 1 34 0M13 33a11 11 0 0 1 22 0M19 33a5 5 0 0 1 10 0"/>',
 'mono':'<circle cx="24" cy="24" r="15"/><path d="M24 9v30M24 10a14 14 0 0 1 0 28Z"/>',
 'hourglass':'<path d="M13 9h22M13 39h22M16 10c0 10 16 10 16 14s-16 6-16 14m16-28c0 10-16 10-16 14s16 6 16 14"/>',
 'swap':'<path d="m8 18 11-9v6h20M40 30l-11 9v-6H9"/>',
 'camera':'<rect x="8" y="15" width="32" height="23" rx="5"/><circle cx="24" cy="26" r="8"/><path d="M15 15l3-5h12l3 5"/>',
 'sunrise':'<path d="M8 32h32M14 26a10 10 0 0 1 20 0M24 7v8M8 16l5 5m27-5-5 5"/>',
 'moon':'<path d="M32 9a16 16 0 1 0 7 22 16 16 0 0 1-7-22Z"/>',
 'spark':'<path d="m24 7 4 13 13 4-13 4-4 13-4-13-13-4 13-4Z"/>',
 'eclipse':'<circle cx="21" cy="24" r="13"/><circle cx="28" cy="22" r="12"/><path d="M10 10h4m21 27h4"/>',
 'thermometer':'<path d="M19 28V12a5 5 0 0 1 10 0v16a9 9 0 1 1-10 0Z"/><path d="M24 18v17"/>',
 'balance':'<path d="M24 9v31M12 17h24M15 17l-7 13h14l-7-13Zm18 0-7 13h14l-7-13Z"/>',
 'petals':'<path d="M24 23C7 7 13 3 24 17c11-14 17-10 0 6 19-5 18 5 0 5 2 18-8 18-5 0-18 5-19-5 0-5Z"/>',
 'gamma':'<path d="M10 12h28M24 12v25M38 12c-12 16-13 21-14 25"/>',
 'chart':'<path d="M8 8v32h32M11 36C20 36 17 9 28 15s3 23 14 6"/>',
 'histogram':'<path d="M7 38V24h6v14M17 38V11h6v27M27 38V18h6v20M37 38V28h4v10M7 40h34"/>',
 'target':'<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="9"/><path d="M24 4v14m0 12v14M4 24h14m12 0h14"/>',
 'channels':'<path d="M7 16h34M7 24h34M7 32h34"/><circle cx="17" cy="16" r="3"/><circle cx="28" cy="24" r="3"/><circle cx="35" cy="32" r="3"/>',
 'gradient':'<rect x="7" y="12" width="34" height="23" rx="3" fill="url(#grad)"/><circle cx="14" cy="38" r="3"/><circle cx="27" cy="38" r="3"/><circle cx="38" cy="38" r="3"/>',
 'duotone':'<rect x="9" y="10" width="30" height="28" rx="3"/><path d="M9 10l30 28"/>',
 'halfmoon':'<circle cx="24" cy="24" r="15"/><path d="M9 24h30M24 9v30"/>',
 'blur':'<circle cx="24" cy="24" r="12" opacity=".2"/><circle cx="24" cy="24" r="9" opacity=".45"/><circle cx="24" cy="24" r="5"/>',
 'box':'<rect x="9" y="9" width="30" height="30" rx="2"/><path d="M14 14h20v20H14Z"/>',
 'arrows':'<path d="M8 14h22l-5-5m5 5-5 5M14 25h26l-6-5m6 5-6 5M8 35h18l-5-5m5 5-5 5"/>',
 'rings':'<circle cx="24" cy="24" r="5"/><circle cx="24" cy="24" r="11"/><circle cx="24" cy="24" r="17"/>',
 'zoom':'<circle cx="20" cy="20" r="11"/><path d="m29 29 11 11M17 20h7m-3-4v8"/>',
 'aperture':'<circle cx="24" cy="24" r="16"/><path d="m24 8 8 16-8 16-8-16 8-16ZM9 18h18m-10 19 14-23"/>',
 'layers':'<path d="m24 8 17 10-17 10L7 18Zm-17 17 17 10 17-10M7 32l17 10 17-10"/>',
 'sharp':'<path d="m8 35 15-25 7 16 9-14M8 35h32"/>',
 'diamond':'<path d="M24 7 41 24 24 41 7 24Z"/><path d="M24 7v34M7 24h34"/>',
 'line':'<path d="M6 34h36M8 26l7-4 5 3 6-13 7 5 7-9"/>',
 'texture':'<path d="M7 13h34M7 21h34M7 29h34M7 37h34M17 9v30m14-30v30"/>',
 'dissolve':'<circle cx="13" cy="15" r="3"/><circle cx="28" cy="11" r="1.5"/><circle cx="33" cy="24" r="3"/><circle cx="19" cy="31" r="2"/><path d="M7 39h34"/>',
 'dots':'<circle cx="12" cy="14" r="2"/><circle cx="25" cy="11" r="3"/><circle cx="37" cy="16" r="2"/><circle cx="14" cy="28" r="3"/><circle cx="29" cy="31" r="3"/><circle cx="39" cy="37" r="1"/>',
 'scatter':'<path d="m10 10 5 5m15-4 4 4M18 26l5 2m10 7 5 5"/><circle cx="9" cy="36" r="2"/><circle cx="37" cy="22" r="2"/>',
 'cube':'<path d="m24 7 15 9v17l-15 9-15-9V16l15-9ZM9 16l15 9 15-9M24 25v17"/>',
 'outline':'<rect x="10" y="12" width="28" height="24" rx="5"/><rect x="16" y="18" width="16" height="12" rx="3"/>',
 'pixel':'<rect x="9" y="9" width="12" height="12"/><rect x="25" y="9" width="14" height="12"/><rect x="9" y="25" width="12" height="14"/><rect x="25" y="25" width="14" height="14"/>',
 'checker':'<path d="M8 8h16v16H8zm16 16h16v16H24z"/><path d="M24 8h16v16H24zM8 24h16v16H8z" opacity=".25"/>',
 'vignette':'<rect x="7" y="9" width="34" height="30" rx="5"/><ellipse cx="24" cy="24" rx="10" ry="9"/>',
 'aurora':'<path d="M6 32C15 5 23 15 27 29S36 39 42 11M6 39C17 15 23 25 27 36S37 29 42 19"/>',
 'rays':'<path d="M24 24V5m0 19 14-14M24 24h19M24 24l14 14M24 24v19M24 24 10 38M24 24H5M24 24 10 10"/><circle cx="24" cy="24" r="4"/>',
 'steps':'<path d="M8 37h8V29h8V21h8V13h8"/>',
 'comic':'<path d="M10 13h28v20H22l-8 8v-8h-4Z"/><path d="M16 24h5m5 0h6"/>',
 'ink':'<path d="M10 9h28M13 15h22M16 23h15M19 32h8M24 12v29"/>',
 'brush':'<path d="M12 33c-4 0-6 5-5 9 5 0 12-3 12-9m-6 0 18-23 7 6-19 21-6-4Z"/>',
 'pencil':'<path d="m8 40 6-17 20-20 10 10-20 20-16 7Zm7-17 10 10M29 8l10 10"/>',
 'pen':'<path d="M10 40 24 7l14 33M18 28h13M24 7v17"/>',
 'neon':'<circle cx="24" cy="24" r="12"/><circle cx="24" cy="24" r="17" opacity=".4"/><path d="m19 24 4 4 7-9"/>',
 'glitch':'<path d="M6 13h23v7H6m13 0h23M7 27h20v7H7m17-7h18"/><path d="M14 9v31M35 12v28" opacity=".45"/>',
 'tape':'<rect x="7" y="11" width="34" height="26" rx="4"/><circle cx="17" cy="22" r="5"/><circle cx="31" cy="22" r="5"/><path d="M17 28h14"/>',
 'monitor':'<rect x="7" y="8" width="34" height="29" rx="4"/><path d="M12 17h24M12 23h24M12 29h24M24 37v5m-9 0h18"/>',
 'tiles':'<path d="M7 7h15v15H7zm19 0h15v15H26zM7 26h15v15H7zm19 0h15v15H26Z"/>',
 'swirl':'<path d="M24 24c-10 0-11-12-2-15 14-5 25 16 13 28C20 50-1 35 8 20c8-13 28-16 33 0"/>',
 'wave':'<path d="M6 15c7-9 12 9 19 0s12-9 17 0M6 30c7-9 12 9 19 0s12-9 17 0"/>',
 'prism':'<path d="M23 7 7 39h34L23 7Z"/><path d="M5 24h20m5 0h14m-14 6h14m-14-12h14"/>',
 'snow':'<path d="M24 7v34M7 24h34M12 12l24 24M36 12 12 36M19 9l5 5 5-5m-10 30 5-5 5 5"/>',
 'scissors':'<circle cx="12" cy="33" r="5"/><circle cx="28" cy="33" r="5"/><path d="M15 29 39 8M26 29 9 8"/>',
 'frame':'<rect x="6" y="9" width="36" height="30" rx="4"/><path d="m8 33 11-12 8 7 6-5 8 9"/>',
 'flame':'<path d="M24 5C8 23 13 29 15 36c6 10 21 6 22-7 1-10-11-15-8-21-6 3-7 14-5 17-3-4-4-12 0-20Z"/>',
 'bolt':'<path d="m27 4-18 23h15l-3 17 18-26H24Z"/>',
}
for ident,label in filter_names:
 assert ident in icons, ident
for name in fx_names: assert name in icons, name
out=root/'src/assets/effect-icons';out.mkdir(parents=True,exist_ok=True)
imports=[];registry=[]
all_items=[(key,key) for key,_ in filter_names]+[(re.sub(r'\W+','-',name.lower()).strip('-'),name) for name in fx_names]
for n,(file_stem,key) in enumerate(all_items):
 motif=icons[key];stroke=['#ef9f54','#82d5e5','#a7a6ff'][0 if n<24 else 1 if n<45 else 2]
 if n>=len(filter_names):stroke='#dfaaee'
 body=patterns[motif]
 # Compact diagnostic marks / rails distinctive to each filter; preserve icon's main semantic shape.
 if key in ('gradientmap','duotone'): pass
 highlight=f'<circle cx="40" cy="8" r="2" fill="{stroke}" stroke="none" opacity=".8"/>' if n%3==0 else ''
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="{label if n<len(filter_names) else key}">
<defs><linearGradient id="grad"><stop stop-color="#5a4cc7"/><stop offset=".45" stop-color="#28c7e7"/><stop offset="1" stop-color="#ffd17c"/></linearGradient></defs>
<rect x="1" y="1" width="46" height="46" rx="12" fill="#222438"/>
<g fill="none" stroke="{stroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1">{body}</g>{highlight}
</svg>'''
 (out/(file_stem+'.svg')).write_text(svg)
 alias='icon'+str(n)
 imports.append(f"import {alias} from '../assets/effect-icons/{file_stem}.svg?url';")
 registry.append(f"  '{key}': {alias},")
component='''import type { CSSProperties } from 'react';\n'''+ '\n'.join(imports) + '''\n\nconst icons: Record<string, string> = {\n''' + '\n'.join(registry) + '''\n};\n
export default function EffectIcon({ kind, className, style }: {
  kind: string;
  className?: string;
  style?: CSSProperties;
}) {
  return <img draggable={false} className={className} src={icons[kind] ?? icons['glow']}
    alt="" aria-hidden="true" style={style} />;
}
'''
(root/'src/components/EffectIcon.tsx').write_text(component)
(root/'src/assets/svg.d.ts').write_text("declare module '*.svg?url' {\n  const url: string;\n  export default url;\n}\n")
print(f'Generated {len(all_items)} curated SVG pictograms with {len(patterns)} symbol families')
