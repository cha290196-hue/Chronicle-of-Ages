const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function inline(value){
 return escapeHTML(value)
  .replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
  .replace(/__([^_\n]+)__/g,'<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>')
  .replace(/`([^`\n]+)`/g,'<code>$1</code>');
}

// Format the model's existing structure without injecting instructions or trusting HTML.
export function formatAnswer(value){
 const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n'),parts=[];
 let code=null;
 for(const line of lines){
  if(/^\s*```/.test(line)){if(code===null)code=[];else{parts.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`);code=null}continue}
  if(code!==null){code.push(line);continue}
  const title=line.match(/^\s{0,3}#{1,6}\s*(.*?)\s*#*\s*$/);
  if(title){if(title[1])parts.push(`<div class="answer-heading">${inline(title[1])}</div>`);continue}
  const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
  if(bullet){parts.push(`<div class="answer-bullet"><span aria-hidden="true">•</span><span>${inline(bullet[1])}</span></div>`);continue}
  parts.push(line.trim()?`<div>${inline(line)}</div>`:'<div class="answer-gap" aria-hidden="true"></div>');
 }
 if(code!==null)parts.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`);
 return parts.join('');
}
