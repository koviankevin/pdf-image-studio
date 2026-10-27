export async function rasterDiagnostic(page,bytes){
 const results=await page.evaluate(async bytes=>{
  const pdfjs=await import('/vendor/pdfjs/pdf.mjs'),results=[];
  const count=data=>{let ink=0;for(let i=0;i<data.length;i+=4)if(data[i]<250&&data[i+3])ink++;return ink;};
  for(const mode of ['default','cpu','retain','attached']){
   const retained=[];class Factory{create(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return{canvas,context:canvas.getContext('2d',{willReadFrequently:true})};}reset(o,w,h){o.canvas.width=w;o.canvas.height=h;}destroy(o){retained.push(o.canvas);}}
   const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,isOffscreenCanvasSupported:false,...(mode==='retain'?{CanvasFactory:Factory}:{})});
   try{const doc=await task.promise,p=await doc.getPage(1),ops=await p.getOperatorList(),v=p.getViewport({scale:1}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;if(mode==='attached')document.body.append(c);const ctx=c.getContext('2d',{willReadFrequently:mode==='cpu'});await p.render({canvasContext:ctx,viewport:v}).promise;const rendered=count(ctx.getImageData(0,0,c.width,c.height).data);
    const id=ops.argsArray[ops.fnArray.indexOf(pdfjs.OPS.paintImageXObject)][0],obj=p.objs.get(id),source=document.createElement('canvas');source.width=obj.width;source.height=obj.height;const sc=source.getContext('2d',{willReadFrequently:true}),raw=sc.createImageData(obj.width,obj.height);for(let i=0,j=0;i<obj.data.length;i+=3,j+=4){raw.data[j]=obj.data[i];raw.data[j+1]=obj.data[i+1];raw.data[j+2]=obj.data[i+2];raw.data[j+3]=255;}sc.putImageData(raw,0,0);const sourceInk=count(sc.getImageData(0,0,source.width,source.height).data);ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);const copied=count(ctx.getImageData(0,0,c.width,c.height).data);results.push({mode,rendered,sourceInk,copied,retained:retained.length});source.width=source.height=1;c.remove();c.width=c.height=1;for(const canvas of retained)canvas.width=canvas.height=1;
   }finally{await task.destroy();}
  }return results;
 },[...bytes]);console.log('[raster-probe] '+JSON.stringify(results));
}
