import * as mupdf from './vendor/mupdf/mupdf.js';
import {ENGINE} from './engine-version.mjs';
import {protect,validateOptions,validateUnit} from './protocol.mjs';
import {intersect,union,contains,point,round,equal,readingOrder,classify,mergeFragments,tableCells,fitRegion,textWidth} from './geometry.mjs';
export const LIMITS={bytes:30*1024*1024,pages:100,objects:100000,characters:500000,imagePixels:24000000,totalImagePixels:120000000,decodedImagePixels:120000000,imageOccurrences:20000,pagePoints:1600};
const RAW='preserve-whitespace,preserve-spans,use-cid-for-unknown-unicode=no,ignore-actualtext';
export class PDFError extends Error{constructor(code,detail=code){super(detail);this.code=code;}}
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const fail=(code,detail)=>{throw new PDFError(code,detail);};
const plain=b=>b.asUint8Array().slice();
const buffer=(doc,options='garbage=0,compress,encrypt=none')=>{const b=doc.saveToBuffer(options);try{return plain(b);}finally{b.destroy();}};
function open(bytes,password=''){
  if(bytes.byteLength>LIMITS.bytes)fail('PDF_RESOURCE_LIMIT');
  let doc;try{doc=mupdf.Document.openDocument(bytes,'application/pdf');}catch{fail('INVALID_PDF');}
  try{if(!doc.isPDF())fail('INVALID_PDF');if(doc.needsPassword()&&!doc.authenticatePassword(password))fail('PASSWORD_REQUIRED');doc.disableJS();return doc;}catch(e){doc.destroy();throw e;}
}
function preflight(doc){
  if(doc.wasRepaired())fail('DAMAGED_PDF');
  if(doc.countPages()<1||doc.countPages()>LIMITS.pages||doc.countObjects()>LIMITS.objects)fail('PDF_RESOURCE_LIMIT');
  const forbidden=new Set(['JS','JavaScript','Launch','RichMediaContent','EmbeddedFiles','XFA','ByteRange','AcroForm','OCProperties','ActualText']);
  let totalPixels=0;
  for(let i=1;i<doc.countObjects();i++){
    const ref=doc.newIndirect(i),obj=ref.resolve();
    try{
      if(obj.isDictionary())obj.forEach((value,key)=>{if(forbidden.has(key))fail('ACTIVE_OR_OPTIONAL_CONTENT_UNSUPPORTED');});
      const action=obj.get('S').asName();if(['JavaScript','Launch','SubmitForm','ImportData','GoToR','Rendition'].includes(action))fail('ACTIVE_CONTENT_UNSUPPORTED');
      if(obj.get('Subtype').asName()==='Image'){
        const w=obj.get('Width').asNumber(),h=obj.get('Height').asNumber(),pixels=w*h;totalPixels+=pixels;
        if(!Number.isSafeInteger(pixels)||pixels<1||pixels>LIMITS.imagePixels||totalPixels>LIMITS.totalImagePixels)fail('PDF_RESOURCE_LIMIT');
      }
    }finally{obj.destroy();ref.destroy();}
  }
  for(let i=0;i<doc.countPages();i++){
    const page=doc.loadPage(i);
    try{
      const b=page.getBounds(),w=b[2]-b[0],h=b[3]-b[1];
      if(Math.max(w,h)>LIMITS.pagePoints||Math.min(w,h)<50)fail('PAGE_GEOMETRY_UNSUPPORTED');
      if(page.getAnnotations().some(a=>a.getType()!=='Link')||page.getWidgets().length)fail('ANNOTATIONS_UNSUPPORTED');
    }finally{page.destroy();}
  }
}
function geometry(page){const o=page.getObject();return {bounds:page.getBounds(),mediabox:o.getInheritable('MediaBox').asJS(),cropbox:o.getInheritable('CropBox').asJS(),rotation:o.getInheritable('Rotate').asNumber(),transform:page.getTransform()};}
function canonicalPage(doc,index){
  const original=doc.loadPage(index),g=geometry(original);original.destroy();
  const object=doc.findPage(index),ownRotation=object.get('Rotate');object.put('Rotate',0);
  const page=doc.loadPage(index);
  return {page,geometry:g,close(){page.destroy();if(ownRotation.isNull())object.delete('Rotate');else object.put('Rotate',ownRotation);ownRotation.destroy();object.destroy();}};
}
function textData(page){
  const s=page.toStructuredText(RAW),chars=[];let block=-1,line=-1,direction=[1,0],wmode=0;
  try{s.walk({beginTextBlock(){block++;},beginLine(_bbox,mode,dir){line++;direction=dir;wmode=mode;},onChar(c,origin,font,size,q,color){
    chars.push({c,origin,bbox:[Math.min(q[0],q[2],q[4],q[6]),Math.min(q[1],q[3],q[5],q[7]),Math.max(q[0],q[2],q[4],q[6]),Math.max(q[1],q[3],q[5],q[7])],quad:q,font:font.getName(),size,bold:font.isBold(),italic:font.isItalic(),serif:font.isSerif(),color,block,line,direction,wmode});
  }});}finally{s.destroy();}return chars;
}
async function documentState(doc){
  const info=doc.getTrailer().get('Info').resolve().toString(),metadata=doc.getTrailer().get('Root','Metadata');let xmp=null;
  if(metadata.isStream()){const stream=metadata.readStream();try{xmp=await sha256(stream.asUint8Array());}finally{stream.destroy();}}
  return {info,xmp,outline:doc.loadOutline()};
}
const imageBudget=()=>({pixels:0,occurrences:0});
const unknownUnicode=unicode=>!Number.isInteger(unicode)||unicode<=0||unicode===0xfffd||unicode===0xfffe||unicode===0xffff||(unicode>=0xd800&&unicode<=0xdfff)||unicode>0x10ffff;
function collectGlyphs(text,ctm,glyphs,unknownGlyphs){
  text.walk({showGlyph(font,trm,glyph,unicode,wmode){
    if(glyphs.length+unknownGlyphs.length>=LIMITS.characters)fail('PDF_RESOURCE_LIMIT');
    const matrix=mupdf.Matrix.concat(trm,ctm),origin=[matrix[4],matrix[5]];
    if(unknownUnicode(unicode)){unknownGlyphs.push({origin,unicode,font:font.getName()});return;}
    let value;try{value=normalize(String.fromCodePoint(unicode));}catch{unknownGlyphs.push({origin,unicode,font:font.getName()});return;}
    const advance=font.advanceGlyph(glyph,wmode),scale=Number.isFinite(advance)?advance:0;
    glyphs.push({text:[...value],origin,advance:[matrix[0]*scale,matrix[1]*scale],font:font.getName()});
    if(glyphs.length+unknownGlyphs.length>LIMITS.characters)fail('PDF_RESOURCE_LIMIT');
  }});
}
function glyphCoverage(chars,glyphs){
  const available=new Map(),tolerance=1.5;
  const key=(value,x,y)=>JSON.stringify([value,x,y]);
  for(const char of chars){
    for(const value of [...normalize(char.c)])if(value.trim()){
      const bucket=key(value,Math.floor(char.origin[0]/tolerance),Math.floor(char.origin[1]/tolerance));
      if(!available.has(bucket))available.set(bucket,[]);available.get(bucket).push({origin:char.origin,used:false});
    }
  }
  const unmatched=[];
  for(const glyph of glyphs){
    const values=glyph.text.filter(value=>value.trim());if(!values.length)continue;
    const length=Math.max(1,values.length-1);
    for(const [index,value] of values.entries()){
      const expected=[glyph.origin[0]+glyph.advance[0]*(index/length),glyph.origin[1]+glyph.advance[1]*(index/length)];
      let best=null,bestDistance=Infinity;const bx=Math.floor(expected[0]/tolerance),by=Math.floor(expected[1]/tolerance);
      for(let x=bx-1;x<=bx+1;x++)for(let y=by-1;y<=by+1;y++)for(const candidate of available.get(key(value,x,y))||[]){
        if(candidate.used)continue;const distance=Math.hypot(candidate.origin[0]-expected[0],candidate.origin[1]-expected[1]);
        if(distance<=tolerance&&distance<bestDistance){best=candidate;bestDistance=distance;}
      }
      if(!best)unmatched.push({value,origin:expected,font:glyph.font});else best.used=true;
    }
  }
  return unmatched;
}
async function snapshot(page,budget=imageBudget(),captureGlyphs=true){
  const drawings=[],images=[],hidden=[],segments=[],obstacles=[],clips=[],glyphs=[],unknownGlyphs=[];
  function paths(p,ctm){
    const commands=[],lines=[];let last=null,start=null;
    p.walk({moveTo(x,y){last=point([x,y],ctm);start=last;commands.push(['m',...last]);},lineTo(x,y){const next=point([x,y],ctm);commands.push(['l',...next]);if(last)lines.push([...last,...next]);last=next;},curveTo(...v){const pts=[];for(let i=0;i<6;i+=2)pts.push(...point(v.slice(i,i+2),ctm));commands.push(['c',...pts]);last=pts.slice(4);},closePath(){commands.push(['h']);if(last&&start)lines.push([...last,...start]);last=start;}});return {commands,lines};
  }
  const callbacks={
    fillPath(p,even,ctm,cs,color,alpha){drawings.push({type:'fill',...paths(p,ctm),even,color,alpha,space:cs?.getName()});},
    strokePath(p,stroke,ctm,cs,color,alpha){
      const d=paths(p,ctm),width=stroke.getLineWidth()*Math.max(Math.hypot(ctm[0],ctm[1]),Math.hypot(ctm[2],ctm[3]));
      drawings.push({type:'stroke',...d,width,color,alpha,space:cs?.getName(),dash:stroke.getDashes(),cap:stroke.getLineCap(),join:stroke.getLineJoin()});
      segments.push(...d.lines);const pad=Math.max(.5,width/2)+.2;
      for(const s of d.lines)obstacles.push([Math.min(s[0],s[2])-pad,Math.min(s[1],s[3])-pad,Math.max(s[0],s[2])+pad,Math.max(s[1],s[3])+pad]);
      if(d.commands.some(x=>x[0]==='c'))obstacles.push(p.getBounds(stroke,ctm));
    },
    fillText(text,ctm,_cs,_c,alpha){if(alpha<.95)hidden.push(text.getBounds(null,ctm));else if(captureGlyphs)collectGlyphs(text,ctm,glyphs,unknownGlyphs);},
    ignoreText(text,ctm){hidden.push(text.getBounds(null,ctm));},
    clipText(text,ctm){hidden.push(text.getBounds(null,ctm));},
    clipStrokeText(text,_stroke,ctm){hidden.push(text.getBounds(null,ctm));},
    strokeText(text,_stroke,ctm){hidden.push(text.getBounds(null,ctm));},
    clipPath(p,even,ctm){clips.push({type:'clip',commands:paths(p,ctm).commands,even});},
    clipStrokePath(p,_s,ctm){clips.push({type:'clipStroke',commands:paths(p,ctm).commands});},
    fillImage(image,ctm,alpha){recordImage(image,ctm,alpha);},
    fillImageMask(image,ctm,cs,color,alpha){recordImage(image,ctm,alpha,color,cs?.getName());},
    clipImageMask(image,ctm){recordImage(image,ctm,1,[], 'clip');},
    fillShade(shade,ctm,alpha){drawings.push({type:'shade',bounds:mupdf.Rect.transform(shade.getBounds(),ctm),alpha});},
    beginGroup(area,cs,isolated,knockout,blend,alpha){drawings.push({type:'group',area,space:cs?.getName(),isolated,knockout,blend,alpha});},
  };
  function recordImage(image,ctm,alpha,color=null,space=null){
    const width=image.getWidth(),height=image.getHeight(),pixels=width*height;
    if(!Number.isSafeInteger(pixels)||pixels<1||pixels>LIMITS.imagePixels||budget.occurrences>=LIMITS.imageOccurrences||budget.pixels>LIMITS.decodedImagePixels-pixels)fail('PDF_RESOURCE_LIMIT');
    budget.occurrences++;budget.pixels+=pixels;
    const pix=image.toPixmap();try{images.push({bbox:mupdf.Rect.transform([0,0,1,1],ctm),ctm,alpha,color,space,width:image.getWidth(),height:image.getHeight(),pixels:pix.getPixels().slice()});}finally{pix.destroy();}
  }
  const device=new mupdf.Device(callbacks);let closed=false;try{page.runPageContents(device,mupdf.Matrix.identity);device.close();closed=true;}finally{if(!closed)try{device.close();}catch{}device.destroy();}
  for(const img of images){img.sha256=await sha256(img.pixels);delete img.pixels;}
  const links=page.getLinks().map(link=>{try{return {bbox:link.getBounds(),uri:link.getURI()};}finally{link.destroy();}}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {objects:round({drawings,images,links,clips}),hidden,segments,obstacles,images,glyphs,unknown_glyphs:unknownGlyphs};
}
function rgb(color){
  if(color.length===1)return [color[0],color[0],color[0]];
  if(color.length===4)return color.slice(0,3).map(v=>1-Math.min(1,v+color[3]));
  return color.slice(0,3);
}
function appendText(doc,page,targets,plans,font){
  const object=page.getObject(),resources=object.getInheritable('Resources');
  // Clone page resources so adding the font cannot modify a sibling's inherited dictionary.
  const own=doc.newDictionary();resources.forEach((v,k)=>own.put(k,v));
  const fonts=doc.newDictionary();resources.get('Font').forEach((v,k)=>fonts.put(k,v));
  let fontName='PMJPBrowser';while(!fonts.get(fontName).isNull())fontName+='X';
  fonts.put(fontName,doc.addFont(font));own.put('Font',fonts);object.put('Resources',own);
  const commands=[];
  for(const r of targets){
    const plan=plans[r.unit_id],size=plan.font_size,color=rgb(r.style.color);
    for(const [index,line] of plan.lines.entries()){
      let x=r.bbox[0];if(r.style.align==='center')x+=Math.max(0,(r.bbox[2]-r.bbox[0]-textWidth(line,font,size))/2);
      const y=plan.baseline+index*plan.leading;
      const matrix=mupdf.Matrix.concat([size,0,0,-size,x,y],mupdf.Matrix.invert(page.getTransform()));
      const encoded=[...line].map(c=>font.encodeCharacter(c.codePointAt(0)).toString(16).padStart(4,'0')).join('');
      commands.push(`q ${color.join(' ')} rg BT /${fontName} 1 Tf ${matrix.join(' ')} Tm <${encoded}> Tj ET Q`);
    }
  }
  const old=object.get('Contents'),contents=doc.newArray();
  if(old.isArray())old.forEach(v=>contents.push(v));else if(!old.isNull())contents.push(old);
  contents.push(doc.addStream(commands.join('\n'),{}));object.put('Contents',contents);
}
const comparableFont=name=>typeof name==='string'?name.replace(/^[A-Z]{6}\+/,''):String(name??'');
const inventory=chars=>{
  const map=new Map();for(const c of chars){if(!c.c.trim())continue;const key=[c.c,Math.round(c.origin[0]*10),Math.round(c.origin[1]*10),comparableFont(c.font),Math.round((c.size??0)*1000),Boolean(c.bold),Boolean(c.italic),Boolean(c.serif),round(c.color||[]),round(c.quad||[]),Boolean(c.wmode),round(c.direction||[])];const k=JSON.stringify(key);map.set(k,(map.get(k)||0)+1);}return [...map].sort((a,b)=>a[0].localeCompare(b[0]));
};
const comparableIR=ir=>{const {source_sha256:_source,encrypted_source:_encrypted,working_sha256:_working,...rest}=ir;return rest;};
function preflightBytes(bytes){
  const doc=open(bytes);try{preflight(doc);}finally{doc.destroy();mupdf.emptyStore();}
}
async function authoritativeIR(bytes,supplied,progress){
  if(!supplied||typeof supplied!=='object'||!Array.isArray(supplied.pages)||!Array.isArray(supplied.units)||!Array.isArray(supplied.blockers)||typeof supplied.working_sha256!=='string')fail('IR_STRUCTURE_MISMATCH');
  const options=validateOptions(supplied.analysis_options);
  if(await sha256(bytes)!==supplied.working_sha256)fail('SOURCE_HASH_MISMATCH');
  preflightBytes(bytes);
  const fresh=(await analyze(bytes,options,'',progress)).ir;
  if(!equal(comparableIR({...supplied,analysis_options:options}),comparableIR(fresh)))fail('IR_STRUCTURE_MISMATCH');
  return fresh;
}
export async function render(bytes,ir,translations,progress=()=>{}){
  const authoritative=await authoritativeIR(bytes,ir,progress);
  if(authoritative.blockers.length)fail('ANALYSIS_BLOCKED');
  const plans={},errors=[],font=new mupdf.Font('ja');
  try{
    for(const p of authoritative.pages)for(const r of p.regions){
      if(!r.unit_id)continue;const unit=authoritative.units.find(u=>u.unit_id===r.unit_id),translation=translations[r.unit_id];
      const checked=validateUnit(unit,translation||{});
      if(!checked.valid){errors.push({code:'INVALID_TRANSLATION',unit_id:r.unit_id,detail:checked.errors});continue;}
      const plan=fitRegion(checked.restored,r,font);plans[r.unit_id]=plan;
      if(plan.error)errors.push({code:plan.error,unit_id:r.unit_id,page:p.page,...plan});
    }
    if(errors.length)return {qa:{status:'NEEDS_REVIEW',errors,plans,semantic_fidelity:'NOT_AUTOMATICALLY_VERIFIED'}};
    const doc=open(bytes);
    let output;
    try{
      for(let n=0;n<doc.countPages();n++){
        progress({phase:'render',page:n+1,total:doc.countPages()});const loaded=canonicalPage(doc,n),page=loaded.page;
        try{
          const targets=authoritative.pages[n].regions.filter(r=>r.unit_id);
          // Preserve the actual link dictionaries (destinations and actions included).
          const linkAnnots=doc.newArray();page.getObject().get('Annots').forEach(a=>{if(a.get('Subtype').asName()==='Link')linkAnnots.push(a);});
          for(const r of targets)for(const c of r.characters){if(!c.c.trim())continue;const a=page.createAnnotation('Redact');a.setRect(c.bbox);a.destroy();}
          if(targets.length)page.applyRedactions(false,mupdf.PDFPage.REDACT_IMAGE_NONE,mupdf.PDFPage.REDACT_LINE_ART_NONE,mupdf.PDFPage.REDACT_TEXT_REMOVE);
          if(linkAnnots.length)page.getObject().put('Annots',linkAnnots);else page.getObject().delete('Annots');
          if(targets.length)appendText(doc,page,targets,plans,font);
        }finally{loaded.close();}
      }
      doc.subsetFonts();output=buffer(doc,'garbage=3,compress,encrypt=none');
    }finally{doc.destroy();}
    const qa=await qualityCheck(bytes,output,authoritative,plans,progress);qa.plans=plans;qa.font={name:font.getName(),engine:ENGINE,substitution:'Pinned CJK fallback; original bold/italic/serif appearance may differ'};
    return {qa,output:qa.status==='PASS'?output:null};
  }finally{font.destroy();mupdf.emptyStore();}
}
export async function qualityCheck(sourceBytes,outputBytes,ir,plans,progress=()=>{}){
  const before=open(sourceBytes),after=open(outputBytes),beforeImages=imageBudget(),afterImages=imageBudget(),errors=[],pages=[];
  const record=(code,page,extra={})=>errors.push({code,page,...extra});
  try{
    if(before.countPages()!==after.countPages())record('PAGE_COUNT_MISMATCH');
    const stateA=await documentState(before),stateB=await documentState(after),metadataMatch=stateA.info===stateB.info&&stateA.xmp===stateB.xmp,bookmarksMatch=equal(stateA.outline,stateB.outline);
    if(!metadataMatch||!bookmarksMatch)record('DOCUMENT_METADATA_MISMATCH');
    for(let n=0;n<Math.min(before.countPages(),after.countPages());n++){
      progress({phase:'qa',page:n+1,total:before.countPages()});const loadedA=canonicalPage(before,n),loadedB=canonicalPage(after,n),a=loadedA.page,b=loadedB.page;let pixA,pixB;
      try{
        const pageIR=ir.pages[n],geometryMatch=equal(loadedA.geometry,loadedB.geometry);if(!geometryMatch)record('PAGE_GEOMETRY_MISMATCH',n+1);
        const objectsA=(await snapshot(a,beforeImages,false)).objects,objectsB=(await snapshot(b,afterImages,false)).objects,objectsMatch=equal(objectsA,objectsB);
        if(!objectsMatch)for(const kind of ['drawings','images','links','clips'])if(!equal(objectsA[kind],objectsB[kind]))record(`${kind.toUpperCase()}_MISMATCH`,n+1);
        const actual=textData(b).filter(c=>c.c.trim()),targets=[],masks=[];
        for(const r of pageIR.regions){
          if(!r.unit_id)continue;const plan=plans[r.unit_id];
          masks.push(...r.characters.filter(c=>c.c.trim()).map(c=>c.bbox));
          for(const [i,line] of plan.lines.entries()){
            const baseline=plan.baseline+i*plan.leading;
            const extracted=actual.filter(c=>Math.abs(c.origin[1]-baseline)<.15&&c.origin[0]>=r.bbox[0]-.15&&c.origin[0]<=r.bbox[2]+.15).sort((a,b)=>a.origin[0]-b.origin[0]);
            if(extracted.map(c=>c.c).join('')!==line.replace(/\s/g,''))record('OUTPUT_TRANSLATION_TEXT_MISMATCH',n+1,{unit_id:r.unit_id});
            for(const c of extracted){targets.push(c);masks.push(c.bbox);if(!contains(r.bbox,c.bbox,.15))record('TEXT_OUTSIDE_BBOX',n+1,{unit_id:r.unit_id});}
          }
        }
        const preserved=pageIR.regions.filter(r=>!r.unit_id).flatMap(r=>r.characters).filter(c=>c.c.trim());
        const actualInventory=new Map(inventory(actual));
        if(inventory(preserved).some(([key,count])=>(actualInventory.get(key)||0)<count))record('PRESERVED_TEXT_MISMATCH',n+1);
        if(!equal(inventory(actual),inventory([...preserved,...targets])))record('OUTPUT_GLYPH_INVENTORY_MISMATCH',n+1);
        pixA=a.toPixmap([2,0,0,2,0,0],mupdf.ColorSpace.DeviceRGB,false,false);pixB=b.toPixmap([2,0,0,2,0,0],mupdf.ColorSpace.DeviceRGB,false,false);
        const width=pixA.getWidth(),height=pixA.getHeight();let ratio=1;
        if(width!==pixB.getWidth()||height!==pixB.getHeight())record('PIXMAP_GEOMETRY_MISMATCH',n+1);
        else{
          const mask=new Uint8Array(width*height),pa=pixA.getPixels(),pb=pixB.getPixels();
          for(const box of masks){const x0=Math.max(0,Math.floor(box[0]*2)-2),y0=Math.max(0,Math.floor(box[1]*2)-2),x1=Math.min(width-1,Math.ceil(box[2]*2)+2),y1=Math.min(height-1,Math.ceil(box[3]*2)+2);for(let y=y0;y<=y1;y++)mask.fill(1,y*width+x0,y*width+x1+1);}
          let outside=0,changed=0;for(let p=0;p<mask.length;p++){if(mask[p])continue;outside++;const i=p*3;if(Math.max(Math.abs(pa[i]-pb[i]),Math.abs(pa[i+1]-pb[i+1]),Math.abs(pa[i+2]-pb[i+2]))>12)changed++;}ratio=changed/Math.max(1,outside);
          if(ratio>.001)record('VISUAL_DIFF_FAILED',n+1,{ratio});
        }
        pages.push({page:n+1,geometry_match:geometryMatch,objects_match:objectsMatch,outside_mask_pixel_change:ratio});
      }finally{pixA?.destroy();pixB?.destroy();loadedA.close();loadedB.close();}
    }
    return {status:errors.length?'QA_FAILED':'PASS',errors,pages,page_count_match:before.countPages()===after.countPages(),metadata_match:metadataMatch,bookmarks_match:bookmarksMatch,clipping_count:errors.filter(e=>e.code==='TEXT_OUTSIDE_BBOX').length,translated_units:Object.keys(plans).length,visual_settings:{dpi:144,colorspace:'RGB',alpha:false,annotations:false,mask_dilation_px:2,channel_tolerance:12,maximum_outside_mask_change:.001},semantic_fidelity:'NOT_AUTOMATICALLY_VERIFIED',content:{status:'PASS',protected_token_mismatch:0,numeric_mismatch:0}};
  }finally{before.destroy();after.destroy();}
}
export function preview(bytes,pageNumber=1){
  const doc=open(bytes);let page,pix;try{if(pageNumber<1||pageNumber>doc.countPages())fail('INVALID_PAGE');page=doc.loadPage(pageNumber-1);const scale=Math.min(1.5,1100/page.getBounds()[2]);pix=page.toPixmap([scale,0,0,scale,0,0],mupdf.ColorSpace.DeviceRGB,false,false);return pix.asPNG().slice();}finally{pix?.destroy();page?.destroy();doc.destroy();mupdf.emptyStore();}
}
const ligatures={'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl'};
const normalize=text=>text.replace(/[ﬀﬁﬂﬃﬄ]/g,c=>ligatures[c]);
export async function analyze(bytes,options,password='',progress=()=>{}){
  const normalizedOptions=validateOptions(options),originalHash=await sha256(bytes),doc=open(bytes,password);const encryption=doc.getMetaData('encryption'),encrypted=Boolean(encryption&&encryption!=='None'),images=imageBudget();
  try{
    preflight(doc);const pages=[],units=[],blockers=[],warnings=[];let references=false,total=0;
    for(let n=0;n<doc.countPages();n++){
      progress({phase:'analyze',page:n+1,total:doc.countPages()});
      const loaded=canonicalPage(doc,n),page=loaded.page;
      try{
        const g=loaded.geometry,visible=page.getBounds(),width=visible[2]-visible[0],height=visible[3]-visible[1];
        const chars=textData(page),snap=await snapshot(page,images,true);total+=chars.length;if(total>LIMITS.characters)fail('PDF_RESOURCE_LIMIT');
        if(snap.unknown_glyphs.length)blockers.push({code:'SOURCE_GLYPH_UNKNOWN_UNICODE',page:n+1,count:snap.unknown_glyphs.length});
        const unmatched=glyphCoverage(chars,snap.glyphs);if(unmatched.length)blockers.push({code:'SOURCE_GLYPH_COVERAGE_MISMATCH',page:n+1,count:unmatched.length});
        const visibleText=page.toStructuredText(RAW),accessibleText=page.toStructuredText(RAW.replace(',ignore-actualtext',''));
        try{if(visibleText.asText()!==accessibleText.asText())blockers.push({code:'ALTERNATE_TEXT_DIFFERS_FROM_GLYPHS',page:n+1});}finally{visibleText.destroy();accessibleText.destroy();}
        let cells;try{cells=tableCells(snap.segments);}catch{cells=[];blockers.push({code:'TABLE_DETECTION_UNCERTAIN',page:n+1});}
        const sizes=new Map();for(const c of chars){const size=Math.round(c.size*10)/10;sizes.set(size,(sizes.get(size)||0)+1);}const bodySize=[...sizes].sort((a,b)=>b[1]-a[1])[0]?.[0]||10;
        const groups=new Map();
        for(const c of chars){
          const center=[(c.bbox[0]+c.bbox[2])/2,(c.bbox[1]+c.bbox[3])/2];const cell=cells.findIndex(b=>center[0]>=b[0]&&center[0]<=b[2]&&center[1]>=b[1]&&center[1]<=b[3]);
          const key=cell>=0?`cell-${cell}`:`block-${c.block}`;if(!groups.has(key))groups.set(key,{chars:[],cell});groups.get(key).chars.push(c);
        }
        let regions=[];
        for(const group of groups.values()){
          const cs=group.chars,lines=new Map();for(const c of cs){if(!lines.has(c.line))lines.set(c.line,[]);lines.get(c.line).push(c);}
          const text=normalize([...lines.values()].map(line=>line.map(c=>c.c).join('')).join('\n').trim());if(!text)continue;
          const bbox=union(cs.map(c=>c.bbox)),counts=new Map();for(const c of cs){const k=JSON.stringify([c.size,c.font,c.color]);if(!counts.has(k))counts.set(k,{count:0,c});counts.get(k).count++;}
          const rep=[...counts.values()].sort((a,b)=>b.count-a.count)[0].c;
          const style={font_size:rep.size,bold:rep.bold,italic:rep.italic,color:rep.color,font:rep.font,font_family_class:rep.serif?'serif':'sans-serif',align:'left'};
          const type=group.cell>=0?'table_cell':classify(text,bbox,style,height,bodySize);
          if(type==='title'&&Math.abs((bbox[0]+bbox[2])/2-width/2)<width*.08)style.align='center';
          const region={region_id:`p${String(n+1).padStart(3,'0')}-r${String(regions.length+1).padStart(4,'0')}`,page:n+1,bbox,type,text,style,characters:cs,action:'translate',reasons:[]};
          const review=code=>{region.action='review';region.reasons.push(code);};
          if(group.cell>=0){const b=cells[group.cell];region.cell_bbox=b;region.bbox=[Math.max(b[0]+2,bbox[0]),Math.max(b[1]+2,bbox[1]),b[2]-2,b[3]-2];}
          if(cs.some(c=>!contains(visible,c.bbox,.1))){region.action='preserve';region.reasons.push('OUTSIDE_CROPBOX');}
          if(cs.some(c=>!equal(c.direction,[1,0])||c.wmode))review('WRITING_DIRECTION_UNSUPPORTED');
          if(cs.some(c=>c.size<4||c.color.every(v=>v>.98))||snap.hidden.some(b=>intersect(b,bbox)))review('HIDDEN_OR_LOW_VISIBILITY_TEXT');
          if(/[\ufffd\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text))review('SOURCE_UNCERTAIN');
          const superscript=[...lines.values()].some(line=>Math.max(...line.map(c=>c.origin[1]))-Math.min(...line.map(c=>c.origin[1]))>rep.size*.2);
          if(superscript||cs.some(c=>/math|symbol|cmsy|cmmi|cmex|msam|msbm/i.test(c.font))||/[∑∫√∂∇∞≈≠≤≥∈∉⊂⊃∏∝^₀-₉⁰-⁹]/u.test(text)){
            if((text.match(/\b[A-Za-z]{3,}\b/g)||[]).length<=1&&text.length<150){region.type='equation';if(region.action==='translate')region.action='preserve';}
            else review('INLINE_EQUATION_OR_SUPERSCRIPT_UNSUPPORTED');
          }
          if(!/[A-Za-z]{2,}/.test(text)&&region.action==='translate'){region.action='preserve';region.reasons.push('NUMERIC_OR_SYMBOL_ONLY');}
          if(type==='page_number'&&region.action==='translate')region.action='preserve';
          if(region.action==='translate'&&snap.images.some(i=>intersect(bbox,i.bbox)))review('TEXT_OVER_IMAGE');
          if(region.action==='translate'&&snap.obstacles.some(b=>intersect(region.bbox,b)))review('TEXT_OVER_VECTOR_OR_TABLE_LINE');
          const ls=[...lines.values()];for(let i=1;i<ls.length;i++)if(Math.abs(ls[i][0].origin[1]-ls[i-1][0].origin[1])<rep.size*.75&&intersect(union(ls[i].map(c=>c.bbox)),union(ls[i-1].map(c=>c.bbox))))review('OVERLAPPING_TEXT_LINES');
          regions.push(region);
        }
        regions=mergeFragments(regions);const ordered=readingOrder(regions,width);regions=ordered.regions;
        if(ordered.columns>2)blockers.push({code:'LAYOUT_COLUMNS_UNSUPPORTED',page:n+1});
        if(chars.filter(c=>c.c.trim()).length!==regions.reduce((sum,r)=>sum+r.characters.filter(c=>c.c.trim()).length,0))blockers.push({code:'SOURCE_GLYPH_COVERAGE_MISMATCH',page:n+1});
        const imageArea=snap.images.reduce((sum,i)=>sum+Math.max(0,Math.min(i.bbox[2],visible[2])-Math.max(i.bbox[0],visible[0]))*Math.max(0,Math.min(i.bbox[3],visible[3])-Math.max(i.bbox[1],visible[1])),0)/(width*height);
        if(imageArea>.6&&chars.length<20)blockers.push({code:'OCR_REQUIRED_UNSUPPORTED_V1',page:n+1});else if(imageArea>.8)blockers.push({code:'MIXED_PAGE_REQUIRES_REVIEW',page:n+1});
        if(snap.images.length)warnings.push({code:'RASTER_FIGURE_TEXT_NOT_TRANSLATED',page:n+1});
        for(const [index,r] of regions.entries()){
          r.reading_order=index+1;if(r.type==='references_heading')references=true;
          else if(references&&/^(appendix|supplement(?:ary)?(?: material)?|supporting information)\b/i.test(r.text))references=false;
          else if(references&&!['header','footer','page_number'].includes(r.type)){r.type='reference_entry';if(r.action==='translate')r.action='preserve';}
          if(r.action==='translate')for(const other of regions){if(other===r||!intersect(r.bbox,other.bbox))continue;if(r.characters.some(c=>other.characters.some(d=>intersect(c.bbox,d.bbox)))){r.action='review';r.reasons.push('OVERLAPPING_TEXT_REGIONS');break;}}
          if(r.action==='review')blockers.push({code:'SOURCE_REGION_REQUIRES_REVIEW',page:n+1,region_id:r.region_id,reasons:r.reasons});
          else if(r.action==='preserve')warnings.push({code:'REGION_PRESERVED',page:n+1,region_id:r.region_id,type:r.type,reasons:r.reasons});
          else{
            const original=r.text.replace(/\s+/g,' ').trim();if(new TextEncoder().encode(original).length>18000){blockers.push({code:'UNIT_TOO_LONG',region_id:r.region_id});continue;}
            let protectedUnit;try{protectedUnit=protect(original,normalizedOptions.protected_terms);}catch(e){blockers.push({code:e.code||'SOURCE_UNCERTAIN',region_id:r.region_id});continue;}
            const unit_id=`u-${String(units.length+1).padStart(5,'0')}`;r.unit_id=unit_id;
            units.push({unit_id,region_id:r.region_id,page:n+1,bbox:r.bbox,type:r.type,original,...protectedUnit,source_hash:await sha256(original),flow_group:unit_id,box_ids:[r.region_id]});
          }
        }
        pages.push({page:n+1,...g,canonical_bounds:visible,width,height,columns:ordered.columns,page_type:imageArea>.4?'IMAGE_HEAVY':'NATIVE_TEXT',regions,table_cells:cells.length,images:snap.images.length,objects:snap.objects,reading_order_edges:regions.slice(1).map((r,i)=>[regions[i].region_id,r.region_id])});
      }finally{loaded.close();}
    }
    if(!units.length)blockers.push({code:'NO_TRANSLATABLE_NATIVE_TEXT'});
    for(let i=0;i<units.length;i++)units[i].context={previous:units[i-1]?.original.slice(-500)||'',next:units[i+1]?.original.slice(0,500)||''};
    const working=buffer(doc),workingHash=await sha256(working);
    const ir={schema_version:1,pages,units,warnings,blockers,title:doc.getMetaData('info:Title')||pages.flatMap(p=>p.regions).find(r=>r.type==='title')?.text||'Untitled document',metadata:await documentState(doc),encrypted_source:encrypted,source_sha256:originalHash,working_sha256:workingHash,analysis_options:normalizedOptions,engine:ENGINE,flow_policy:'one-region-per-unit-with-neighbor-context'};
    return {ir,working};
  }finally{doc.destroy();mupdf.emptyStore();}
}
