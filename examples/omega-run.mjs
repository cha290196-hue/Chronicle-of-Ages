/** Fully offline example using an injected synthetic proposer; no API keys. */
import {runMatrix,toLegacyWorldline} from '../src/ucm-omega.mjs';
import {compileSCM,compareCounterfactuals} from '../src/causal-dynamics.mjs';

const world = await runMatrix({
 baseline:[{id:'real-1',year:1200,en:'An earlier recorded event',origin:'recorded'}],
 interpretation:{operations:[{kind:'earth_intrusion',scope:'earth',mode:'point',startYear:1234,target:'Earth arrival',value:'arrived',description:'A fictional vessel arrives on Earth.'}]},
 scenarioCount:2,maxWindows:3,
 propose:async ({scenario,window})=>({events:[{id:`s${scenario}-e${window.from}`,year:window.from,en:`Hypothesis ${window.from}`,zh:`${window.from}年的假设`,category:'society',causes:['intervention:1'],assumptions:['illustrative only'],certainty:'low'}],facts:[]})
});
console.log('Historical baseline untouched:',world.inherited.events.map(e=>e.id));
console.log('Selected audited scenario:',world.preferred.events.map(e=>`${e.year} ${e.en}`));
console.log('Candidate alternatives:',world.alternatives.length);
console.log('Legacy branch ID:',toLegacyWorldline(world,{id:'B'}).id);

const model=compileSCM([
 {id:'rain',equation:()=>2},
 {id:'harvest',parents:['rain'],equation:({parents})=>parents.rain*3},
 {id:'stock',parents:['harvest'],laggedParents:['stock'],equation:({parents,lagged})=>parents.harvest+lagged.stock}
]);
const compare=compareCounterfactuals({system:model,initialState:{stock:100},from:1234,to:1235,interventions:[{target:'rain',value:4,startYear:1234,endYear:1234}]});
console.log('Illustrative SCM difference after intervention:',compare.at(-1).delta);