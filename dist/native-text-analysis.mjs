import * as pdfjs from './vendor/pdfjs/pdf.mjs';
import {nativePagePlan} from './native-stream.mjs?v=20261027-native1';
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const I=[1,0,0,1,0,0],cache=new WeakMap();
export async function inspectNativeText(sourcePage,pdfPage){
  if(cache.has(sourcePage))return cache.get(sourcePage);
  const pending=(async()=>{
    const plan=await nativePagePlan(sourcePage),operators=await pdfPage.getOperatorList({annotationMode:pdfjs.AnnotationMode.DISABLE}),names=Object.fromEntries(Object.entries(pdfjs.OPS).map(([k,v])=>[v,k]));
    let s={ctm:I,font:null,size:0,leading:0,charSpace:0,wordSpace:0,hScale:1,rise:0,mode:0,color:'#000000',matrix:I,x:0,y:0,lineX:0,lineY:0},stack=[],formDepth=0,active=null,ordinal=0;
    const blocks=[];const move=(x,y)=>{s.lineX+=x;s.lineY+=y;s.x=s.lineX;s.y=s.lineY;};
    for(let i=0;i<operators.fnArray.length;i++){
      const name=names[operators.fnArray[i]],args=operators.argsArray[i]||[];
      if(name==='paintFormXObjectBegin'){formDepth++;continue;}if(name==='paintFormXObjectEnd'){formDepth--;continue;}if(formDepth)continue;
      if(name==='save')stack.push({...s});else if(name==='restore')s=stack.pop()||s;
      else if(name==='transform')s={...s,ctm:multiply(s.ctm,args)};
      else if(name==='setFont'){s.font=pdfPage.commonObjs.get(args[0]);s.size=args[1];}
      else if(name==='setCharSpacing')s.charSpace=args[0];else if(name==='setWordSpacing')s.wordSpace=args[0];
      else if(name==='setHScale')s.hScale=args[0]/100;else if(name==='setLeading')s.leading=args[0];else if(name==='setTextRise')s.rise=args[0];else if(name==='setTextRenderingMode')s.mode=args[0];
      else if(name==='setFillRGBColor')s.color=args[0];
      else if(name==='beginText'){const raw=plan.blocks[ordinal++];active={raw,safe:!!raw?.safe,parts:[],codes:[],left:Infinity,right:-Infinity,top:-Infinity,bottom:Infinity,baseline:null,size:null,color:null,fontName:null};s={...s,matrix:I,x:0,y:0,lineX:0,lineY:0};}
      else if(name==='endText'){if(active){const text=active.parts.join('');if(active.codes.length!==active.raw?.codes.length||active.codes.some((code,i)=>code!==active.raw.codes[i]))active.safe=false;if(active.safe&&text.trim()&&text.length<=2000&&active.left<active.right&&active.bottom<active.top)blocks.push({id:active.raw.id,sourceHash:plan.hash,text,x:active.left,y:active.top,width:active.right-active.left,height:active.top-active.bottom,baseline:active.baseline,fontSize:active.size,color:active.color,font:/serif|times|ming|song|kai/i.test(active.fontName)&&!/sans/i.test(active.fontName)?'serif':'sans'});active=null;}}
      else if(name==='setTextMatrix'){const matrix=Array.isArray(args[0])||ArrayBuffer.isView(args[0])?Array.from(args[0]):args;s={...s,matrix,x:0,y:0,lineX:0,lineY:0};}
      else if(name==='moveText')move(args[0],args[1]);else if(name==='setLeadingMoveText'){s.leading=-args[1];move(args[0],args[1]);}else if(name==='nextLine')move(0,-s.leading);
      else if(name==='showText'&&active){
        const font=s.font,m=multiply(s.ctm,s.matrix),size=s.size*m[3],origin=point(m,s.x,s.y+s.rise);
        if(!font||font.vertical||font.isType3Font||s.mode!==0||!/^#[\da-f]{6}$/i.test(s.color)||Math.abs(m[1])>.0001||Math.abs(m[2])>.0001||m[0]<=0||m[3]<=0||Math.abs(m[0]*s.hScale/m[3]-1)>.01||size<6||size>120)active.safe=false;
        if(active.size!==null&&(Math.abs(active.size-size)>.01||active.color!==s.color||active.fontName!==font?.name))active.safe=false;
        if(active.baseline!==null&&Math.abs(active.baseline-origin[1])>Math.max(1,size*.2))active.safe=false; // First release: one horizontal baseline per text object.
        active.baseline??=origin[1];active.size??=size;active.color??=s.color;active.fontName??=font?.name;
        const ascent=Number.isFinite(font?.ascent)?font.ascent:.9,descent=Number.isFinite(font?.descent)?font.descent:-.25;
        for(const glyph of args[0]||[]){
          if(typeof glyph==='number'){const advance=-glyph*s.size/1000*s.hScale;if(advance*m[0]>size*.25&&active.parts.length&&!active.parts.at(-1).endsWith(' '))active.parts.push(' ');s.x+=advance;continue;}
          active.codes.push(glyph.originalCharCode);if(!glyph.unicode||/[\u0000-\u0008\u000b-\u001f\u0590-\u08ff\ufffd]/u.test(glyph.unicode))active.safe=false;
          const p=point(m,s.x,s.y+s.rise),advance=(glyph.width*s.size/1000+s.charSpace+(glyph.isSpace?s.wordSpace:0))*s.hScale,q=point(m,s.x+advance,s.y+s.rise);
          active.left=Math.min(active.left,p[0]);active.right=Math.max(active.right,q[0]);active.top=Math.max(active.top,p[1]+ascent*size);active.bottom=Math.min(active.bottom,p[1]+descent*size);active.parts.push(glyph.unicode||'');s.x+=advance;
        }
      }
    }
    if(ordinal!==plan.blocks.length||active||formDepth)throw Error('原文字區塊無法可靠對應，請改用文字替換。');
    return{blocks,unsupported:plan.blocks.filter(b=>b.operands.length).length-blocks.length};
  })();cache.set(sourcePage,pending);try{return await pending;}catch(error){cache.delete(sourcePage);throw error;}
}
