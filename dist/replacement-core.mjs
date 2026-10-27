export const replacementFonts={sans:{family:'PDFChinese',file:'NotoSansCJKtc-Regular.otf'},serif:{family:'PDFChineseSerif',file:'NotoSerifCJKtc-Regular.otf'}};

const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function replacementMeasure(font,size){
  const measure=text=>font.widthOfTextAtSize(text,size);
  if(font.boundsAtSize)measure.bounds=text=>font.boundsAtSize(text,size);
  else if(font.heightAtSize)measure.bounds=text=>({left:0,right:measure(text),ascent:font.heightAtSize(size,{descender:false}),descent:Math.max(0,font.heightAtSize(size)-font.heightAtSize(size,{descender:false}))});
  return measure;
}
// Measure each distinct grapheme once, then shape each completed line once.
// This avoids repeatedly shaping every growing prefix of a long paragraph.
export function replacementLayout(mark,measure){
  const width=mark.width-2*mark.paddingX,textLines=[],unitWidths=new Map();let overflow=width<=0;
  for(const paragraph of mark.text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n')){
    const units=segmenter?Array.from(segmenter.segment(paragraph),v=>v.segment):Array.from(paragraph);let line=[],used=0;
    for(const unit of units){
      if(!unitWidths.has(unit))unitWidths.set(unit,measure(unit));const advance=unitWidths.get(unit);
      if(line.length&&used+advance>width+.01){textLines.push(line.join(''));line=[];used=0;}
      line.push(unit);used+=advance;
    }
    textLines.push(line.join(''));
  }
  const bounds=textLines.map(text=>measure.bounds?.(text)||{left:0,right:measure(text),ascent:mark.fontSize*.8,descent:mark.fontSize*.2});
  const ascent=Math.max(mark.fontSize*.8,...bounds.map(b=>b.ascent)),descent=Math.max(mark.fontSize*.2,...bounds.map(b=>b.descent)),step=Math.max(mark.fontSize*1.3,ascent+descent);
  const requiredHeight=mark.paddingY*2+ascent+descent+(textLines.length-1)*step;
  if(mark.text&&requiredHeight>mark.height+.01)overflow=true;
  const lines=textLines.map((text,index)=>{const b=bounds[index],left=Math.min(0,b.left),right=Math.max(measure(text),b.right);if(right-left>width+.01)overflow=true;return {text,x:mark.x+mark.paddingX-left,y:mark.y+mark.paddingY+ascent+index*step};});
  return {lines,overflow:!!mark.text&&overflow,requiredHeight};
}
