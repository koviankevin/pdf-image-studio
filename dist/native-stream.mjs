import {PDFArray,PDFName,PDFRawStream,PDFContentStream,decodePDFRawStream,parseContentStream} from './vendor/pdf-lib/pdf-lib.mjs';
export const NATIVE_CONTENT_LIMIT=4*1024*1024;
const bad=message=>{throw Error(message||'此頁的文字結構暫不支援原文編輯。');};
const whitespace=c=>c==='\0'||/^[\t\n\f\r ]$/.test(c);
const delimiter=c=>!c||whitespace(c)||'()<>[]{}/%'.includes(c);
// Lossless offsets: only text-show operands will be replaced. No serialization
// of unrelated operators, binary images or resource dictionaries is performed.
export function contentOperations(bytes){
  if(bytes.length>NATIVE_CONTENT_LIMIT)bad('此頁文字指令超過 4 MB，暫不提供原文編輯。');
  const s=new TextDecoder('latin1').decode(bytes),ops=[];let i=0,nodes=0;
  function skip(){while(i<s.length){if(whitespace(s[i]))i++;else if(s[i]==='%'){while(i<s.length&&!/[\r\n]/.test(s[i]))i++;}else break;}}
  function object(depth=0){
    if(depth>32||++nodes>200000)bad('此頁文字結構過於複雜。');skip();const start=i,c=s[i];if(!c)bad();
    if(c==='('){i++;let nesting=1;while(i<s.length&&nesting){const ch=s[i++];if(ch==='\\'){if(s[i]==='\r'&&s[i+1]==='\n')i+=2;else if(i<s.length)i++;}else if(ch==='(')nesting++;else if(ch===')')nesting--;if(nesting>64)bad();}if(nesting)bad();return{kind:'string',start,end:i};}
    if(c==='<'&&s[i+1]!=='<'){i++;while(i<s.length&&s[i]!=='>'){if(!/[\da-f\s]/i.test(s[i]))bad();i++;}if(s[i++]!=='>')bad();return{kind:'string',start,end:i};}
    if(c==='['){i++;const values=[];skip();while(i<s.length&&s[i]!==']'){values.push(object(depth+1));skip();}if(s[i++]!==']')bad();return{kind:'array',values,start,end:i};}
    if(c==='<'&&s[i+1]==='<'){i+=2;const values=[];skip();while(i<s.length&&s.slice(i,i+2)!=='>>'){const key=object(depth+1);if(key.kind!=='name')bad();values.push([key,object(depth+1)]);skip();}if(s.slice(i,i+2)!=='>>')bad();i+=2;return{kind:'dict',values,start,end:i};}
    if(c==='/'){i++;while(i<s.length&&!delimiter(s[i]))i++;return{kind:'name',value:s.slice(start+1,i).replace(/#([\da-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))),start,end:i};}
    if(')]}>'.includes(c))bad();while(i<s.length&&!delimiter(s[i]))i++;if(i===start)bad();const value=s.slice(start,i);
    if(/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)){const number=Number(value);if(!Number.isFinite(number))bad();return{kind:'number',value:number,start,end:i};}
    return{kind:'word',value,start,end:i};
  }
  let args=[];while(i<s.length){skip();if(i>=s.length)break;const token=object();if(token.kind==='word'&&!['true','false','null'].includes(token.value)){if(token.value==='BI')bad('此頁含行內圖片，暫不提供原文編輯。');ops.push({name:token.value,args,start:args[0]?.start??token.start,end:token.end});args=[];if(ops.length>50000)bad('此頁文字指令過多。');}else{args.push(token);if(args.length>10000)bad();}}
  if(args.length)bad();return ops;
}
function decoded(stream,remaining){
  if(stream instanceof PDFContentStream){const bytes=stream.getUnencodedContents();if(bytes.length>remaining)bad('此頁文字指令超過 4 MB。');return bytes;}
  if(!(stream instanceof PDFRawStream))bad();if(stream.getContents().length>NATIVE_CONTENT_LIMIT)bad('此頁壓縮文字指令超過 4 MB。');const filters=stream.dict.lookup(PDFName.of('Filter'));
  const names=filters instanceof PDFArray?filters.asArray():filters?[filters]:[];
  if(names.length>4||names.some(name=>!['/FlateDecode','/ASCIIHexDecode','/ASCII85Decode','/LZWDecode','/RunLengthDecode'].includes(String(name))))bad('此頁壓縮格式暫不支援原文編輯。');
  if(stream.dict.has(PDFName.of('DecodeParms'))&&String(stream.dict.lookup(PDFName.of('DecodeParms')))!=='null')bad('此頁壓縮參數暫不支援原文編輯。');
  const decoder=decodePDFRawStream(stream),visited=new Set();
  function bound(value,depth=0){if(!value||typeof value!=='object'||visited.has(value)||depth>12||ArrayBuffer.isView(value))return;visited.add(value);if(typeof value.ensureBuffer==='function'){const ensure=value.ensureBuffer;value.ensureBuffer=function(length){if(length>remaining)bad('此頁文字指令超過 4 MB。');return ensure.call(this,length);};}for(const key of ['str','stream','input'])bound(value[key],depth+1);}
  bound(decoder);const bytes=decoder.decode();if(bytes.length>remaining)bad('此頁文字指令超過 4 MB。');return bytes;
}
export function nativePageBytes(page){
  const context=page.doc.context,contents=page.node.Contents();if(!contents)return new Uint8Array();
  const streams=contents instanceof PDFArray?contents.asArray():[contents],parts=[];let length=0;
  if(streams.length>2000)bad('此頁內容串流過多。');
  for(const ref of streams){const bytes=decoded(context.lookup(ref),NATIVE_CONTENT_LIMIT-length-1);parts.push(bytes);length+=bytes.length+1;}
  const out=new Uint8Array(length);let pos=0;for(const bytes of parts){out.set(bytes,pos);pos+=bytes.length;out[pos++]=10;}return out;
}
const textOps=new Set(['Tj','TJ',"'",'"']);
const allowedText=new Set(['Tf','Tc','Tw','Tz','TL','Tr','Ts','Td','TD','Tm','T*','Tj','TJ',"'",'"','rg','g','k','RG','G','K','BMC','BDC','EMC']);
const value=token=>token?.value;
export async function nativePagePlan(page){
  const bytes=nativePageBytes(page),ops=contentOperations(bytes),blocks=[],stack=[],marked=[];let state={mode:0,font:null,unsafe:false,clip:false},active=null;
  const resources=page.node.Resources(),fonts=resources?.lookup(PDFName.of('Font'));
  for(const op of ops){
    if(op.name==='q'){stack.push({...state});if(active)active.safe=false;}
    else if(op.name==='Q'){if(active)active.safe=false;state=stack.pop()||{mode:0,font:null,unsafe:true,clip:true};}
    else if(['W','W*'].includes(op.name))state.clip=true;
    else if(op.name==='gs'){const states=resources?.lookup(PDFName.of('ExtGState')),entry=states?.lookup(PDFName.of(value(op.args[0])||''));if(!entry||entry.keys().some(k=>!['/Type','/ca','/CA','/BM','/SMask','/SA','/OP','/op','/OPM','/LW','/LC','/LJ','/ML','/D','/RI','/FL'].includes(String(k)))||['ca','CA'].some(k=>entry.has(PDFName.of(k))&&String(entry.lookup(PDFName.of(k)))!=='1')||entry.has(PDFName.of('BM'))&&String(entry.lookup(PDFName.of('BM')))!=='/Normal'||entry.has(PDFName.of('SMask'))&&String(entry.lookup(PDFName.of('SMask')))!=='/None')state.unsafe=true;}
    else if(op.name==='Tr')state.mode=value(op.args[0]);
    else if(op.name==='Tf')state.font=value(op.args[0]);
    else if(op.name==='BMC')marked.push(false);
    else if(op.name==='BDC'){const properties=op.args[1];marked.push(properties?.kind!=='dict'||properties.values.some(([k])=>['ActualText','OC','Alt','E'].includes(k.value))||op.args[0]?.value==='OC');}
    else if(op.name==='EMC'){if(!marked.length)bad();marked.pop();}
    if(op.name==='BT'){if(active)bad();active={id:'b'+blocks.length,safe:!state.unsafe&&!state.clip&&!marked.some(Boolean),operands:[],codes:[],start:op.start};}
    else if(op.name==='ET'){if(!active)bad();active.end=op.end;blocks.push(active);active=null;if(blocks.length>2000)bad('此頁文字區塊超過 2,000 個。');}
    else if(active){
      if(!allowedText.has(op.name)||state.unsafe||state.clip||state.mode!==0||marked.some(Boolean))active.safe=false;
      if(textOps.has(op.name)){
        active.hidden ||= state.mode===3;
        const operand=op.args.at(-1),font=fonts?.lookup(PDFName.of(state.font||''));
        if(!/^[\x21-\x7e]+$/.test(state.font||''))active.safe=false;
        if(!font||String(font.lookup(PDFName.of('Subtype')))==='/Type3')active.safe=false;
        if(op.name==='TJ'?(op.args.length!==1||operand?.kind!=='array'||operand.values.some(v=>!['number','string'].includes(v.kind))):(operand?.kind!=='string'||op.args.length!==(op.name==='"'?3:1)))active.safe=false;
        else{
          active.operands.push({start:operand.start,end:operand.end,empty:op.name==='TJ'?'[]':'<>'});
          if(operand.end-operand.start>16000)active.safe=false;
          else if(font){const composite=String(font.lookup(PDFName.of('Subtype')))==='/Type0',width=composite?2:1;if(composite&&String(font.lookup(PDFName.of('Encoding')))!=='/Identity-H')active.safe=false;
            const raw=bytes.subarray(operand.start,operand.end),input=new Uint8Array(raw.length+3);input.set(raw);input.set(new TextEncoder().encode(' Tj'),raw.length);const decoded=parseContentStream(input)[0]?.args[0],strings=op.name==='TJ'?decoded:[decoded];
            if(!Array.isArray(strings))active.safe=false;else for(const token of strings){if(typeof token==='number')continue;const data=token?.bytes;if(!data||data.length%width){active.safe=false;continue;}for(let i=0;i<data.length;i+=width){if(active.codes.length>=2000){active.safe=false;break;}active.codes.push(width===2?data[i]*256+data[i+1]:data[i]);}}
          }
        }
      }
    }
  }
  if(active||stack.length||marked.length)bad();if(blocks.some(b=>b.hidden))for(const block of blocks)block.safe=false;const digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  return{bytes,hash,blocks};
}
export async function removeNativeText(page,marks){
  if(!marks.length)return;const plan=await nativePagePlan(page),patches=[],seen=new Set();
  for(const mark of marks){const block=plan.blocks.find(b=>b.id===mark.blockId);if(mark.sourceHash!==plan.hash||!block?.safe||!block.operands.length||seen.has(mark.blockId))bad('原文區塊已改變或不支援，請重新選取原文。');seen.add(mark.blockId);patches.push(...block.operands);}
  patches.sort((a,b)=>a.start-b.start);const chunks=[];let cursor=0,total=0;for(const patch of patches){if(patch.start<cursor)bad();const before=plan.bytes.subarray(cursor,patch.start),after=new TextEncoder().encode(patch.empty);chunks.push(before,after);total+=before.length+after.length;cursor=patch.end;}chunks.push(plan.bytes.subarray(cursor));total+=plan.bytes.length-cursor;const out=new Uint8Array(total);cursor=0;for(const part of chunks){out.set(part,cursor);cursor+=part.length;}
  const stream=page.doc.context.flateStream(out);page.node.set(PDFName.of('Contents'),page.doc.context.obj([page.doc.context.register(stream)]));
}

// Keep unrelated OCR, suppress stale hidden lines where native text was edited.
// The original OCR stays in draft history so removing the edit can restore it.
export function nativeOcrLines(record){
  const regions=(record.annotations||[]).filter(m=>m.type==='native').map(m=>m.original);
  if(!regions.length||record.ocr?.mode!=='ocr')return record.ocr?.lines||[];
  return(record.ocr?.lines||[]).filter(line=>{const f=line.frame||record.ocr.frame,corners=[[line.x,line.y],[line.x+line.width,line.y],[line.x,line.y+line.height],[line.x+line.width,line.y+line.height]].map(([x,y])=>[f[0]*x+f[2]*y+f[4],f[1]*x+f[3]*y+f[5]]),left=Math.min(...corners.map(p=>p[0])),right=Math.max(...corners.map(p=>p[0])),bottom=Math.min(...corners.map(p=>p[1])),top=Math.max(...corners.map(p=>p[1]));return!regions.some(r=>right>r.x&&left<r.x+r.width&&top>r.y&&bottom<r.y+r.height);});
}
