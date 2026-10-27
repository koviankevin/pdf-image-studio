import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,StandardFonts,rgb} from '../../dist/vendor/pdf-lib/pdf-lib.mjs';
import {nativePagePlan,nativePageBytes,contentOperations,removeNativeText,NATIVE_CONTENT_LIMIT,nativeOcrLines} from '../../dist/native-stream.mjs';
import {assemblePdf} from '../../dist/editor-core.mjs';
import {validateMarks} from '../../dist/draft-validation.mjs';
const encode=s=>new TextEncoder().encode(s),text=b=>new TextDecoder().decode(b);
async function fixture(){const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),p=doc.addPage([500,500]);p.drawRectangle({x:0,y:0,width:500,height:500,color:rgb(.8,.9,.6)});p.drawText('Original native line',{font,x:40,y:420,size:16});p.drawText('Unchanged text',{font,x:40,y:300,size:16});return PDFDocument.load(await doc.save());}
function mark(plan,id='b0'){return{id:'edit',type:'native',blockId:id,sourceHash:plan.hash,original:{x:40,y:415,width:200,height:25},text:'',font:'sans',background:'#ffffff',color:'#000000',frame:[1,0,0,-1,0,0],x:40,y:-440,width:250,height:30,fontSize:16,paddingX:0,paddingY:0,thickness:2};}
test('native editing removes encoded original text without rewriting other operators or source pages',async()=>{
 const doc=await fixture(),page=doc.getPage(0),plan=await nativePagePlan(page),before=nativePageBytes(page);assert.equal(plan.blocks.length,2);assert.ok(plan.blocks.every(b=>b.safe));assert.deepEqual(plan.blocks[0].codes,[...'Original native line'].map(c=>c.charCodeAt(0)));const edit=mark(plan);validateMarks([edit]);
 const bytes=await assemblePdf([{id:'a',sourceId:'s',index:0,annotations:[edit]},{id:'b',sourceId:'s',index:0}],new Map([['s',{doc}]]),'test'),out=await PDFDocument.load(bytes),first=text(nativePageBytes(out.getPage(0))),second=text(nativePageBytes(out.getPage(1)));
 assert.ok(!first.includes('4F726967696E616C206E6174697665206C696E65'));assert.ok(first.includes('556E6368616E6765642074657874'));assert.ok(first.includes('0.8 0.9 0.6 rg'));assert.ok(second.includes('4F726967696E616C206E6174697665206C696E65'));assert.deepEqual(nativePageBytes(page),before);
 const only=await PDFDocument.load(await assemblePdf([{id:'a',sourceId:'s',index:0,annotations:[edit]}],new Map([['s',{doc}]]),'test'));
 for(const[,object]of only.context.enumerateIndirectObjects())if(object.getContents){let decoded;try{decoded=(await import('../../dist/vendor/pdf-lib/pdf-lib.mjs')).decodePDFRawStream(object).decode();}catch{continue;}assert.ok(!text(decoded).includes('4F726967696E616C206E6174697665206C696E65'),'no orphan copy of the removed content stream');}
});
test('lossless lexical spans handle comments, escaped strings, TJ and split content streams',async()=>{
 const doc=await fixture(),p=doc.getPage(0),font=p.node.Resources().lookup(PDFName.of('Font')).keys()[0];
 const parts=[`% BT (not a text object)\nq BT ${font} 16 Tf 1 0 0 1 40 420 Tm (old \\(nested\\) BT ET) Tj `,'[(more) -20 <74657874>] TJ 2 1 (quoted) " (next) \' ET Q\n'];
 p.node.set(PDFName.of('Contents'),doc.context.obj(parts.map(s=>doc.context.register(doc.context.flateStream(encode(s))))));const plan=await nativePagePlan(p);assert.equal(plan.blocks.length,1);assert.ok(plan.blocks[0].safe);assert.equal(plan.blocks[0].operands.length,4);await removeNativeText(p,[mark(plan)]);const result=text(nativePageBytes(p));assert.ok(result.includes('% BT (not a text object)'));assert.ok(result.includes('2 1 <> " <> \' ET'));assert.ok(!result.includes('quoted'));assert.equal(contentOperations(nativePageBytes(p)).filter(o=>o.name==='BT').length,1);
});
test('unsafe structures, stale targets, duplicate edits and decompression limits fail closed',async()=>{
 assert.throws(()=>contentOperations(encode('BI /W 1 ID binary EI BT ET')),/行內圖片/);assert.throws(()=>contentOperations(encode('BT (unterminated')),/支援/);
 const doc=await fixture(),p=doc.getPage(0),plan=await nativePagePlan(p),edit=mark(plan);await assert.rejects(removeNativeText(p,[{...edit,sourceHash:'0'.repeat(64)}]),/重新選取/);assert.throws(()=>validateMarks([edit,{...edit,id:'other'}]));assert.throws(()=>validateMarks([{...edit,blockId:'../../../bad'}]));
 const font=p.node.Resources().lookup(PDFName.of('Font')).keys()[0];for(const prefix of ['3 Tr','0 0 20 20 re W n','/Span <</ActualText (original)>> BDC']){const stream=doc.context.flateStream(encode(`${prefix} BT ${font} 16 Tf (old) Tj ET${prefix.includes('BDC')?' EMC':''}`));p.node.set(PDFName.of('Contents'),doc.context.obj([doc.context.register(stream)]));const unsafe=await nativePagePlan(p);assert.ok(!unsafe.blocks[0].safe);await assert.rejects(removeNativeText(p,[mark(unsafe)]));}
 p.node.set(PDFName.of('Contents'),doc.context.obj([doc.context.register(doc.context.flateStream(new Uint8Array(NATIVE_CONTENT_LIMIT+1).fill(32)))]));assert.throws(()=>nativePageBytes(p),/4 MB/);
});
test('native edits suppress only overlapping OCR while retaining original saved OCR for undo',()=>{
 const original={x:10,y:10,width:80,height:20},lines=[{text:'old',x:10,y:10,width:80,height:20},{text:'keep',x:10,y:90,width:80,height:20}],record={annotations:[{type:'native',original}],ocr:{mode:'ocr',frame:[1,0,0,1,0,0],lines}};assert.deepEqual(nativeOcrLines(record).map(l=>l.text),['keep']);assert.equal(record.ocr.lines.length,2);assert.equal(nativeOcrLines({...record,ocr:{...record.ocr,mode:'native'}}),lines);assert.equal(nativeOcrLines({...record,annotations:[]}),lines);
});

