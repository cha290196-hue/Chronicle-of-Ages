/** Run the same v2 entry used by the browser with an explicit provider configuration. */
import {simulate} from '../src/core.js';

const {MODEL_ENDPOINT,MODEL_NAME,MODEL_KEY,MODEL_PROVIDER='custom'}=process.env;
if(!MODEL_ENDPOINT||!MODEL_NAME||!MODEL_KEY){
 console.error('Set MODEL_ENDPOINT, MODEL_NAME and MODEL_KEY, then pass a historical intervention as the first argument.');
 process.exitCode=1;
}else{
 const prompt=process.argv[2];
 if(!prompt){console.error('A historical intervention is required.');process.exitCode=1}
 else{
  try{
   const result=await simulate({prompt,config:{provider:MODEL_PROVIDER,endpoint:MODEL_ENDPOINT,model:MODEL_NAME,key:MODEL_KEY},
    onProgress:s=>console.error(s.phase,s.window?`${s.window.from}..${s.window.to}`:'')});
   console.log(JSON.stringify({format:'chronicle-of-ages',version:2,exportedAt:new Date().toISOString(),worldlines:[result],chats:{}},null,2));
  }catch(e){console.error(e.code||e.name,e.message);process.exitCode=1}
 }
}
