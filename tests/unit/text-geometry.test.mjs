import {test} from 'node:test';
import assert from 'node:assert/strict';
import {textItemBounds} from '../../dist/text-geometry.mjs';

test('text bounds follow a vertical baseline instead of horizontal width',()=>{
  assert.deepEqual(textItemBounds({transform:[0,12,-12,0,100,10],width:90,height:12}),{left:88,top:10,right:100,bottom:100});
});
test('text bounds include all skewed corners after viewport transformation',()=>{
  const bounds=textItemBounds({transform:[3,4,0,5,10,20],width:10,height:5},[2,0,0,-2,-10,100]);
  assert.deepEqual(bounds,{left:10,top:34,right:22,bottom:60});
});
test('non-text entries and invalid metrics have no text bounds',()=>{
  assert.equal(textItemBounds({type:'beginMarkedContent'}),null);
  assert.equal(textItemBounds({transform:[1,0,0,1,0,0],width:NaN,height:10}),null);
});
