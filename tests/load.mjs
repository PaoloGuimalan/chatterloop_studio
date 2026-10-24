import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
export function load(name,extra={}) {
  const url=new URL(`../src/${name}.ts`,import.meta.url),exports={};
  const source=fs.existsSync(url)?fs.readFileSync(url,'utf8'):'';
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,require:n=>n.startsWith('.')?load(new URL(n,url).pathname.split('/src/')[1].replace(/\.ts$/,''),extra):require(n),crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Blob,File,URL,URLSearchParams,AbortController,DOMException,Headers,Response,fetch,structuredClone,setTimeout,clearTimeout,console,btoa,atob,...extra});
  return exports;
}
