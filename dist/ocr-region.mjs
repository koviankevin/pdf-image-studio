import {multiply,transformPoint} from './document-model.mjs?v=20261027-word1';

function lineBounds(line,matrix){
  const corners=[[line.x,line.y],[line.x+line.width,line.y],[line.x,line.y+line.height],[line.x+line.width,line.y+line.height]].map(point=>transformPoint(matrix,...point));
  return {left:Math.min(...corners.map(p=>p[0])),right:Math.max(...corners.map(p=>p[0])),top:Math.min(...corners.map(p=>p[1])),bottom:Math.max(...corners.map(p=>p[1]))};
}
export function ocrLineVisible(line,frame,crop){if(!crop)return true;const {left,right,top,bottom}=lineBounds(line,line.frame||frame);return right>=crop.x&&left<=crop.x+crop.width&&bottom>=crop.y&&top<=crop.y+crop.height;}
// Keep earlier OCR in its original frame, including its baseline direction.
export function mergeRegionLines(previous,lines,viewport){
  if(previous?.mode!=='ocr')return lines;
  const retained=[],positions=new Map();
  for(const line of previous.lines){
    const frame=line.frame||previous.frame,{left,right,top,bottom}=lineBounds(line,multiply(viewport.transform,frame));
    if(right>0&&left<viewport.width&&bottom>0&&top<viewport.height)continue;
    const saved={...line,frame};retained.push(saved);positions.set(saved,{x:left,y:top});
  }
  return [...retained,...lines].sort((a,b)=>(positions.get(a)||a).y-(positions.get(b)||b).y||(positions.get(a)||a).x-(positions.get(b)||b).x);
}
