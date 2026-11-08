import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';

const [archive,listFile,reportFile]=process.argv.slice(2);
if(!archive||!listFile||!reportFile)throw Error('Usage: <archive> <source-list> <report>');
const seven='C:/Program Files/7-Zip/7z.exe';
const paths=(await fs.readFile(listFile,'utf8')).trim().split(/\r?\n/);
const expected=new Map();
for(const path of paths){
  const key=path.replaceAll('\\','/').replace(/^[A-Za-z]:\//,'');
  if(expected.has(key))throw Error('Duplicate archive destination');
  expected.set(key,{bytes:(await fs.stat(path)).size,sha256:await sha(path)});
}
const listing=execFileSync(seven,['l','-slt','-sccUTF-8',archive],{encoding:'utf8',maxBuffer:32*1024**2,windowsHide:true});
const entries=listing.split(/\r?\n----------\r?\n/)[1].trim().split(/\r?\n\r?\n/).map(block=>{
  const fields=Object.fromEntries(block.split(/\r?\n/).filter(x=>x.includes(' = ')).map(x=>{const i=x.indexOf(' = ');return [x.slice(0,i),x.slice(i+3)];}));
  return {name:fields.Path.replaceAll('\\','/'),bytes:Number(fields.Size)};
});
if(entries.length!==expected.size)throw Error('Archive membership count changed');
for(const entry of entries)if(!expected.has(entry.name)||entry.bytes!==expected.get(entry.name).bytes)throw Error('Unknown or changed member: '+entry.name);
const child=spawn(seven,['x','-so','-bd','-y',archive],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let errors='',index=0,consumed=0,total=0,hash=createHash('sha256');
child.stderr.on('data',data=>{errors=(errors+data).slice(-2000);});
const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Decoder failed: '+errors)));});
done.catch(()=>{});
function finish(){const entry=entries[index];if(hash.digest('hex')!==expected.get(entry.name).sha256)throw Error('Byte mismatch: '+entry.name);index++;consumed=0;hash=createHash('sha256');}
function empty(){while(entries[index]?.bytes===0)finish();}
try{
  empty();
  for await(const block of child.stdout){
    let offset=0;
    while(offset<block.length){
      const entry=entries[index];if(!entry)throw Error('Unexpected decoded bytes');
      const take=Math.min(entry.bytes-consumed,block.length-offset);
      hash.update(block.subarray(offset,offset+take));offset+=take;consumed+=take;total+=take;
      if(consumed===entry.bytes){finish();empty();}
    }
  }
  await done;if(index!==entries.length)throw Error('Truncated decode');
}catch(error){child.kill();await done.catch(()=>{});throw error;}
const report={archiveBytes:(await fs.stat(archive)).size,archiveSha256:await sha(archive),verifiedFiles:index,verifiedBytes:total,
  proof:'Every archived member decoded to SHA-256 and matched to its exact source; no extraction to disk',
  limits:'Experimental compression archive only; not a setup or installed application acceptance'};
await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
async function sha(path){const hash=createHash('sha256');for await(const block of createReadStream(path))hash.update(block);return hash.digest('hex');}
