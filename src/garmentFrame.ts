export type GarmentFrame = {image:string;sourceWidth:number;sourceHeight:number;left:number;top:number;width:number;height:number}
export function garmentFrameStyles(frame:GarmentFrame){
 return {
  container:{aspectRatio:`${frame.width} / ${frame.height}`},
  image:{position:'absolute' as const,width:`${frame.sourceWidth/frame.width*100}%`,height:'auto',maxWidth:'none',left:`${-frame.left/frame.width*100}%`,top:`${-frame.top/frame.height*100}%`},
 }
}
