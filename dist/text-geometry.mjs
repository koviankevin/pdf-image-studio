import {transformPoint} from './document-model.mjs?v=20261028-hub4';

// PDF text advances along the transform's baseline, which may be rotated or skewed.
export function textItemBounds(item,transform=[1,0,0,1,0,0]){
  if(!Array.isArray(item.transform)||item.transform.length!==6||!item.transform.every(Number.isFinite)||!Number.isFinite(item.width)||!Number.isFinite(item.height))return null;
  const [a,b,c,d,x,y]=item.transform,w=Math.max(1,item.width),h=Math.max(1,item.height||Math.hypot(c,d)),u=Math.hypot(a,b)||1,v=Math.hypot(c,d)||1;
  const corners=[[x,y],[x+a/u*w,y+b/u*w],[x+c/v*h,y+d/v*h],[x+a/u*w+c/v*h,y+b/u*w+d/v*h]].map(point=>transformPoint(transform,...point));
  return {left:Math.min(...corners.map(p=>p[0])),top:Math.min(...corners.map(p=>p[1])),right:Math.max(...corners.map(p=>p[0])),bottom:Math.max(...corners.map(p=>p[1]))};
}
