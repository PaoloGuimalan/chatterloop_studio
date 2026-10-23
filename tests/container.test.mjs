import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const shell=process.platform==='win32'?'C:/Program Files/Git/bin/sh.exe':'/bin/sh';
const jq=process.env.STUDIO_TEST_JQ||'jq';
const available=spawnSync(jq,['--version']).status===0;
const quote=value=>`'${value.replaceAll("'","'\\''")}'`;

function startup(template) {
  const directory=mkdtempSync(path.join(tmpdir(),'studio-startup-'));
  const input=path.join(directory,'template.html').replaceAll('\\','/');
  const output=path.join(directory,'index.html').replaceAll('\\','/');
  writeFileSync(input,template);writeFileSync(output,'previous valid document');
  let source=readFileSync(new URL('../scripts/40-studio-config.sh',import.meta.url),'utf8')
    .replaceAll('\r\n','\n').replaceAll('/etc/studio-index.template.html',input)
    .replaceAll('/usr/share/nginx/html/studio/index.html',output);
  // Git Bash changes backslashes in arguments passed to native Windows jq.
  // Load the exact production filter through a file to avoid that host-only conversion.
  const filter=path.join(directory,'runtime.jq').replaceAll('\\','/');
  source=source.replace(/  '([\s\S]*?)' \\\n/,(_match,program)=>{
    writeFileSync(filter,program);return `  -f ${quote(filter)} \\\n`;
  });
  const result=spawnSync(shell,['-c',`jq() { ${quote(jq)} "$@"; }\n${source}`],{
    env:{...process.env,STUDIO_HASH:'test-</script>-"-\\-key',STUDIO_API_BASE:'https://api.example/us/'},
    stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:10000,
  });
  const html=readFileSync(output,'utf8');
  rmSync(directory,{recursive:true,force:true});
  return {...result,html};
}

test('container startup renders a complete document with closed stdin',
  {skip:!available&&'Install jq or set STUDIO_TEST_JQ to exercise the production startup script'},()=>{
    const {status,stderr,html}=startup('<!doctype html><head><script id="studio-runtime" type="application/json">{}</script></head><body><div id="root"></div><script type="module" src="/studio/assets/app.js"></script></body>');
    assert.equal(status,0,stderr);
    assert.ok(html.includes('<div id="root"></div>'),'React mount point must survive startup');
    assert.ok(html.includes('/studio/assets/app.js'),'React bundle reference must survive startup');
    const runtimeSource=html.match(/<script id="studio-runtime" type="application\/json">([^<]*)<\/script>/)[1];
    assert.doesNotThrow(()=>JSON.parse(runtimeSource),html);
    const runtime=JSON.parse(runtimeSource);
    assert.deepEqual(runtime,{hash:'test-</script>-"-\\-key',apiBase:'https://api.example/us'});
    assert.ok(!html.includes('test-</script>'),'Runtime values must not escape their script element');
  });

test('container startup rejects a missing runtime marker without overwriting the document',
  {skip:!available&&'Install jq or set STUDIO_TEST_JQ to exercise the production startup script'},()=>{
    const {status,html}=startup('<!doctype html><head></head><body><div id="root"></div></body>');
    assert.notEqual(status,0,'A broken build template must stop startup');
    assert.equal(html,'previous valid document');
  });
