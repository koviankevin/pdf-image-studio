import {readFile} from 'node:fs/promises';

// Sends only public package names/versions from this maintained inventory.
// It never inspects PDF files, browser data or environment credentials.
const inventory=JSON.parse(await readFile(new URL('../docs/dependencies.json',import.meta.url),'utf8'));
try{
  const report=[];
  for(const entry of inventory.packages){
    const ids=new Set(),tokens=new Set();let token;
    for(let page=0;page<20;page++){
      const query={package:{name:entry.name,ecosystem:entry.ecosystem},version:entry.version};if(token)query.page_token=token;
      const response=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({queries:[query]}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('OSV HTTP '+response.status);
      const body=await response.json(),value=body?.results?.[0];
      if(body?.results?.length!==1||!value||typeof value!=='object'||value.vulns!==undefined&&!Array.isArray(value.vulns))throw Error('Invalid OSV response');
      for(const vuln of value.vulns||[]){if(typeof vuln.id!=='string'||!vuln.id)throw Error('Invalid advisory ID');ids.add(vuln.id);}
      token=value.next_page_token;if(token!==undefined&&typeof token!=='string')throw Error('Invalid pagination');
      if(!token)break;if(tokens.has(token)||page===19)throw Error('Incomplete OSV pagination');tokens.add(token);
    }
    report.push({name:entry.name,version:entry.version,advisories:[...ids]});
  }
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),service:'https://api.osv.dev',scope:'Recorded npm versions only; excludes embedded dependencies, forks upstream and data files',packages:report},null,2));
  if(report.some(value=>value.advisories.length))process.exitCode=2;
}catch(error){console.error('Dependency check incomplete: '+error.message);process.exitCode=1;}
