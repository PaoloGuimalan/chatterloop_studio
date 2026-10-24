export function appVersion():string{
  try{const value=JSON.parse(document.getElementById('studio-runtime')?.textContent||'{}').appVersion;return typeof value==='string'&&value.trim()?value:'dev';}
  catch{return 'dev';}
}
