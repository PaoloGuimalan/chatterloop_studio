import {render} from './render';
import {posterFromVideo} from './media';
import type {Project} from '../editor/model';
type Options=Omit<Parameters<typeof render>[1],'publish'|'preparePoster'>;
type Output=Awaited<ReturnType<typeof render>>;
export class MomentRender {
  private cached?:{key:string;output:Output};
  clear(){this.cached=undefined;}
  async prepare(project:Project,options:Options):Promise<Output>{
    const keyFor=(value:Project)=>{const {publishForm:_,...visual}=value;return JSON.stringify([visual,options.edge]);};const key=keyFor(project);
    if(this.cached?.key!==key)this.cached=undefined;
    options.signal?.throwIfAborted();
    if(!this.cached){let resolved=project;const output=await render(project,{...options,publish:true,preparePoster:false,onMetadata:assets=>{resolved={...project,assets};options.onMetadata?.(assets);}});this.cached={key:keyFor(resolved),output};}
    const output=this.cached.output;
    if(!output.poster){options.onProgress(.99,'Preparing the Moment poster…');output.poster=await posterFromVideo(output.video,output.width,output.height,options.signal,()=>options.onProgress(.99,'Retrying the Moment poster…'));}
    options.signal?.throwIfAborted();options.onProgress(1,'Ready');return output;
  }
}
