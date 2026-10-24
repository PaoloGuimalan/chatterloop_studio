type Row={top:number;bottom:number;occupied:boolean};
export function timelineOverflow(view:{left:number;right:number;top:number;bottom:number},rows:Row[],items:{left:number;right:number}[]){
  const above=rows.filter(row=>row.top<view.top-1),below=rows.filter(row=>row.bottom>view.bottom+1);
  return{left:items.some(item=>item.left<view.left-1),right:items.some(item=>item.right>view.right+1),up:above.length>0,down:below.length>0,above:above.filter(row=>row.occupied).length,below:below.filter(row=>row.occupied).length};
}
