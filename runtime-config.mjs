export function runtimeConfig(env=process.env) {
  return {hash:env.VITE_STUDIO_HASH||'',apiBase:(env.VITE_STUDIO_API_BASE||'').replace(/\/$/,''),appVersion:env.VITE_PUBLIC_APP_VERSION||env.APP_VERSION||'dev'};
}
export function injectConfig(html,config) {
  const json=JSON.stringify(config).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return html.replace('</head>',`<script id="studio-runtime" type="application/json">${json}</script></head>`);
}
export const isolationHeaders={
  'Cross-Origin-Opener-Policy':'same-origin',
  'Cross-Origin-Embedder-Policy':'require-corp',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
};
