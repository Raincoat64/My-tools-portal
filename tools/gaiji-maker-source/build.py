#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, gzip, hashlib, io, json, re, shutil, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cairoPen import CairoPen
import cairo

APP_VERSION='4.3.1-web'
FEATURE_SIDE=12
FEATURE_DIM=168
RASTER_SIDE=48
EXPECTED_MJ=58862
EXPECTED_GJ=9420
MJ_URL='https://moji.or.jp/wp-content/uploads/2024/01/mji.00602.xlsx'
IPAMJ_URL='https://dforest.watch.impress.co.jp/library/i/ipamjfont/10750/ipamjm00601.zip'
GJ_URL='https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/f3a1de20-1f15-44fd-ade8-4e0e9eb52e8b/b5f08c73/20260818_policies_local_govarnments_outline_01.zip'
EXPECTED_SHA={
 'mji.00602.xlsx':'f79075bf006b66c5e57a6df60503c5a01679cabbcea2f124eb3758593cf6fd3f',
 'ipamjm.ttf':'a3e84f495f3c388db7a1473bf1985c1c076d0c814100f10a027ca6853eb1e8cb',
 'gj.zip':'b016e08a994158adfe5a89cd7a3e893986fb10e24b1239a0e971ceaf74583ee2',
}
LEGACY_RELATION_GROUPS=[
    '崎﨑嵜㟢','高髙','富冨','島嶋嶌','柳栁','桧檜','吉𠮷','村邨','峰峯','舘館','沖冲','晃晄','凛凜','鴎鷗','桑桒','斎齋','辺邉','浜濵','剣劒劔釼','亘亙','涼凉','芦蘆','藪薮籔','竈竃','籠篭','曽曾','瀬瀨',
]

def sha256_file(p:Path)->str:
 h=hashlib.sha256()
 with p.open('rb') as f:
  for x in iter(lambda:f.read(1024*1024),b''):h.update(x)
 return h.hexdigest()
def gzip_file(src:Path,dst:Path):
 out=io.BytesIO()
 with src.open('rb') as r, gzip.GzipFile(fileobj=out,mode='wb',compresslevel=9,mtime=0) as w: shutil.copyfileobj(r,w)
 dst.write_bytes(out.getvalue())
def gzip_bytes(b:bytes)->bytes:
 out=io.BytesIO()
 with gzip.GzipFile(fileobj=out,mode='wb',compresslevel=9,mtime=0) as g:g.write(b)
 return out.getvalue()

def download(url:str,p:Path):
 if p.exists(): return
 print('download',url,flush=True)
 req=urllib.request.Request(url,headers={'User-Agent':'My-tools-portal gaiji builder/4.3.1'})
 with urllib.request.urlopen(req,timeout=180) as r,p.open('wb') as w: shutil.copyfileobj(r,w)

def colnum(ref:str)->int:
 n=0
 for c in re.match(r'[A-Z]+',ref).group(0): n=n*26+ord(c)-64
 return n-1

def read_xlsx_rows(path:Path):
 NS='{http://purl.oclc.org/ooxml/spreadsheetml/main}'
 with zipfile.ZipFile(path) as z:
  root=ET.fromstring(z.read('xl/sharedStrings.xml'))
  shared=[''.join(t.text or '' for t in si.iter(NS+'t')) for si in root.findall(NS+'si')]
  with z.open('xl/worksheets/sheet1.xml') as fh:
   for ev,elem in ET.iterparse(fh,events=('end',)):
    if elem.tag!=NS+'row': continue
    vals={}
    for c in elem.findall(NS+'c'):
     ref=c.attrib.get('r','A1'); v=c.find(NS+'v'); value='' if v is None else (v.text or '')
     if c.attrib.get('t')=='s' and value!='': value=shared[int(value)]
     vals[colnum(ref)]=value
    elem.clear(); yield vals

def cps_to_string(v:str)->str:
 s=str(v or '').strip()
 if not s or s in {'-','－','―'}:return ''
 cps=re.findall(r'(?:U\+)?([0-9A-Fa-f]{4,6})',s)
 try:return ''.join(chr(int(x,16)) for x in cps if int(x,16)<=0x10ffff)
 except:return ''

