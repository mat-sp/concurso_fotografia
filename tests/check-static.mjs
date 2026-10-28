import {readFileSync, existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const f of ['docs/site.js','docs/config.js']) new vm.Script(readFileSync(resolve(root,f),'utf8'),{filename:f});
const template=readFileSync(resolve(root,'apps-script/Formulario.html'),'utf8');
const preview=readFileSync(resolve(root,'docs/form-preview.html'),'utf8');
assert.equal(preview,template.replace('const CONFIG = <?!= clientConfig ?>;', 'const CONFIG = {demo:true,ready:false,closed:false,privacyText:"",basesUrl:"./index.html#bases"};'));
for(const f of ['docs/index.html','docs/form-preview.html']) {
 const html=readFileSync(resolve(root,f),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,`duplicate IDs in ${f}`);
 for(const m of html.matchAll(/(?:src|href)="(\.\/[^"#]+)(?:#[^"]*)?"/g)) assert.ok(existsSync(resolve(root,dirname(f),m[1])),`missing asset: ${m[1]}`);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if(m[1].trim()) new vm.Script(m[1],{filename:f});
}
const html=readFileSync(resolve(root,'docs/index.html'),'utf8');
for(const text of ['30 de noviembre de 2026','4 y el 9 de diciembre de 2026','paneles de la planta baja','mismo peso','empate','explicación no supondrá una penalización']) assert.ok(html.includes(text),`missing agreed content: ${text}`);
console.log('Static checks passed: JS syntax, unique IDs, local links, matching form preview and agreed content.');
