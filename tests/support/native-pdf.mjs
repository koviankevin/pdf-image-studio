export async function createNativePdf(page,{serif=false}={}){
 return Buffer.from(await page.evaluate(async serif=>{
  const lib=await import('/vendor/pdf-lib/pdf-lib.mjs'),{PDFDocument,StandardFonts,rgb,PDFName}=lib,doc=await PDFDocument.create(),font=await doc.embedFont(serif?StandardFonts.TimesRoman:StandardFonts.Helvetica);
  doc.registerFontkit((await import('/vendor/fontkit/fontkit.mjs')).default);const chinese=await doc.embedFont(await(await fetch('/vendor/fonts/NotoSansCJKtc-Regular.otf')).arrayBuffer(),{subset:true});
  const first=doc.addPage([500,500]);first.drawRectangle({x:0,y:0,width:500,height:500,color:rgb(.8,.9,.6)});first.drawText('ORIGINAL_WORD_LINE',{font,size:16,x:40,y:420});first.drawText('原始中文內容',{font:chinese,size:16,x:40,y:340});first.drawText('Two lines in one object\nStay untouched',{font,size:14,x:40,y:260,lineHeight:20});
  const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='#2563ab';ctx.fillRect(0,0,40,40);const png=await new Promise(r=>canvas.toBlob(r,'image/png')),image=await doc.embedPng(await png.arrayBuffer());first.drawImage(image,{x:380,y:60,width:40,height:40});
  const formDoc=await PDFDocument.create(),formFont=await formDoc.embedFont(StandardFonts.Helvetica),form=formDoc.addPage([240,30]);form.drawText('FORM_TEXT_MUST_STAY',{font:formFont,size:12,x:0,y:10});const embedded=await doc.embedPdf(await formDoc.save());first.drawPage(embedded[0],{x:40,y:80,width:240,height:30});
  const other=doc.addPage([400,500]);other.drawText('UNCHANGED_SECOND_PAGE',{font,size:16,x:30,y:430});
  // A typical Word TJ array containing kerning adjustments, not a simple Tj.
  const contents=first.node.Contents(),raw=contents.lookup(0),bytes=raw.getUnencodedContents();let text=new TextDecoder().decode(bytes);const encoded=[...'ORIGINAL_WORD_LINE'].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('').toUpperCase();text=text.replace('<'+encoded+'> Tj','[<'+encoded.slice(0,16)+'> 0 <'+encoded.slice(16)+'>] TJ');first.node.set(PDFName.of('Contents'),doc.context.obj([doc.context.register(doc.context.flateStream(new TextEncoder().encode(text)))]));
  return [...await doc.save()];
 },serif));
}
