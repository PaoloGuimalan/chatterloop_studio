export function failureMessage(error:unknown,fallback:string){
  if(typeof error==='string'&&error.trim())return error;
  if(error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'&&error.message.trim())return error.message;
  return fallback;
}
