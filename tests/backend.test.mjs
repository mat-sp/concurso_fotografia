import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
const source = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
function setup({ time = '2026-10-28T17:00:00Z', writeFail = false, publicFolder = false } = {}) {
  const values = {SUBMISSIONS_OPEN:'true', DRIVE_FOLDER_ID:'private-id', SITE_URL:'https://example.github.io/concurso/', PRIVACY_TEXT:'Texto informativo de prueba, ficticio y no válido para un centro real.'};
  const files=[], folders=[]; let locked=false, writes=0;
  class Folder {
    constructor(name){ this.name=name; this.children=[]; this.trashed=false; folders.push(this); }
    getSharingAccess(){return publicFolder?'ANYONE':'PRIVATE';}
    createFolder(name){ const f=new Folder(name); this.children.push(f); return f; }
    getFoldersByName(name){ const all=this.children.filter(f=>f.name===name&&!f.trashed); return {hasNext:()=>!!all.length,next:()=>all.shift()}; }
    createFile(...args){ if(writeFail && ++writes===3)throw new Error('quota'); const f={args,trashed:false,getId:()=>randomUUID(),setTrashed(v){this.trashed=v;}}; files.push(f); return f; }
    getId(){return this.name;}
    setTrashed(v){this.trashed=v;}
  }
  const root = new Folder('root');
  const RealDate=Date; class FakeDate extends RealDate { constructor(...args){super(...(args.length?args:[time]));} static now(){return new RealDate(time).getTime();} }
  const props={getProperty:k=>values[k]||null,setProperties:p=>Object.assign(values,p)};
  const context=vm.createContext({Date:FakeDate,PropertiesService:{getScriptProperties:()=>props},MimeType:{PLAIN_TEXT:'text/plain'},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>root},
    LockService:{getScriptLock:()=>({tryLock:()=>{locked=true;return true},hasLock:()=>locked,releaseLock:()=>locked=false})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,v)=>[...createHash('sha256').update(v).digest()],base64Decode:s=>[...Buffer.from(s,'base64')],getUuid:randomUUID,newBlob:(bytes,mime,name)=>({bytes,mime,name})}});
  vm.runInContext(source,context);
  return {context,values,files,folders,root,get locked(){return locked;}};
}
// Minimal segment fixture, used to exercise validation and persistence, not as a decoded image fixture.
const jpeg = Buffer.from([255,216,255,224,0,4,0,0,255,225,0,6,69,88,73,70,255,192,0,11,8,0,2,0,3,1,1,17,0,255,218,0,2,1,2,255,217]);
function payload(patch={}) {return {requestId:randomUUID(),fullName:'Prueba Alumno Ficticio',course:'2.º ESO',group:'A',title:'Simetría',location:'San Fernando',explanation:'',acceptRules:true,declareOriginal:true,privacyRead:true,photo:{data:jpeg.toString('base64')},juryPhoto:{data:jpeg.toString('base64')},...patch};}
test('saves original, anonymous image and separate record; returns receipt only after writes',()=>{
 const s=setup(); const r=s.context.submitEntry(payload()); assert.equal(r.ok,true); assert.match(r.code,/^FM-[A-F0-9]{12}$/); assert.equal(s.files.length,5); assert.equal(s.locked,false);
 const work=s.files.find(f=>f.args[0]==='obra.json'); const anon=JSON.parse(work.args[1]); assert.deepEqual(Object.keys(anon).sort(),['code','explanation','photoFileId','title']);
 const record=s.files.find(f=>typeof f.args[0]==='string'&&f.args[0].endsWith('.json')&&f.args[0]!=='obra.json'); assert.equal(JSON.parse(record.args[1]).fullName,'Prueba Alumno Ficticio');
});
test('same request is idempotent and writes no duplicate files',()=>{const s=setup();const p=payload();const a=s.context.submitEntry(p);const b=s.context.submitEntry(p);assert.equal(b.code,a.code);assert.equal(s.files.length,5);});
test('different request for same normalized participant is rejected',()=>{const s=setup();s.context.submitEntry(payload());const r=s.context.submitEntry(payload({fullName:'  PRUEBA  ALUMNO FICTICIO '}));assert.equal(r.ok,false);assert.match(r.message,/Ya consta/);assert.equal(s.files.length,5);});
test('request ID cannot be reused for a different participant',()=>{const s=setup();const p=payload();s.context.submitEntry(p);const r=s.context.submitEntry({...p,fullName:'Otra persona'});assert.equal(r.ok,false);assert.equal(s.files.length,5);});
test('server permits final millisecond of deadline and rejects next millisecond',()=>{const a=setup({time:'2026-11-30T22:59:59.999Z'});assert.equal(a.context.submitEntry(payload()).ok,true);const b=setup({time:'2026-11-30T23:00:00.000Z'});assert.equal(b.context.submitEntry(payload()).ok,false);assert.equal(b.files.length,0);});
test('closed switch and missing privacy block writes',()=>{for(const key of ['SUBMISSIONS_OPEN','PRIVACY_TEXT']){const s=setup();s.values[key]='';assert.equal(s.context.submitEntry(payload()).ok,false);assert.equal(s.files.length,0);}});
test('rejects malformed input, unaccepted bases, empty required fields and arbitrary files',()=>{for(const patch of [{acceptRules:false},{declareOriginal:false},{privacyRead:false},{title:' '},{fullName:'x'.repeat(121)},{website:'bot'},{photo:{data:Buffer.from('<svg/>').toString('base64')}},{photo:{data:'***'}},{juryPhoto:{data:''}}]){const s=setup();assert.equal(s.context.submitEntry(payload(patch)).ok,false);assert.equal(s.files.length,0);}});
test('optional explanation may be empty',()=>{const s=setup();assert.equal(s.context.submitEntry(payload({explanation:''})).ok,true);});
test('rejects oversized base64 before writing',()=>{const s=setup();assert.equal(s.context.submitEntry(payload({photo:{data:'A'.repeat(14*1024*1024)}})).ok,false);assert.equal(s.files.length,0);});
test('root folder cannot be shared by link',()=>{const s=setup({publicFolder:true});assert.equal(s.context.submitEntry(payload()).ok,false);assert.equal(s.files.length,0);});
test('write failure does not confirm, trashes partial work and leaves retry possible',()=>{const s=setup({writeFail:true});const r=s.context.submitEntry(payload());assert.equal(r.ok,false);assert.equal(s.folders.filter(f=>f.name.startsWith('FM-')).every(f=>f.trashed),true);assert.equal(Object.keys(s.values).some(k=>k.startsWith('participant_')),false);assert.equal(s.locked,false);});
test('EXIF removed from anonymous JPEG, original unchanged',()=>{const s=setup();const before=Buffer.from(jpeg);const stripped=Buffer.from(s.context.stripJpegMetadata_([...jpeg]));assert.equal(stripped.includes(Buffer.from('EXIF')),false);assert.deepEqual(jpeg,before);assert.equal(stripped[0],255);assert.equal(stripped[1],216);});
test('Jury copy and original must have matching dimensions',()=>{const s=setup();const changed=Buffer.from(jpeg);changed[24]=4;const r=s.context.submitEntry(payload({juryPhoto:{data:changed.toString('base64')}}));assert.equal(r.ok,false);assert.equal(s.files.length,0);});