def parse_mj(path:Path,mj_font:TTFont):
 rows=read_xlsx_rows(path); hdr=next(rows)
 headers={str(v):k for k,v in hdr.items()}
 def ci(*names):
  for n in names:
   if n in headers:return headers[n]
  raise RuntimeError('missing header '+repr(names))
 idc=ci('MJ文字図形名'); ivsc=ci('実装したMoji_JohoコレクションIVS'); implc=ci('実装したUCS'); ucsc=ci('対応するUCS'); stc=ci('総画数(参考)'); radc=ci('部首1(参考)')
 glyphs=set(mj_font.getGlyphOrder()); rec=[]
 for row in rows:
  mid=str(row.get(idc,'')).strip()
  if not re.fullmatch(r'MJ\d{6}',mid):continue
  implemented_seq=''
  for c in (ivsc,implc):
   implemented_seq=cps_to_string(row.get(c,''))
   if implemented_seq:break
  seq=implemented_seq or cps_to_string(row.get(ucsc,''))
  impl=bool(implemented_seq) and mid.lower() in glyphs
  try:st=int(float(row.get(stc,''))) if row.get(stc,'') not in ('','-') else None
  except:st=None
  rad=str(row.get(radc,'') or '').strip(); rad=None if not rad or rad=='-' else rad
  d={'id':mid,'src':'MJ','seq':seq,'base':seq[0] if seq else '','copy':bool(seq and impl),'impl':impl}
  if st is not None:d['st']=st
  if rad:d['rad']=rad
  rec.append(d)
 print('MJ',len(rec),'unencoded',sum(not x['impl'] for x in rec),flush=True)
 if len(rec)!=EXPECTED_MJ:raise RuntimeError(f'MJ count {len(rec)}')
 return rec

def extract_inputs(inp:Path):
 inp.mkdir(parents=True,exist_ok=True)
 mj=inp/'mji.00602.xlsx'; iz=inp/'ipamjm00601.zip'; gz=inp/'gj.zip'
 download(MJ_URL,mj); download(IPAMJ_URL,iz); download(GJ_URL,gz)
 if sha256_file(mj)!=EXPECTED_SHA['mji.00602.xlsx']:raise RuntimeError('MJ SHA mismatch')
 if sha256_file(gz)!=EXPECTED_SHA['gj.zip']:raise RuntimeError('GJ ZIP SHA mismatch')
 ip=inp/'ipamjm.ttf'
 if not ip.exists():
  with zipfile.ZipFile(iz) as z:
   n=next(n for n in z.namelist() if Path(n).name.lower()=='ipamjm.ttf'); ip.write_bytes(z.read(n))
 if sha256_file(ip)!=EXPECTED_SHA['ipamjm.ttf']:raise RuntimeError('IPAmj SHA mismatch')
 gt=inp/'acgjm.ttf'; gw=inp/'acgjm.woff2'
 if not gt.exists() or not gw.exists():
  with zipfile.ZipFile(gz) as z:
   for target,name in [(gt,'acgjm.ttf'),(gw,'acgjm.woff2')]:
    n=next(n for n in z.namelist() if Path(n).name.lower()==name); target.write_bytes(z.read(n))
 return mj,ip,gz,gt,gw

def parse_gj(font:TTFont):
 glyphs=set(font.getGlyphOrder()); cmap=font.getBestCmap() or {}; reverse={gn:cp for cp,gn in cmap.items()}
 rec=[]
 for i in range(1,EXPECTED_GJ+1):
  gid=f'GJ{i:06d}'; gn=gid.lower()
  if gn not in glyphs:raise RuntimeError('GJ glyph missing '+gid)
  cp=reverse.get(gn)
  if cp is None:raise RuntimeError('GJ cmap missing '+gid)
  rec.append({'id':gid,'src':'GJ','seq':'','base':'','copy':False,'impl':True,'pup':cp})
 print('GJ',len(rec),flush=True);return rec

def glyph_feature(font:TTFont,name:str)->bytes:
 gs=font.getGlyphSet(); glyph=gs[name]
 b=BoundsPen(gs);glyph.draw(b)
 if not b.bounds:return bytes(FEATURE_DIM)
 x0,y0,x1,y1=map(float,b.bounds); width=max(x1-x0,1);height=max(y1-y0,1)
 surface=cairo.ImageSurface(cairo.FORMAT_A8,RASTER_SIDE,RASTER_SIDE);ctx=cairo.Context(surface);ctx.set_source_rgba(1,1,1,1)
 margin=3.; scale=min((RASTER_SIDE-2*margin)/width,(RASTER_SIDE-2*margin)/height);cx=(x0+x1)/2;cy=(y0+y1)/2
 ctx.translate(RASTER_SIDE/2,RASTER_SIDE/2);ctx.scale(scale,-scale);ctx.translate(-cx,-cy);glyph.draw(CairoPen(gs,ctx));ctx.fill();surface.flush()
 buf=bytes(surface.get_data());stride=surface.get_stride();block=RASTER_SIDE//FEATURE_SIDE;feat=bytearray()
 for gy in range(FEATURE_SIDE):
  for gx in range(FEATURE_SIDE):
   total=count=0
   for yy in range(gy*block,min((gy+1)*block,RASTER_SIDE)):
    row=yy*stride
    for xx in range(gx*block,min((gx+1)*block,RASTER_SIDE)):total+=buf[row+xx];count+=1
   feat.append(round(total/max(count,1)))
 for gy in range(FEATURE_SIDE):
  total=count=0
  for yy in range(gy*block,min((gy+1)*block,RASTER_SIDE)):
   row=yy*stride
   for xx in range(RASTER_SIDE):total+=buf[row+xx];count+=1
  feat.append(round(total/max(count,1)))
 for gx in range(FEATURE_SIDE):
  total=count=0
  for xx in range(gx*block,min((gx+1)*block,RASTER_SIDE)):
   for yy in range(RASTER_SIDE):total+=buf[yy*stride+xx];count+=1
  feat.append(round(total/max(count,1)))
 return bytes(feat)

