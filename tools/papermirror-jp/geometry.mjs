export const intersect=(a,b,t=.1)=>Math.min(a[2],b[2])-Math.max(a[0],b[0])>t&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>t;
export const union=boxes=>[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
export const contains=(a,b,t=0)=>b[0]>=a[0]-t&&b[1]>=a[1]-t&&b[2]<=a[2]+t&&b[3]<=a[3]+t;
export const point=(p,m)=>[p[0]*m[0]+p[1]*m[2]+m[4],p[0]*m[1]+p[1]*m[3]+m[5]];
export const round=value=>Array.isArray(value)?value.map(round):typeof value==='number'?Math.round(value*1000)/1000:value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,round(v)])):value;
export const equal=(a,b)=>JSON.stringify(round(a))===JSON.stringify(round(b));
export function readingOrder(regions,width){
  const candidates=regions.filter(r=>r.bbox[2]-r.bbox[0]>width*.17&&r.bbox[2]-r.bbox[0]<width*.55&&!['table_cell','page_number','header','footer'].includes(r.type));
  let clusters=[];
  for(const r of candidates.sort((a,b)=>a.bbox[0]-b.bbox[0])){
    const previous=clusters.at(-1);if(!previous||r.bbox[0]-previous.x>width*.09)clusters.push({x:r.bbox[0],regions:[r]});else previous.regions.push(r);
  }
  clusters=clusters.filter(c=>c.regions.length>=2||c.regions.some(r=>r.bbox[3]-r.bbox[1]>60));
  const byPosition=(a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0];
  if(clusters.length>2)return {regions:regions.toSorted(byPosition),columns:3};
  if(clusters.length!==2||clusters[1].x-clusters[0].x<=width*.25)return {regions:regions.toSorted(byPosition),columns:1};
  const edges=clusters[0].regions.map(r=>r.bbox[2]).sort((a,b)=>a-b),split=(edges[Math.floor(edges.length/2)]+clusters[1].x)/2;
  const spanning=regions.filter(r=>(r.bbox[0]<split-10&&r.bbox[2]>split+10)||['title','references_heading','page_number','header','footer'].includes(r.type)).sort(byPosition);
  let remaining=regions.filter(r=>!spanning.includes(r)),ordered=[];
  for(const heading of [...spanning,null]){
    const band=remaining.filter(r=>r.bbox[1]<(heading?.bbox[1]??Infinity));
    ordered.push(...band.sort((a,b)=>(a.bbox[0]>=split)-(b.bbox[0]>=split)||byPosition(a,b)));
    remaining=remaining.filter(r=>!band.includes(r));if(heading)ordered.push(heading);
  }
  return {regions:ordered,columns:2};
}
export function classify(text,bbox,style,height,bodySize){
  if(/^(?:\d+|[ivx]+)$/i.test(text)&&(bbox[1]>height*.87||bbox[3]<height*.08))return 'page_number';
  if(/^(references|bibliography|literature cited)$/i.test(text))return 'references_heading';
  if(/^abstract$/i.test(text))return 'abstract_heading';
  if(/^(Fig\.?|Figure)\s*\d/i.test(text))return 'figure_caption';
  if(/^Table\s*\d/i.test(text))return 'table_caption';
  if(/^Keywords?\s*[:—-]/i.test(text))return 'keywords';
  if(bbox[3]<height*.055)return 'header';if(bbox[1]>height*.94)return 'footer';
  if(bbox[1]>height*.75&&style.font_size<bodySize*.9)return 'footnote';
  if(style.font_size>bodySize*1.35)return 'title';
  if(text.length<140&&(style.bold||/^\d+(?:\.\d+)*\s+[A-Z]/.test(text)))return 'section_heading';
  if(/^(?:[•*-]|\d+[.)])\s/.test(text))return 'list_item';return 'paragraph';
}
export function mergeFragments(regions){
  const merged=[];
  for(const r of regions.toSorted((a,b)=>Math.round(a.bbox[0]/4)-Math.round(b.bbox[0]/4)||a.bbox[1]-b.bbox[1])){
    const p=merged.at(-1);
    if(p&&p.type==='paragraph'&&r.type==='paragraph'&&p.action==='translate'&&r.action==='translate'&&equal(p.style,r.style)&&Math.abs(p.bbox[0]-r.bbox[0])<=3&&r.bbox[1]-p.bbox[3]>=0&&r.bbox[1]-p.bbox[3]<=r.style.font_size*.9&&!/[.!?:]["')\]]?$/.test(p.text.trim())){
      p.text+='\n'+r.text;p.bbox=union([p.bbox,r.bbox]);p.characters.push(...r.characters);
    }else merged.push(r);
  }return merged;
}
// Detect closed, axis-aligned cells only. Unruled tables keep separate text blocks.
export function tableCells(segments){
  const hs=segments.filter(s=>Math.abs(s[1]-s[3])<.3&&Math.abs(s[2]-s[0])>8),vs=segments.filter(s=>Math.abs(s[0]-s[2])<.3&&Math.abs(s[3]-s[1])>8);
  const unique=values=>[...new Set(values.map(x=>Math.round(x*2)/2))].sort((a,b)=>a-b);
  const hasV=(x,y0,y1)=>vs.some(s=>Math.abs(s[0]-x)<1&&Math.min(s[1],s[3])<=y0+1&&Math.max(s[1],s[3])>=y1-1);
  const groups=new Map(),cells=[];
  for(const h of hs){const key=JSON.stringify(unique([h[0],h[2]]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(h);}
  if(hs.length*vs.length>100000)throw Error('TABLE_GEOMETRY_LIMIT');
  for(const [key,lines] of groups){
    const [left,right]=JSON.parse(key),ys=unique(lines.map(s=>s[1]));
    for(let j=0;j<ys.length-1;j++){
      const [y0,y1]=[ys[j],ys[j+1]],xs=unique(vs.filter(s=>s[0]>=left-1&&s[0]<=right+1&&hasV(s[0],y0,y1)).map(s=>s[0]));
      for(let i=0;i<xs.length-1;i++)if(xs[i+1]-xs[i]>8&&y1-y0>8)cells.push([xs[i],y0,xs[i+1],y1]);
    }
  }return cells;
}
const NO_START=new Set('、。，．・：；？！ー々ゝゞヽヾっゃゅょッャュョぁぃぅぇぉァィゥェォ）］｝〕〉》」』】〙〗〟’”)]},.!?:;%');
const NO_END=new Set('（［｛〔〈《「『【〘〖〝‘“([{');
export function lineAtoms(text){
  const atoms=text.match(/https?:\/\/\S+|\[[\d\s,;–—-]+\]|\([^()]*\b(?:19|20)\d{2}[a-z]?[^()]*\)|(?:Fig\.?|Figure|Table|Eq\.?|Equation)\s*\d+[A-Za-z]?|[A-Za-z0-9_][A-Za-z0-9_./:@+−%°-]*(?:[ \u00a0]+(?:mg\/kg|mg|kg|mL|mm|nm|Hz))?|[^\n]/gu)||[];
  const result=[];for(const atom of atoms){if(result.length&&(NO_START.has(atom[0])||NO_END.has(result.at(-1).at(-1))))result[result.length-1]+=atom;else result.push(atom);}return result;
}
export const textWidth=(text,font,size)=>[...text].reduce((sum,c)=>sum+font.advanceGlyph(font.encodeCharacter(c.codePointAt(0))),0)*size;
export function wrapText(text,width,font,size){
  const lines=[];
  for(const paragraph of text.split(/\r?\n/)){
    let line='';for(const atom of lineAtoms(paragraph)){
      if(textWidth(atom,font,size)>width+.001)return null;
      if(textWidth(line+atom,font,size)>width+.001){if(line.trim())lines.push(line.trimEnd());line=atom.trimStart();}else line+=atom;
    }if(line.trim())lines.push(line.trimEnd());
  }return lines;
}
export function fitRegion(text,region,font){
  const [x0,y0,x1,y1]=region.bbox,size=region.style.font_size,small=['figure_caption','table_caption','table_cell','footnote','footer','header'].includes(region.type);
  const minimum=Math.max(small?6.5:7.5,size*(small?.7:.8));
  for(const c of text)if(!/\s/u.test(c)&&!font.encodeCharacter(c.codePointAt(0)))return {error:'MISSING_FONT_GLYPH',character:c};
  const sizes=[];for(let s=size;s>=minimum-.001;s-=.1)sizes.push(s);if(size>=minimum)sizes.push(minimum);
  for(const s of sizes){const lines=wrapText(text,x1-x0,font,s);if(lines?.length&&1.32*s*lines.length<=y1-y0+.001)return {lines,font_size:s,leading:1.32*s,baseline:y0+1.05*s,minimum_font_size:minimum,scale:s/size,bbox:region.bbox};}
  return {error:'LAYOUT_OVERFLOW',minimum_font_size:minimum,bbox:region.bbox};
}
