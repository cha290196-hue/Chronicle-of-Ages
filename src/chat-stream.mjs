import {normalizeModelContent} from './structured-output.mjs';

/** Read OpenAI-compatible SSE without exposing or storing reasoning text. */
export async function readChatStream(response,{signal,onProgress=()=>{}}={}){
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let buffer='',content='',finishReason=null,usage=null,receivedChars=0,done=false;
 const interrupted=()=>Object.assign(new Error('MODEL_COMPLETION_INTERRUPTED'),{code:'MODEL_COMPLETION_INTERRUPTED',reason:'incomplete_stream'});
 const aborted=()=>new DOMException('Aborted','AbortError');
 const cancel=()=>{void reader.cancel().catch(()=>{})};
 signal?.addEventListener('abort',cancel,{once:true});
 const frame=block=>{
  const data=block.split(/\r\n|\n|\r/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
  if(!data.trim())return;
  if(data.trim()==='[DONE]'){done=true;return}
  const payload=JSON.parse(data);
  if(payload.error)throw new Error(String(payload.error.message||'MODEL_STREAM_ERROR'));
  if(payload.usage)usage=payload.usage;
  const choice=payload.choices?.find(c=>(c.index??0)===0);if(!choice)return;
  const delta=choice.delta||choice.message||{};
  const text=normalizeModelContent(delta.content??delta.text,{separator:''});
  const reasoning=normalizeModelContent(delta.reasoning_content??delta.reasoning,{separator:''});
  content+=text;
  if(text.length||reasoning.length){receivedChars+=text.length+reasoning.length;onProgress({status:'streaming',receivedChars})}
  if(delta.refusal)throw new Error(delta.refusal);
  if(choice.finish_reason)finishReason=choice.finish_reason;
 };
 try{
  if(signal?.aborted)throw aborted();
  while(!done){
   const part=await reader.read();if(signal?.aborted)throw aborted();
   buffer+=decoder.decode(part.value,{stream:!part.done});
   let boundary;
   while((boundary=/\r\n\r\n|\n\n|\r\r/.exec(buffer))){
    const block=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);frame(block);if(done)break;
   }
   if(part.done){if(!done&&buffer.trim())frame(buffer);break}
  }
  if(signal?.aborted)throw aborted();
  // A closed connection or DONE marker alone cannot confirm a complete answer.
  if(!finishReason)throw interrupted();
  return {choices:[{finish_reason:finishReason,message:{content}}],usage};
 }finally{
  signal?.removeEventListener('abort',cancel);
  await reader.cancel().catch(()=>{});reader.releaseLock();
 }
}
