import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

test('every export path shares one version of drawing, editing and persistence modules',async()=>{
  const root=new URL('../../dist/',import.meta.url),critical=new Set(['document-model','editor-core','draft-store','free-layout-core','imposition-core','project-catalog','product-core','release-info','pdf-canvas','native-stream']),urls=new Map([...critical].map(name=>[name,new Set()]));
  for(const name of await readdir(root)){
    if(!name.endsWith('.mjs'))continue;const source=await readFile(new URL(name,root),'utf8');
    for(const match of source.matchAll(/from\s+['"]\.\/([^/'"?]+)\.mjs([^'"]*)['"]/g))if(critical.has(match[1]))urls.get(match[1]).add(match[1]+'.mjs'+match[2]);
  }
  for(const [name,versions]of urls){assert.equal(versions.size,1,`${name} must not load twice through different cache versions: ${[...versions]}`);assert.match([...versions][0],/\?v=\d{8}-/);}
});
