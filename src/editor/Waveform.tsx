import {useEffect,useState} from 'react';
import type {Asset,AudioTrack} from './model';

export default function Waveform({asset,track}:{asset?:Asset;track:AudioTrack}){
  const [peaks,setPeaks]=useState<number[]>([]);
  useEffect(()=>{
    if(!asset||asset.file.size>32*1024*1024)return;
    let live=true,context:AudioContext;try{context=new AudioContext();}catch{return;}
    void asset.file.arrayBuffer().then(data=>context.decodeAudioData(data)).then(buffer=>{
      if(!live)return;const samples=buffer.getChannelData(0),count=512,step=Math.max(1,Math.floor(samples.length/count));
      setPeaks(Array.from({length:count},(_,index)=>{
        let peak=0;for(let n=index*step;n<Math.min(samples.length,(index+1)*step);n+=Math.max(1,Math.floor(step/64)))peak=Math.max(peak,Math.abs(samples[n]));return peak;
      }));
    }).catch(()=>{}).finally(()=>{void context.close().catch(()=>{});});
    return()=>{live=false;void context.close().catch(()=>{});};
  },[asset]);
  if(!peaks.length||!asset)return null;
  const maximum=Math.max(.01,...peaks);
  const bars=Array.from({length:80},(_,index)=>{
    const position=(track.trimStart+index/80*track.duration)/asset.duration;
    const height=Math.max(1,(peaks[Math.min(511,Math.floor(position*512))]||0)/maximum*10*track.volume);
    return `M${index*2+1} ${11-height}v${height*2}`;
  }).join('');
  return <svg className="waveform" aria-hidden="true" viewBox="0 0 160 22" preserveAspectRatio="none"><path d={bars} fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
