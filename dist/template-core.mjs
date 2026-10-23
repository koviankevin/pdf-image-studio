import {validSettings} from './workflow-core.mjs?v=20261024-studio1';
import {sheetLayout} from './imposition-core.mjs?v=20261024-studio1';
import {validateFreeLayout} from './free-layout-core.mjs?v=20261024-studio1';

const oneOf=(...values)=>value=>values.includes(value);
const number=(min,max,integer=false)=>value=>value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max&&(!integer||Number.isInteger(Number(value)));
const color=value=>/^#[\da-f]{6}$/i.test(value);
export const templateFields={
  dpi:oneOf('150','300','450','600'),format:oneOf('png','jpeg'),'max-edge':value=>number(0,0,true)(value)||number(64,16384,true)(value),'jpeg-quality':number(30,100,true),
  'nup-preset':oneOf('2','4','6','custom'),'nup-rows':number(1,6,true),'nup-columns':number(1,6,true),'nup-orientation':oneOf('portrait','landscape'),'nup-margin':number(0,50),'nup-gap':number(0,50),
  'blank-orientation':oneOf('portrait','landscape'),'batch-header':value=>value.length<=120,'batch-footer':value=>value.length<=120,'batch-start':number(1,9999,true),'batch-size':number(8,24),'batch-align':oneOf('left','center','right'),'batch-margin':number(3,30),'batch-color':color,
  'image-page-size':oneOf('a4','original'),'image-orientation':oneOf('portrait','landscape'),'image-margin':oneOf('0','24','48'),
  'ocr-mode':oneOf('auto','force'),'ocr-language':oneOf('chi_tra+eng','eng'),'ocr-layout':oneOf('auto','single-column','two-column'),
};
export function cleanTemplate(value){
  if(!value||typeof value!=='object'||!value.settings||typeof value.settings!=='object')throw Error('範本設定不完整。');
  const settings={};for(const [id,validate]of Object.entries(templateFields)){const field=value.settings[id];if(typeof field!=='string'||field.length>120||!validate(field))throw Error('範本設定格式不正確，請檢查欄位範圍。');settings[id]=field;}
  if(!validSettings({dpi:Number(settings.dpi),format:settings.format,maxEdge:Number(settings['max-edge']),quality:Number(settings['jpeg-quality'])/100}))throw Error('圖片設定無效。');
  const presets={'2':[1,2],'4':[2,2],'6':[3,2]},grid=presets[settings['nup-preset']]||[Number(settings['nup-rows']),Number(settings['nup-columns'])];
  sheetLayout({rows:grid[0],columns:grid[1],orientation:settings['nup-orientation'],margin:Number(settings['nup-margin']),gap:Number(settings['nup-gap'])});
  if(!value.layout||!Array.isArray(value.layout.items)||value.layout.items.length>300)throw Error('範本版型格式不正確。');
  const layout={orientation:value.layout.orientation,created:value.layout.created??!!(value.layout.items.length||(value.layout.sheetCount??1)>1),sheetCount:value.layout.sheetCount??1,items:value.layout.items.map(item=>{
    if(!item||typeof item!=='object')throw Error('範本項目格式不正確。');
    const result={type:item.type,sheet:item.sheet??0,x:item.x,y:item.y,width:item.width,height:item.height};
    if(item.type==='text')Object.assign(result,{text:item.text,fontSize:item.fontSize,color:item.color});return result;
  })};
  validateFreeLayout({...layout,items:layout.items.map((item,index)=>({...item,id:String(index),...(item.type==='page'?{record:{sourceId:'slot',index:0}}:{})}))},{allowEmpty:true});
  return {settings,layout};
}
export function readTemplates(text){
  if(text===null)return [];
  if(typeof text!=='string'||text.length>1024*1024||new TextEncoder().encode(text).length>1024*1024)throw Error('範本資料過大。');
  const value=JSON.parse(text),ids=new Set();if(value?.version!==1||!Array.isArray(value.templates)||value.templates.length>20)throw Error('範本資料格式不正確。');
  return value.templates.map(item=>{if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>60)throw Error('範本名稱或識別碼無效。');ids.add(item.id);return {id:item.id,name:item.name,...cleanTemplate(item)};});
}
export function encodeTemplates(templates){const text=JSON.stringify({version:1,templates});readTemplates(text);return text;}
