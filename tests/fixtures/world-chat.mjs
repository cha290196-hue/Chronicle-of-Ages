import {REGIONS,DOMAINS,REVIEW_CRITERIA} from '../../src/world-model.mjs';
export const admission=(year=2020)=>({intent:'edit',decision:'accept',valid:true,earthRelevance:'direct',materiality:'material',criticalUnknowns:[],causalBridge:[{mechanism:'An institutional change alters material decisions',support:'established'}],operations:[{kind:'historical_change',scope:'earth',mode:'point',startYear:year,endYear:year,target:'Institutional policy',value:'changed',description:'Institutional divergence',temporalBasis:'Explicit year'}]});
export const contextOf=messages=>JSON.parse(messages.at(-1).content.split('\nCONTEXT JSON:\n')[1]);
export function genesis(c){
 return {conditions:REGIONS.map(region=>({id:c.idPrefix+region,firstYear:c.year,region,domain:'economy',statement:'Established institutions in '+region,statementZh:region+'既有制度',basis:'Model-recalled background, not independently sourced'})),
  regions:REGIONS.map(region=>({region,summary:'Established regional economy '+region,unknowns:[],domains:DOMAINS.map(domain=>({domain,summary:'Reviewed '+domain,status:domain==='economy'?'established':'unknown',evidenceIds:domain==='economy'?[c.idPrefix+region]:[]}))})),
  processes:REGIONS.map(region=>({id:'process:'+c.idPrefix+region,region,domain:'economy',description:'Economic development in '+region,causes:[c.idPrefix+region]}))};
}
export function transition(c){
 const events=c.world.processes.map((p,i)=>({id:c.idPrefix+p.region,year:c.window.from,en:'Development of '+p.region,zh:p.region+'的发展',
  descriptionEn:'A conditional change supported by the established institutions',descriptionZh:'依据既有制度推演的条件性变化',category:'society',region:p.region,threadKey:'process:'+p.region,
  scope:'transregional',significance:'major',relationToIntervention:'independent',causes:[p.causes[0]],
  links:[{causeId:p.causes[0],mechanism:'Established institutions support a change in exchange',support:'supported-inference'}],
  requires:[],assumptions:[],impact:{regions:[p.region,REGIONS[(i+1)%REGIONS.length]],domains:['economy'],mechanism:'Trade links transmit the change between regions'}}));
 return {events,facts:[],summary:'Multiple regions develop under their own established conditions',
  processReviews:c.world.processes.map((p,i)=>({processId:p.id,status:'advanced',reason:'Institutional exchange advances',eventIds:[events[i].id]})),
  stateUpdates:REGIONS.map(region=>({region,summary:'Updated exchange in '+region,evidenceIds:[events.find(e=>e.region===region).id],unknowns:[],domains:DOMAINS.map(domain=>({domain,summary:'Reviewed '+domain,status:domain==='economy'?'established':'unknown',evidenceIds:domain==='economy'?[events.find(e=>e.region===region).id]:[]}))}))};
}
export const semanticReview=()=>({verdict:'pass',sufficient:true,densityReason:'All ongoing processes were examined with supported changes',regions:REGIONS.map(region=>({region,reason:'Independent regional changes reviewed'})),unsupportedEventIds:[],missingProcesses:[],issues:[],rubric:REVIEW_CRITERIA.map(criterion=>({criterion,verdict:'pass',reason:'The supplied synthetic transition satisfies '+criterion}))});
export function worldChat({year=2020,overrides={},calls=[]}={}){
 return async(config,messages,options={})=>{
  const context=contextOf(messages);calls.push({messages,options,context});
  if(overrides[options.stage])return overrides[options.stage](context,calls,options);
  switch(options.stage){
   case 'interpretation':return admission(year);
   case 'intake-review':return {decision:'accept',criticalUnknowns:[]};
   case 'world-initialization':return genesis(context);
   case 'historical-window':case 'causal-repair':return transition(context);
   case 'world-review':return semanticReview();
   case 'synthesis':case 'synthesis-recovery':return {titleEn:'Alternative Earth',titleZh:'另一条地球历史',summaryEn:'Multiple regional processes form a coherent alternative world.',summaryZh:'各地区进程共同构成新的地球历史。',impacts:[]};
   default:throw new Error('Unexpected test stage: '+options.stage);
  }
 };
}
export async function worldHTTP(body,options={}){
 const c=contextOf(body.messages);
 const stage=c.interpretation?'intake-review':'input' in c?'interpretation':c.candidates?'world-review':c.finalState?'synthesis':c.window?(c.repair?'causal-repair':'historical-window'):'world-initialization';
 const answer=await worldChat(options)({},body.messages,{stage});
 return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}})};
}
