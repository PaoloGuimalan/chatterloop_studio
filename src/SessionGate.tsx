import type {ReactNode} from 'react';

export default function SessionGate({authenticated,error,onRetry,children}:{authenticated:boolean;error?:string;onRetry:()=>void;children?:ReactNode}){
  if(authenticated)return <>{children}</>;
  return <main className="startup-screen">{error?<section className="startup-error"><h1>Studio couldn’t open</h1><p role="alert">{error}</p><button className="primary" onClick={onRetry}>Try again</button></section>:<div className="startup-loader" role="status" aria-label="Loading Studio"><span className="spinner" aria-hidden="true"/></div>}</main>;
}
