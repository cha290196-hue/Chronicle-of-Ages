const text=x=>String(x??'').trim();
const list=x=>Array.isArray(x)?x:[];
const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local=(x,lang)=>typeof x==='string'?x:text(x?.[lang]||x?.zh||x?.en);

export function clarificationQuestions(error,lang='en'){
 const provided=list(error?.questions).filter(q=>local(q,lang));
 const missing=list(error?.missing??error?.criticalUnknowns).filter(Boolean);
 const source=provided.length?provided:missing.length?missing:[lang==='zh'?'请补充影响推演的必要条件。':'Please specify the conditions needed for this intervention.'];
 return source.map((q,i)=>({id:'q'+(i+1),text:local(q,lang),
  options:list(q?.options).map(o=>local(o,lang)).filter(Boolean)}));
}
export function clarificationAnswers(questions,formData){
 return questions.map(q=>{
  const answer=text(formData.get('clarify-'+q.id));
  if(!answer)throw new Error('CLARIFICATION_ANSWER_REQUIRED');
  return {id:q.id,question:q.text,answer};
 });
}
export function renderClarificationDrawer(pending,lang='en'){
 const zh=lang==='zh';
 return `<div class="backdrop clarification-backdrop"><section class="clarification-drawer" role="dialog" aria-modal="true" aria-labelledby="clarification-title"><header class="clarification-head"><div><h2 id="clarification-title">${zh?'补充推演条件':'Complete the conditions'}</h2><p>${zh?'回答后，将沿用这些条件继续生成世界线。':'Your answers will become premises for this worldline.'}</p></div><button type="button" class="panel-close" data-action="close-modal" aria-label="${zh?'关闭补充条件':'Close clarification'}">×</button></header><form id="clarification-form"><div class="clarification-body"><p class="clarification-original">${h(pending.prompt)}</p>${pending.questions.map((q,i)=>`<fieldset class="clarification-question"><label for="clarify-${q.id}"><span>${i+1}</span>${h(q.text)}</label>${q.options.length?`<div class="clarification-options">${q.options.map(o=>`<button type="button" data-action="clarification-choice" data-question="${q.id}" data-answer="${h(o)}">${h(o)}</button>`).join('')}</div>`:''}<textarea id="clarify-${q.id}" name="clarify-${q.id}" rows="2" maxlength="1600" required placeholder="${zh?'填写你的设定':'Enter your premise'}">${h(pending.values?.[q.id]||'')}</textarea></fieldset>`).join('')}</div><footer class="clarification-actions"><button type="button" class="secondary-btn" data-action="close-modal">${zh?'返回修改':'Back'}</button><button type="submit" class="primary-btn">${zh?'继续推演':'Continue simulation'}</button></footer></form></section></div>`;
}
export function renderCompletionNotes(worldline,lang='en'){
 const notes=list(worldline?.simulation?.admission?.completions).map(n=>local(n,lang)).filter(Boolean);
 if(!notes.length)return '';
 return `<details class="input-completion-notes"><summary>${lang==='zh'?'自动补全的前提':'Completed premises'}</summary><ul>${notes.map(n=>`<li>${h(n)}</li>`).join('')}</ul></details>`;
}

export function renderIntakeDiagnostics(diagnostics,lang='en'){
 if(!list(diagnostics).length)return '';
 return `<details class="intake-diagnostics"><summary>${lang==='zh'?'查看检查详情':'View admission details'}</summary><pre>${h(JSON.stringify(diagnostics,null,2))}</pre></details>`;
}
