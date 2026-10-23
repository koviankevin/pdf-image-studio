import {multiply,transformPoint} from './document-model.mjs';

function lineBounds(line,matrix){
  const corners=[[line.x,line.y],[line.x+line.width,line.y],[line.x,line.y+line.height],[line.x+line.width,line.y+line.height]].map(point=>transformPoint(matrix,...point));
  return {left:Math.min(...corners.map(p=>p[0])),right:Math.max(...corners.map(p=>p[0])),top:Math.min(...corners.map(p=>p[1])),bottom:Math.max(...corners.map(p=>p[1]))};
}
export function ocrLineVisible(line,frame,crop){if(!crop)return true;const {left,right,top,bottom}=lineBounds(line,frame);return right>=crop.x&&left<=crop.x+crop.width&&bottom>=crop.y&&top<=crop.y+crop.height;}
// Keep earlier OCR outside a new region; store every line in the new region's frame.
export function mergeRegionLines(previous,lines,viewport){
  if(previous?.mode!=='ocr')return lines;
  const matrix=multiply(viewport.transform,previous.frame),retained=[];
  for(const line of previous.lines){
    const {left,right,top,bottom}=lineBounds(line,matrix);
    if(right>0&&left<viewport.width&&bottom>0&&top<viewport.height)continue;
    retained.push({...line,x:left,y:top,width:right-left,height:bottom-top});
  }
  return [...retained,...lines].sort((a,b)=>a.y-b.y||a.x-b.x);
}
