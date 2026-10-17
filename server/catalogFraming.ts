import sharp from 'sharp'
export type GarmentFrame = { image: string; sourceWidth: number; sourceHeight: number; left: number; top: number; width: number; height: number }
/** Detect empty margins for DISPLAY only. Keep the source photo unchanged and add a safety margin. */
export async function frameCatalogImage(path: string, image: string): Promise<GarmentFrame | undefined> {
 const meta=await sharp(path).metadata()
 if(!meta.width||!meta.height)return undefined
 const {info}=await sharp(path).trim({threshold:8}).toBuffer({resolveWithObject:true})
 const x=Math.max(0,-(info.trimOffsetLeft??0)),y=Math.max(0,-(info.trimOffsetTop??0))
 // Ambiguous detections stay uncropped rather than risk cutting a garment.
 if(info.width<meta.width*.22||info.height<meta.height*.22)return undefined
 const margin=Math.ceil(Math.max(meta.width,meta.height)*.035)
 const left=Math.max(0,x-margin),top=Math.max(0,y-margin)
 const right=Math.min(meta.width,x+info.width+margin),bottom=Math.min(meta.height,y+info.height+margin)
 return {image,sourceWidth:meta.width,sourceHeight:meta.height,left,top,width:right-left,height:bottom-top}
}