test('opaque graphics states remain editable while preexisting hidden source text is rejected',async()=>{
 const doc=await fixture(),p=doc.getPage(0),font=p.node.Resources().lookup(PDFName.of('Font')).keys()[0];p.node.Resources().set(PDFName.of('ExtGState'),doc.context.obj({Normal:{ca:1,CA:1,BM:'Normal'}}));
 const set=code=>p.node.set(PDFName.of('Contents'),doc.context.obj([doc.context.register(doc.context.flateStream(encode(code)))]));set(`/Normal gs BT ${font} 16 Tf (visible) Tj ET`);assert.ok((await nativePagePlan(p)).blocks[0].safe);
 set(`BT ${font} 16 Tf (visible) Tj ET BT 3 Tr (hidden) Tj ET`);assert.ok((await nativePagePlan(p)).blocks.every(b=>!b.safe));
});

test('bundled CJK scalar advances equal shaped glyph advances for both replacement fonts',async()=>{
 const {readFile}=await import('node:fs/promises'),fontkit=(await import('../../dist/vendor/fontkit/fontkit.mjs')).default;
 for(const name of ['NotoSansCJKtc-Regular.otf','NotoSerifCJKtc-Regular.otf']){const font=fontkit.create(new Uint8Array(await readFile(new URL('../../dist/vendor/fonts/'+name,import.meta.url))));for(const cp of [0x3400,...Array.from({length:1000},(_,i)=>0x4e00+i),0x9fff,0x20000,0x2fa1f]){const scalar=font.glyphForCodePoint(cp).advanceWidth,shaped=font.layout(String.fromCodePoint(cp)).glyphs.reduce((sum,g)=>sum+g.advanceWidth,0);assert.equal(scalar,shaped,name+' U+'+cp.toString(16));}}
});

test('Word page-sized clipping and opaque states inside text stay editable; smaller or complex clips stay blocked',async()=>{
 const doc=await fixture(),p=doc.getPage(0),font=p.node.Resources().lookup(PDFName.of('Font')).keys()[0];p.node.Resources().set(PDFName.of('ExtGState'),doc.context.obj({Normal:{ca:1,CA:1},Alpha:{ca:.5}}));
 const set=code=>p.node.set(PDFName.of('Contents'),doc.context.obj([doc.context.register(doc.context.flateStream(encode(code)))])),body=`BT ${font} 16 Tf /Normal gs 1 0 0 1 40 420 Tm (WORD_CLIPPED_LINE) Tj ET`;
 for(const prefix of ['0.000008871 0 500 500 re W* n','0 0 500 500 re W n','2 0 0 2 0 0 cm 0 0 250 250 re W n','0 1 -1 0 500 0 cm 0 0 500 500 re W n']){set(`q ${prefix} ${body} Q`);const plan=await nativePagePlan(p);assert.ok(plan.blocks[0].safe,prefix);await removeNativeText(p,[mark(plan)]);assert.ok(!text(nativePageBytes(p)).includes('WORD_CLIPPED_LINE'));assert.ok(text(nativePageBytes(p)).includes(prefix));}
 for(const prefix of ['0 0 500 500 re W','0 0 250 500 re 2 0 0 1 0 0 cm W n','0 0 20 20 re W n','1 0 0 1 20 0 cm 0 0 500 500 re W n','1 0 .2 1 0 0 cm 0 0 500 500 re W n','0 0 500 500 re 10 10 20 20 re W* n','0 0 500 500 re W* 10 10 20 20 re n','0 0 m 500 0 l 500 500 l 0 500 l h W n','0 0 20 20 re W n 0 0 500 500 re W n']){set(`q ${prefix} ${body} Q`);assert.equal((await nativePagePlan(p)).blocks[0].safe,false,prefix);}
 set(`q 0 0 20 20 re W n Q ${body}`);assert.ok((await nativePagePlan(p)).blocks[0].safe,'Q restores prior clip');
 set(`q 0 0 500 500 re W n BT ${font} 16 Tf /Alpha gs (transparent) Tj ET Q`);assert.equal((await nativePagePlan(p)).blocks[0].safe,false);
 p.setMediaBox(-50,-25,500,500);p.setCropBox(0,0,400,400);set(`q -50 -25 500 500 re W n ${body} Q`);assert.ok((await nativePagePlan(p)).blocks[0].safe,'nonzero MediaBox origin');set(`q 0 0 400 400 re W n ${body} Q`);assert.equal((await nativePagePlan(p)).blocks[0].safe,false,'CropBox alone is not full-page proof');

});
