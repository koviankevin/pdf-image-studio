import {comparePixels} from './compare-core.mjs?v=20261024-ease1';
self.onmessage=({data})=>{
  try{const result=comparePixels(new Uint8ClampedArray(data.a),new Uint8ClampedArray(data.b),data.width,data.height,data.threshold);self.postMessage(result,[result.overlay.buffer]);}
  catch(error){self.postMessage({error:error.message});}
};
