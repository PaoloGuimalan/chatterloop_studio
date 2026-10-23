import type {Project} from './model';
export interface EditHistory {past:Project[];now:Project;future:Project[]}
export function completeGesture(current:EditHistory,before:EditHistory,cancel:boolean):EditHistory {
  if(cancel||current.now===before.now)return before;
  return{past:[...before.past,before.now].slice(-30),now:current.now,future:[]};
}