def build_relations(records):
 byseq={}
 for i,r in enumerate(records):
  if r['seq']:byseq.setdefault(r['seq'],[]).append(i)
 rel={}
 for group in LEGACY_RELATION_GROUPS:
  idx=[j for ch in group for j in byseq.get(ch,[])]
  for a in idx:
   for b in idx:
    if a!=b:rel.setdefault(str(a),set()).add(b)
 return {k:sorted(v) for k,v in rel.items()}

def regression(records,features):
 q=[i for i,r in enumerate(records) if r['seq']=='詰'];t=next(i for i,r in enumerate(records) if r['id']=='MJ024527')
 best={}
 for i in range(len(records)):
  if i in q:continue
  off=i*FEATURE_DIM;f=features[off:off+FEATURE_DIM];d=10**30
  for qi in q:
   qo=qi*FEATURE_DIM;qf=features[qo:qo+FEATURE_DIM];dd=sum((a-b)*(a-b) for a,b in zip(qf,f));d=min(d,dd)
  best[i]=d
 ranked=sorted(best,key=lambda i:(best[i],i));rank=ranked.index(t)+1
 print('regression 詰 -> MJ024527 rank',rank,flush=True)
 if rank>40:raise RuntimeError('regression failed')
 return rank

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--template',required=True);ap.add_argument('--output-dir',required=True);ap.add_argument('--inputs',default='.cache/gaiji');args=ap.parse_args()
 out=Path(args.output_dir);assets=out/'gaiji-maker-assets';assets.mkdir(parents=True,exist_ok=True)
 mjp,ipp,gzip_path,gttf,gwoff=extract_inputs(Path(args.inputs))
 mf=TTFont(ipp);gf=TTFont(gttf)
 rec=parse_mj(mjp,mf)+parse_gj(gf)
 features=bytearray()
 for i,r in enumerate(rec):
  font=mf if r['src']=='MJ' else gf; gn=r['id'].lower()
  features.extend(glyph_feature(font,gn))
  r['i']=i
  if (i+1)%5000==0:print('features',i+1,'/',len(rec),flush=True)
 mf.close();gf.close()
 relations=build_relations(rec);rank=regression(rec,bytes(features))
 records_json=json.dumps(rec,ensure_ascii=False,separators=(',',':')).encode();rel_json=json.dumps(relations,separators=(',',':')).encode()
 (assets/'records.pack').write_bytes(gzip_bytes(records_json));(assets/'features.pack').write_bytes(gzip_bytes(bytes(features)));(assets/'relations.pack').write_bytes(gzip_bytes(rel_json))
 gzip_file(ipp,assets/'ipamjm.pack');gzip_file(gwoff,assets/'acgjm.pack')
 missing=[r['id'] for r in rec if r['src']=='MJ' and not r['impl']]
 source={'label':'行政事務標準文字 実データ','mjCount':EXPECTED_MJ,'gjCount':EXPECTED_GJ,'total':len(rec),'mjList':'mji.00602.xlsx','mjListLicense':'CC BY-SA 2.1 Japan / 原著作物 IPA','mjFont':'IPAmj明朝 Ver.006.01','mjFontLicense':'IPA Font License Agreement v1.0','gjFont':'追加文字行政事務標準明朝 2026-08-18','gjFontLicense':'SIL Open Font License 1.1','mjListSha256':sha256_file(mjp),'mjFontSha256':sha256_file(ipp),'gjZipSha256':sha256_file(gzip_path),'missingMjFontGlyphs':missing,'regression':{'query':'詰','target':'MJ024527','rank':rank}}
 pack={'format':3,'mode':'external-web','source':source,'recordCount':len(rec),'featureDim':FEATURE_DIM,'recordsUrl':'./gaiji-maker-assets/records.pack','featuresUrl':'./gaiji-maker-assets/features.pack','relationsUrl':'./gaiji-maker-assets/relations.pack','fonts':{'mj':{'format':'truetype','url':'./gaiji-maker-assets/ipamjm.pack'},'gj':{'format':'woff2','url':'./gaiji-maker-assets/acgjm.pack'}}}
 template=Path(args.template).read_text('utf-8');html=template.replace('__ADMIN_CHAR_DATA_PACK__',json.dumps(pack,ensure_ascii=False,separators=(',',':'))).replace('__APP_VERSION__',APP_VERSION)
 (out/'gaiji-maker.html').write_text(html,'utf-8')
 report={'version':APP_VERSION,'records':len(rec),'featureDim':FEATURE_DIM,'regressionRank':rank,'files':{p.name:{'size':p.stat().st_size,'sha256':sha256_file(p)} for p in [out/'gaiji-maker.html',assets/'records.pack',assets/'features.pack',assets/'relations.pack',assets/'ipamjm.pack',assets/'acgjm.pack']}}
 (out/'gaiji-maker-build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
 print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()
