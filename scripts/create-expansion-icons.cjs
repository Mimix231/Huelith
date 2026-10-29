/** Deterministic checked-in vector icons for the 120 named operations. */
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../src/assets/effect-icons');
const hues=[280,42,32,200,335,155,215,35];
for(let section=0;section<8;section++)for(let variant=0;variant<[16,14,18,14,16,14,14,14][section];variant++){
  const name=`atelier_${section}_${variant}`;
  const hue=(hues[section]+variant*21)%360;
  const angle=(variant*13)%180;
  const spokes=3+(variant%8),dots=2+(variant%5);
  const motif=[
    `<path d="M11 34Q24 ${12+variant%15} 37 15"/><path d="M10 16h28M13 22h20M17 28h12"/>`,
    `<circle cx="24" cy="24" r="10"/><path d="M24 5v8M24 35v8M5 24h8M35 24h8"/>`,
    `<path d="M10 34Q14 15 21 24T38 13M8 24Q22 34 40 14"/>`,
    `<path d="M12 12l24 24M36 12L12 36"/><circle cx="24" cy="24" r="9"/>`,
    `<path d="M10 10h28v28H10zM14 16h20M14 24h20M14 32h20"/>`,
    `<path d="M8 29Q17 8 28 22T41 16M9 37q19-12 30 0"/>`,
    `<path d="M8 16h29M13 23h26M8 30h30M17 37h22"/>`,
    `<path d="M8 30l8-12 7 15 8-20 9 13"/><circle cx="29" cy="12" r="4"/>`,
  ][section];
  const ring=Array.from({length:spokes},(_,k)=>{const a=(k/spokes)*Math.PI*2+variant*.12;return `<path d="M24 24L${(24+14*Math.cos(a)).toFixed(1)} ${(24+14*Math.sin(a)).toFixed(1)}"/>`;}).join('');
  const points=Array.from({length:dots},(_,k)=>{const x=(9+(variant*7+k*13)%29),y=(12+(variant*11+k*9)%25);return `<circle cx="${x}" cy="${y}" r="${1+(k%2)}" fill="hsl(${(hue+90)%360} 90% 68%)" stroke="none"/>`;}).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Huelith effect ${name}">
<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 70% 67%)"/><stop offset="1" stop-color="hsl(${(hue+110)%360} 82% 60%)"/></linearGradient></defs>
<rect x="1" y="1" width="46" height="46" rx="12" fill="#191b30" stroke="hsl(${hue} 45% 38%)"/>
<g stroke="url(#s)" fill="none" stroke-width="${1.4+(variant%4)*.27}" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${angle} 24 24)">${motif}${ring}</g>${points}
<path d="M7 40h${8+variant%16}" stroke="hsl(${hue} 80% 78%)" stroke-width="2" opacity=".65"/>
</svg>`;
  fs.writeFileSync(path.join(base,`${name}.svg`),svg);
}
