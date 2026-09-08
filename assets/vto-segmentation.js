/** Slow semantic keyframes, independent of the high-rate pose worker. */
export function createSegmentationProcessor({send,createCanvas}) {
  let segmenter,foregroundAlpha,canvas,ctx,closed=false,queue=Promise.resolve();
  const process=async data=>{
    if(closed){data.bitmap?.close();return;}
    try{
      if(data.kind==='init'){
        const {ImageSegmenter,FilesetResolver}=await import(data.vision);
        ({foregroundAlpha}=await import(data.occlusion));
        const files=await FilesetResolver.forVisionTasks(data.wasm);
        const gpuCanvas=createCanvas(),gl=gpuCanvas.getContext('webgl2');
        const debug=gl?.getExtension('WEBGL_debug_renderer_info');
        const gpu=debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'';
        const software=/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu);
        const options={canvas:gpuCanvas,runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true,
          baseOptions:{modelAssetPath:data.segmentationModel,delegate:gl&&!software?'GPU':'CPU'}};
        try{segmenter=await ImageSegmenter.createFromOptions(files,options);}
        catch{segmenter=await ImageSegmenter.createFromOptions(files,{...options,canvas:createCanvas(),baseOptions:{...options.baseOptions,delegate:'CPU'}});}
        if(closed){segmenter.close();segmenter=null;return;}
        canvas=createCanvas();ctx=canvas.getContext('2d',{willReadFrequently:true});
        send({kind:'ready'});return;
      }
      if(data.kind==='frame'){
        const start=performance.now();
        const factor=Math.min(1,(data.still?768:384)/Math.max(data.bitmap.width,data.bitmap.height));
        const width=Math.round(data.bitmap.width*factor),height=Math.round(data.bitmap.height*factor);
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        ctx.drawImage(data.bitmap,0,0,width,height);data.bitmap.close();
        const result=segmenter.segment(canvas);
        let alpha;
        try {
          const masks=result.confidenceMasks;
          if(masks?.length>=6)alpha=foregroundAlpha(masks.map(m=>m.getAsFloat32Array()),width,height,data.landmarks);
        }finally{result.close();}
        const pixels=ctx.getImageData(0,0,width,height).data;
        send({kind:'segmentation',id:data.id,width,height,alpha:alpha||new Uint8ClampedArray(width*height),
          pixels,landmarks:data.landmarks,frameTime:data.frameTime,ms:performance.now()-start},[pixels.buffer,...(alpha?[alpha.buffer]:[])]);
      }
    }catch(error){data.bitmap?.close();if(!closed)send({kind:'error',id:data.id,message:error.message});}
  };
  return {postMessage(data){queue=queue.then(()=>process(data));return queue;},close(){closed=true;segmenter?.close();segmenter=null;}};
}
