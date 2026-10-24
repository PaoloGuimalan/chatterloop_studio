import {newProject,clipFor,type Owner,type Asset} from './model';
export function quickProject(owner:Owner,asset:Asset){
  if(asset.kind==='audio')throw Error('Choose a photo or video for your Moment.');
  if(asset.kind==='video'&&asset.duration>120)throw Error('Choose a video of 2 minutes or less. Longer videos can be edited and exported from Studio.');
  const project=newProject(owner);project.name=asset.name.replace(/\.[^.]+$/,'')||'Untitled moment';project.assets=[asset];project.orientation=asset.width>asset.height?'landscape':'portrait';
  // Quick sharing preserves the complete frame; filling/cropping is an
  // intentional editing choice available after continuing into Studio.
  project.clips=[clipFor(asset,0)];return project;
}
