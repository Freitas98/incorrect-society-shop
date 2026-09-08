/** Pose plus the same model's person silhouette. Slow six-class hand/skin
 * classification runs independently. No customer media leaves the device. */
export function poseInputSize(width,height,still) {
  const factor=Math.min(1,(still?1024:640)/Math.max(width,height));
  // Pinned MediaPipe CPU mask copies fail on unaligned image rows (for example
  // 427×640). Align the inference bitmap, never the original display bitmap.
  return {width:Math.max(4,Math.round(width*factor/4)*4),height:Math.max(4,Math.round(height*factor/4)*4)};
}
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
          outputSegmentationMasks:true,
        });
        if(closed){detector.close();detector=null;return;}
        mode='VIDEO';send({id,kind:'ready'});return;
      }
      if(kind==='frame') {
        const next=data.still?'IMAGE':'VIDEO';
        if(next!==mode){await detector.setOptions({runningMode:next});mode=next;}
        if(closed){data.bitmap.close();return;}
        const start=performance.now();
        // Keep the original bitmap for display, but avoid upsampling the pose
        // model's person mask to a full-resolution phone frame on every call.
        const {width,height}=poseInputSize(data.bitmap.width,data.bitmap.height,data.still);
        let input=data.bitmap;
        if(width!==data.bitmap.width||height!==data.bitmap.height){
          input=await createImageBitmap(data.bitmap,{resizeWidth:width,resizeHeight:height});
        }
        if(closed){if(input!==data.bitmap)input.close();data.bitmap.close();return;}
        let result;
        try {
          result=data.still?detector.detect(input):detector.detectForVideo(input,data.timestamp);
          let person=null;
          const mask=result.segmentationMasks?.[0];
          if(mask){
            const values=mask.getAsFloat32Array(),factor=Math.min(1,256/Math.max(mask.width,mask.height));
            const width=Math.max(1,Math.round(mask.width*factor)),height=Math.max(1,Math.round(mask.height*factor));
            const alpha=new Uint8ClampedArray(width*height);
            for(let y=0;y<height;y++)for(let x=0;x<width;x++){
              const sx=Math.min(mask.width-1,Math.floor((x+.5)*mask.width/width));
              const sy=Math.min(mask.height-1,Math.floor((y+.5)*mask.height/height));
              alpha[y*width+x]=Math.round(values[sy*mask.width+sx]*255);
            }
            person={width,height,alpha};
          }
          send({id,kind:'pose',landmarks:result.landmarks[0]||null,person,
            world:result.worldLandmarks[0]||null,bitmap:data.bitmap,frameTime:data.timestamp,ms:performance.now()-start},[data.bitmap,...(person?[person.alpha.buffer]:[])]);
        } finally { result?.close?.();if(input!==data.bitmap)input.close(); }
      }
    }catch(error){data.bitmap?.close();if(!closed)send({id,kind:'error',message:error.message});}
  };
  return {
    postMessage(data){queue=queue.then(()=>process(data));return queue;},
    close(){closed=true;detector?.close();detector=null;},
  };
}
