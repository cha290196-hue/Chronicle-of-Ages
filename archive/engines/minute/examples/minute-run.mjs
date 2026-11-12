/** Run the archived v3 engine with an explicit provider configuration. */
import {simulateMinute} from '../src/minute-simulation.mjs';
import {callChat} from '../src/chat-transport.mjs';
import {makeId} from '../../../../src/core.js';

const {MODEL_ENDPOINT,MODEL_NAME,MODEL_KEY,MODEL_PROVIDER='custom'}=process.env;
if(!MODEL_ENDPOINT||!MODEL_NAME||!MODEL_KEY){
 console.error('Set MODEL_ENDPOINT, MODEL_NAME and MODEL_KEY, then pass a historical intervention as the first argument.');
 process.exitCode=1;
}else{
 const prompt=process.argv[2];
 if(!prompt){console.error('A historical intervention is required.');process.exitCode=1}
 else{
  try{
   const {worldline:result}=await simulateMinute({prompt,makeId,callChat,autoComplete:true,config:{provider:MODEL_PROVIDER,endpoint:MODEL_ENDPOINT,model:MODEL_NAME,key:MODEL_KEY},
    onProgress:s=>console.error(s.stage,Math.round((s.elapsedMs||0)/1000)+'s')});
   console.log(JSON.stringify({format:'chronicle-of-ages',version:2,exportedAt:new Date().toISOString(),worldlines:[result],chats:{}},null,2));
  }catch(e){console.error(e.code||e.name,e.message);process.exitCode=1}
 }
}
