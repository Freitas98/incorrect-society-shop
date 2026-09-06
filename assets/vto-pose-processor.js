/** Same pose pipeline in a worker, or on the main thread only when the browser
 * lacks OffscreenCanvas. The latter is slower but never uploads customer media. */
export function createPoseProcessor({send,createCanvas}) {
  let detector,mode,closed=false,queue=Promise.resolve();
  const process=async data=>{
    if(closed){data.bitmap?.close();return;}
    const {id,kind}=data;
    try {
      if(kind==='init') {
        const {PoseLandmarker,FilesetResolver}=await import(data.vision);
        const files=await FilesetResolver.forVisionTasks(data.wasm);
        detector=await PoseLandmarker.createFromOptions(files,{
          canvas:createCanvas(),baseOptions:{modelAssetPath:data.model,delegate:'CPU'},
          runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,
          minPosePresenceConfidence:.55,minTrackingConfidence:.55,
        });
        if(closed){detector.close();detector=null;return;}
        mode='VIDEO';send({id,kind:'ready'});return;
      }
      if(kind==='frame') {
        const next=data.still?'IMAGE':'VIDEO';
        if(next!==mode){await detector.setOptions({runningMode:next});mode=next;}
        if(closed){data.bitmap.close();return;}
        const start=performance.now();
        const result=data.still?detector.detect(data.bitmap):detector.detectForVideo(data.bitmap,data.timestamp);
        send({id,kind:'pose',landmarks:result.landmarks[0]||null,
          world:result.worldLandmarks[0]||null,bitmap:data.bitmap,ms:performance.now()-start},[data.bitmap]);
        result.close?.();
      }
    }catch(error){
      data.bitmap?.close();if(!closed)send({id,kind:'error',message:error.message});
    }
  };
  return {
    postMessage(data){queue=queue.then(()=>process(data));return queue;},
    close(){closed=true;detector?.close();detector=null;},
  };
}
