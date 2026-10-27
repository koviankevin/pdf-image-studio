export async function rasterDiagnostic(page,bytes){
 const results=[];
 for(const disableNative of [false,true]){
  if(disableNative)await page.route('**/vendor/pdfjs/pdf.worker.mjs*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'globalThis.DecompressionStream=undefined;\n'+await response.text()});});
  results.push(await page.evaluate(async({bytes,disableNative})=>{
   const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs?diagnostic='+disableNative;
   const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,isOffscreenCanvasSupported:false,disableFontFace:true});
   try{const doc=await task.promise,p=await doc.getPage(1),ops=await p.getOperatorList(),renders=[];
    const count=data=>{let ink=0;for(let i=0;i<data.length;i+=4)if(data[i]<250&&data[i+3])ink++;return ink;};
    for(const scale of [1,3]){const v=p.getViewport({scale}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;const ctx=c.getContext('2d');await p.render({canvasContext:ctx,viewport:v}).promise;renders.push({scale,ink:count(ctx.getImageData(0,0,c.width,c.height).data)});c.width=c.height=1;}
    const images=[];for(let i=0;i<ops.fnArray.length;i++)if(ops.fnArray[i]===pdfjs.OPS.paintImageXObject){const id=ops.argsArray[i][0],obj=(id.startsWith('g_')?p.commonObjs:p.objs).get(id);let nonWhite=0;if(obj.data)for(const n of obj.data)if(n<250)nonWhite++;images.push({id,width:obj.width,height:obj.height,kind:obj.kind,bytes:obj.data?.length,nonWhite,bitmap:!!obj.bitmap});}
    return {disableNative,ds:typeof DecompressionStream,renders,images};
   }finally{await task.destroy();}
  },{bytes:[...bytes],disableNative}));
 }
 console.log('[raster-probe] '+JSON.stringify(results));
}
