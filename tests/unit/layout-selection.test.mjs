import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionBounds, moveSelection, scaleSelection, alignSelection, distributeSelection, snapSelection} from '../../dist/layout-selection.mjs';
import {validateFreeLayout} from '../../dist/free-layout-core.mjs';
const size={width:210,height:297};
const item=(id,x,y,width=20,height=30)=>({id,type:'page',record:{sourceId:'s',index:0},x,y,width,height});
test('group moves keep relative positions at every sheet boundary and do not mutate records',()=>{
  const input=[item('a',10,20),item('b',60,70)],copy=structuredClone(input),result=moveSelection(input,1000,-1000,size);
  assert.deepEqual(selectionBounds(result),{x:140,y:0,width:70,height:80});
  assert.equal(result[1].x-result[0].x,50);assert.equal(result[1].y-result[0].y,50);
  assert.deepEqual(input,copy);assert.equal(result[0].record,input[0].record);
});
test('group scaling preserves aspect ratio and relative geometry, scales text and rejects invalid sizes',()=>{
  const input=[item('a',10,20),{...item('b',60,70),type:'text',text:'標題',fontSize:12,color:'#302f2b'}];
  const result=scaleSelection(input,2,size);assert.deepEqual(selectionBounds(result),{x:10,y:20,width:140,height:160});
  assert.equal(result[1].fontSize,24);assert.equal(result[0].width/result[0].height,2/3);
  for(const scale of [0,NaN,Infinity,.1,10])assert.throws(()=>scaleSelection(input,scale,size));
  validateFreeLayout({orientation:'portrait',items:result});
});
test('alignment retains original single-item margins and aligns groups to their own bounds',()=>{
  const input=[item('a',20,20),item('b',80,70,40,40)];
  assert.deepEqual(alignSelection(input,'center',size).map(i=>i.x),[60,50]);
  assert.deepEqual(alignSelection(input,'bottom',size).map(i=>i.y),[80,70]);
  assert.equal(alignSelection([input[0]],'right',size)[0].x,180);
  assert.equal(alignSelection([item('wide',0,0,205,200)],'left',size)[0].x,5);
});
test('equal spacing retains both ends, supports different item sizes and fails atomically on overlap',()=>{
  const input=[item('a',10,10),item('b',25,40,10),item('c',100,100,30)],copy=structuredClone(input),result=distributeSelection(input,'x');
  assert.deepEqual(result.map(i=>i.x),[10,60,100]);assert.deepEqual(input,copy);
  const y=distributeSelection(input,'y');assert.deepEqual(y.map(i=>i.y),[10,55,100]);
  assert.throws(()=>distributeSelection(input.slice(0,2),'x'));assert.throws(()=>distributeSelection([item('a',0,0),item('b',1,1),item('c',2,2)],'x'));
});
test('snapping finds nearby paper and object edges but never moves a group off the page',()=>{
  const input=[item('a',11,12),item('b',41,42)],other=[item('c',80,100)];
  const paper=snapSelection(input,other,-.2,-.2,size,2);assert.equal(selectionBounds(paper.items).x,10);assert.ok(paper.guides.some(g=>g.axis==='x'&&g.value===10));
  const object=snapSelection([item('a',1,1)],other,58,20,size,2);assert.equal(object.items[0].x,60);assert.ok(object.guides.some(g=>g.value===80));
  const far=snapSelection([item('a',1,1)],[],36,36,size,1);assert.deepEqual(far.guides,[]);
  const boundary=snapSelection(input,[],1000,1000,size,3);assert.equal(selectionBounds(boundary.items).x+selectionBounds(boundary.items).width,210);
});
test('persisted multi-selection must refer to unique items on the active sheet',()=>{
  const value={orientation:'portrait',sheetCount:2,activeSheet:0,items:[item('a',0,0),{...item('b',30,30),sheet:1}],selection:['a']};validateFreeLayout(value);
  for(const selection of [['missing'],['b'],['a','a'],'a',Array(31).fill('a')])assert.throws(()=>validateFreeLayout({...value,selection}));
  validateFreeLayout({orientation:'portrait',items:[item('legacy',0,0)]});
});
