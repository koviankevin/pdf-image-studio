export function parsePages(text,count){
  if(!text.trim())return Array.from({length:count},(_,i)=>i+1);
  const pages=new Set();
  for(const part of text.replace(/[，、]/g,',').split(',')){
    const match=part.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if(!match)throw new Error('頁面範圍格式不正確，請輸入例如：1, 3-5。');
    const start=Number(match[1]),end=Number(match[2]??match[1]);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>count)throw new Error(`頁碼須介於 1 至 ${count}，範圍請由小到大填寫。`);
    for(let n=start;n<=end;n++)pages.add(n);
  }
  return [...pages].sort((a,b)=>a-b);
}
export function dimensions(w,h){const width=Math.ceil(w),height=Math.ceil(h);if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>16384||height>16384||width*height>40000000)throw new Error('這一頁的輸出尺寸超過瀏覽器安全範圍（4,000 萬像素或單邊 16,384 px），請降低解析度。');return{width,height};}
function crc32(data){let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
export async function withDensity(blob,dpi,type){
  const input=new Uint8Array(await blob.arrayBuffer());
  if(type==='png'){
    const chunk=new Uint8Array(21),view=new DataView(chunk.buffer);view.setUint32(0,9);chunk.set([112,72,89,115],4);view.setUint32(8,Math.round(dpi/0.0254));view.setUint32(12,Math.round(dpi/0.0254));chunk[16]=1;view.setUint32(17,crc32(chunk.subarray(4,17)));
    const parts=[input.subarray(0,8)];let offset=8;const source=new DataView(input.buffer);
    while(offset+12<=input.length){const size=source.getUint32(offset),end=offset+12+size;const name=String.fromCharCode(...input.subarray(offset+4,offset+8));if(name!=='pHYs')parts.push(input.subarray(offset,end));if(name==='IHDR')parts.push(chunk);offset=end;}
    return new Blob(parts,{type:'image/png'});
  }
  const jfif=new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,dpi>>8,dpi&255,dpi>>8,dpi&255,0,0]);
  if(input[2]===255&&input[3]===224&&input[6]===74&&input[7]===70&&input[8]===73&&input[9]===70){input[13]=1;input[14]=dpi>>8;input[15]=dpi&255;input[16]=dpi>>8;input[17]=dpi&255;return new Blob([input],{type:'image/jpeg'});}
  return new Blob([input.subarray(0,2),jfif,input.subarray(2)],{type:'image/jpeg'});
}
