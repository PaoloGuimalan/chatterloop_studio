import {copyFile, mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await mkdir(new URL('public/ffmpeg/',root),{recursive:true});
for(const name of ['ffmpeg-core.js','ffmpeg-core.wasm']) {
  await copyFile(fileURLToPath(new URL(`node_modules/@ffmpeg/core/dist/esm/${name}`,root)),fileURLToPath(new URL(`public/ffmpeg/${name}`,root)));
}
await writeFile(new URL('public/ffmpeg/NOTICE.txt',root),'FFmpeg WebAssembly core 0.12.10 (@ffmpeg/core)\nLicense: GPL-2.0-or-later (core); MIT (JavaScript wrapper).\nSource and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm\nPackage: https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10\nLicense text: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html\n');
