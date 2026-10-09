import {PDFDocument,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix,setTextRenderingMode} from './vendor/pdf-lib/pdf-lib.mjs';

export const transformPoint=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function inverse(m){const d=m[0]*m[3]-m[1]*m[2];return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
let fontBytes,fontkitPromise;
export async function embedChineseFont(doc){
  fontkitPromise??=import('./vendor/fontkit/fontkit.mjs');
  if(!fontBytes)fontBytes=fetch(new URL('./vendor/fonts/NotoSansCJKtc-Regular.otf',import.meta.url)).then(r=>{if(!r.ok)throw new Error('中文字型載入失敗，請檢查網路後重試。');return r.arrayBuffer();}).catch(e=>{fontBytes=null;throw e;});
  doc.registerFontkit((await fontkitPromise).default);return doc.embedFont(await fontBytes,{subset:true});
}
const color=hex=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
export async function drawPageExtras(doc,page,record,getFont){
  for(const mark of record.annotations||[]){
    page.pushOperators(pushGraphicsState(),concatTransformationMatrix(...mark.frame));
    const c=color(mark.color),w=mark.thickness||2;
    if(mark.type==='text'){
      const font=await getFont();page.pushOperators(concatTransformationMatrix(1,0,0,-1,0,0));
      page.drawText(mark.text,{x:mark.x,y:-(mark.y+mark.fontSize*.88),font,size:mark.fontSize,lineHeight:mark.fontSize*1.3,color:c});
    }else if(mark.type==='arrow'){
      const start={x:mark.x,y:mark.y},end={x:mark.x+mark.width,y:mark.y+mark.height},angle=Math.atan2(mark.height,mark.width),length=Math.max(8,w*4);
      page.drawLine({start,end,thickness:w,color:c});
      for(const sign of [-1,1])page.drawLine({start:end,end:{x:end.x-length*Math.cos(angle+sign*.45),y:end.y-length*Math.sin(angle+sign*.45)},thickness:w,color:c});
    }else if(mark.type==='highlight')page.drawRectangle({x:mark.x,y:mark.y,width:mark.width,height:mark.height,color:c,opacity:.3,borderWidth:0});
    else page.drawRectangle({x:mark.x,y:mark.y,width:mark.width,height:mark.height,borderColor:c,borderWidth:w});
    page.pushOperators(popGraphicsState());
  }
  if(record.ocr?.mode==='ocr'){
    const font=await getFont();
    for(const line of record.ocr.lines){
      const text=line.text.trim().replace(/[\r\n]+/g,' ');if(!text)continue;
      const size=Math.max(2,line.height*.9),natural=font.widthOfTextAtSize(text,size),sx=line.width/Math.max(natural,.01);
      page.pushOperators(pushGraphicsState(),concatTransformationMatrix(...record.ocr.frame),concatTransformationMatrix(sx,0,0,-1,line.x,line.y+line.height*.85),setTextRenderingMode(3));
      page.drawText(text,{x:0,y:0,size,font,opacity:0});page.pushOperators(popGraphicsState());
    }
  }
}
export function imagePageLayout(width,height,mode='a4',landscape=false,margin=24){
  if(!(width>0&&height>0))throw new Error('無效圖片尺寸。');
  const size=mode==='original'?[width*.75,height*.75]:(landscape?[841.89,595.28]:[595.28,841.89]);
  const edge=mode==='original'?0:margin,scale=Math.min((size[0]-2*edge)/width,(size[1]-2*edge)/height);
  return{width:size[0],height:size[1],imageWidth:width*scale,imageHeight:height*scale,x:(size[0]-width*scale)/2,y:(size[1]-height*scale)/2};
}
export async function imageToPdf(file,settings){
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
    if(bitmap.width*bitmap.height>40000000)throw new Error('圖片超過 4,000 萬像素，請先縮小。');
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;
    if(!blob)throw new Error('無法讀取圖片。');
    const doc=await PDFDocument.create(),image=await doc.embedPng(await blob.arrayBuffer()),layout=imagePageLayout(bitmap.width,bitmap.height,settings.mode,settings.landscape,settings.margin);
    const page=doc.addPage([layout.width,layout.height]);page.drawImage(image,{x:layout.x,y:layout.y,width:layout.imageWidth,height:layout.imageHeight});
    return doc.save();
  }finally{bitmap.close();}
}
