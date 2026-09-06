/* Classic worker: MediaPipe's WASM loader needs importScripts(). No media leaves
 * this worker/device. Every returned frame is paired with its own pose result. */
let processor;
self.onmessage=async({data})=>{
  try{
    if(data.kind==='init'){
      const {createPoseProcessor}=await import(data.processor);
      processor=createPoseProcessor({send:(message,transfer)=>self.postMessage(message,transfer),createCanvas:()=>new OffscreenCanvas(1,1)});
    }
    await processor.postMessage(data);
  }catch(error){data.bitmap?.close();self.postMessage({id:data.id,kind:'error',message:error.message});}
};
