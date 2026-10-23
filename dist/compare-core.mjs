export const COMPARE_EDGE=1200;

// Runs in a worker. The caller transfers two bounded RGBA buffers, one pair at a time.
export function comparePixels(a,b,width,height,threshold=28){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>COMPARE_EDGE||height>COMPARE_EDGE||a.length!==width*height*4||b.length!==a.length||!Number.isInteger(threshold)||threshold<8||threshold>80)throw Error('比對影像尺寸或容差無效。');
  const overlay=new Uint8ClampedArray(a.length);let changed=0;
  for(let offset=0;offset<a.length;offset+=4){
    const different=Math.max(Math.abs(a[offset]-b[offset]),Math.abs(a[offset+1]-b[offset+1]),Math.abs(a[offset+2]-b[offset+2]))>threshold;
    if(different){changed++;overlay[offset]=197;overlay[offset+1]=44;overlay[offset+2]=79;}
    else {const gray=Math.round((a[offset]+a[offset+1]+a[offset+2])/3);overlay[offset]=overlay[offset+1]=overlay[offset+2]=Math.round(gray*.65+255*.35);}
    overlay[offset+3]=255;
  }
  return {overlay,changed,total:width*height};
}
