/** Plain, bilingual settings-panel renderer. The API key never enters this UI. */
import {summarizeUsage,getUsagePrice} from './usage-meter.mjs';
import {usageBillingProvider,deepseekModelTier,deepseekBillingPeriod,DEEPSEEK_RATES_CNY,DEEPSEEK_PRICE_SOURCE,DEEPSEEK_RATE_VERIFIED_ON} from './deepseek-pricing.mjs';
const h=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=(n,lang)=>Number(n||0).toLocaleString(lang==='zh'?'zh-CN':'en-US');
const usd=n=>'$'+Number(n||0).toFixed(n&&n<.01?6:4);
const yuan=n=>{const x=Number(n||0);return '¥'+x.toFixed(x>0&&x<.0001?8:x>0&&x<.01?6:4)};
const currencyRange=(lo,hi)=>Math.abs(lo-hi)<1e-10?yuan(lo):yuan(lo)+'–'+yuan(hi);
export function renderUsageDashboard({lang='en',provider='custom',model='',endpoint=''}={}){
 const u=(zh,en)=>lang==='zh'?zh:en;
 const summary=summarizeUsage(),tot=summary.totals,rows=summary.rows;
 const billingProvider=usageBillingProvider(provider,endpoint);
 const deepseekTier=deepseekModelTier(billingProvider,model);
 const now=deepseekBillingPeriod(new Date().toISOString());
 const currentTariff=deepseekTier?DEEPSEEK_RATES_CNY[deepseekTier][now?.period||'offpeak']:null;
 const price=deepseekTier?null:getUsagePrice(provider,model,'text');
 const deepseekDisplay=summary.deepseekPricedCalls
  ?currencyRange(summary.deepseekMinCny,summary.deepseekMaxCny):'—';
 const deepseekUncertain=(summary.deepseekBoundedCalls||0)+(summary.deepseekUnpricedCalls||0);
 const officialPricingHtml=deepseekTier?`<div class="usage-pricing usage-pricing-official">
  <div class="usage-pricing-title">${u('DeepSeek 官方定价（自动）','Official DeepSeek pricing · automatic')} <span>RMB / 1M tokens</span></div>
  <div class="usage-pricing-model">${h(deepseekTier)} · ${now?.period==='peak'?u('当前高峰时段','Peak hours'):u('当前空闲时段','Off-peak hours')}${now?.holidayCalendarVerified?'':u(' · 节假日待核实',' · holiday calendar unverified')}</div>
  <div class="usage-official-rates">
   <div><span>${u('输入 · 缓存命中','Input · cached')}</span><strong>¥${currentTariff.hit}</strong></div>
   <div><span>${u('输入 · 缓存未命中','Input · uncached')}</span><strong>¥${currentTariff.miss}</strong></div>
   <div><span>${u('输出','Output')}</span><strong>¥${currentTariff.output}</strong></div>
  </div>
  <p class="usage-official-note">${u('系统按每次请求的北京时间、缓存命中情况和实际 Token 用量计算。2026 年中国法定假日按国务院公布的安排处理；其他年份的节假日可能需要核对。','Calculated per request using Beijing time, cache hits and reported tokens. China public holidays in 2026 are recognized; future years may require holiday calendar updates.')}</p>
  <div class="usage-source-row"><span>${u('价格核对','Rates verified')} ${DEEPSEEK_RATE_VERIFIED_ON}</span><a href="${DEEPSEEK_PRICE_SOURCE}" target="_blank" rel="noopener noreferrer">${u('查看 DeepSeek 官方价格','Official DeepSeek rates')}</a></div>
 </div>`:`<div class="usage-pricing">
   <div class="usage-pricing-title">${u('当前文本模型单价','Current text-model prices')} <span>USD / 1M tokens</span></div>
   <div class="usage-pricing-model">${h(provider)} / ${h(model||u('未配置模型','No model configured'))}</div>
   <div class="usage-price-grid">
    <label>${u('输入','Input')}<input id="usage-price-input" type="number" min="0" max="100000" step="any" inputmode="decimal" placeholder="${u('自行填写','Enter rate')}" value="${price?h(price.inputPerMillion):''}"></label>
    <label>${u('输出','Output')}<input id="usage-price-output" type="number" min="0" max="100000" step="any" inputmode="decimal" placeholder="${u('自行填写','Enter rate')}" value="${price?h(price.outputPerMillion):''}"></label>
   </div>
   <div class="usage-pricing-actions"><button type="button" class="secondary-btn" data-action="save-usage-price">${u('保存单价','Save prices')}</button><span>${u('不预设其他模型价格','No assumed pricing for other models')}</span></div>
  </div>`;
 const stageLabels={
  'minute-world':['全球宏观推演','Global macro history'],
  'minute-review':['完整世界审查','Complete world review'],
  'minute-repair':['审查结果修复','Audit correction'],
  'minute-graph-repair':['因果图校正','Causal graph correction'],
  interpretation:[ '历史干预识别','Historical interpretation' ],
  'historical-window':[ '历史时段推演','Historical windows' ],
  'world-coverage':[ '全球覆盖补充','World coverage review' ],
  'causal-repair':[ '因果修复','Causal repair' ],
  synthesis:[ '世界线总结','Final synthesis' ],
  'synthesis-recovery':[ '总结格式恢复','Synthesis recovery' ],
  'connection-test':[ '连接测试','Connection test' ]
 };
 const stageRows=summary.stageTimings.filter(r=>r.stage!=='other').map(r=>{
  const title=stageLabels[r.stage]?u(...stageLabels[r.stage]):h(r.stage);
  return `<div class="usage-stage-row"><strong>${title}</strong><span>${fmt(r.calls,lang)} ${u('次','calls')}</span>
   <span>${u('平均','avg')} ${(r.averageMs/1000).toFixed(1)}s</span>
   <span>${u('累计','total')} ${(r.elapsedMs/1000).toFixed(1)}s${r.failures?' · '+r.failures+' '+u('次失败','failed'):''}</span></div>`;
 }).join('');
 const size=Math.max(1,...rows.map(r=>r.totalTokens));
 const hasReportedCost=rows.some(r=>!r.officialDeepSeekTier&&(r.providerCostCalls||0)>0);
 const hasRateEstimate=rows.some(r=>r.configuredPrice&&r.meteredCalls>r.providerCostCalls);
 const hasPriced=hasReportedCost||hasRateEstimate;
 const modelRows=rows.slice(0,15).map(r=>`<div class="usage-model-row">
  <div class="usage-model-head"><strong title="${h(r.model)}">${h(r.model)}</strong><span>${fmt(r.calls,lang)} ${u('次','calls')}</span></div>
  <div class="usage-model-rail"><span style="width:${Math.max(2,100*r.totalTokens/size).toFixed(1)}%"></span></div>
  <div class="usage-model-foot"><span>${h(r.channel)} · ${fmt(r.inputTokens,lang)} / ${fmt(r.outputTokens,lang)} ${u('输入/输出','in/out')}</span><span>${r.officialDeepSeekTier?(r.deepseekPricedCalls?currencyRange(r.officialDeepSeekMinCny,r.officialDeepSeekMaxCny):'—')+(r.officialDeepSeekUnpricedCalls?' + ?':''):(r.meteredCalls?`${usd(r.combinedKnownUsd)}${r.missingPrice?' + ?':''}`:'—')}</span></div>
 </div>`).join('');
 return `<section class="settings-section usage-panel" aria-label="${u('Token 用量与费用','Token usage and cost')}">
  <div class="settings-section-head"><strong>${u('用量与费用','Usage & Cost')}</strong><span>${u('本设备统计','This device only')}</span></div>
  <div class="usage-metrics">
   <div class="usage-metric"><span>${u('API 调用','API calls')}</span><strong>${fmt(tot.calls,lang)}</strong></div>
   <div class="usage-metric"><span>${u('服务商报告 Token','Provider-reported tokens')}</span><strong>${tot.meteredCalls?fmt(tot.totalTokens,lang):'—'}</strong></div>
   <div class="usage-metric"><span>${u('输入 / 输出','Input / output')}</span><strong class="usage-small-value">${fmt(tot.inputTokens,lang)} / ${fmt(tot.outputTokens,lang)}</strong></div>
   <div class="usage-metric"><span>${u('有用量 / 无记录','Metered / unknown')}</span><strong class="usage-small-value">${fmt(tot.meteredCalls,lang)} / ${fmt(tot.unmeteredCalls,lang)}</strong></div>
   <div class="usage-metric"><span>${u('模型请求平均耗时','Mean API response time')}</span><strong class="usage-small-value">${summary.averageElapsedMs===null?'—':(summary.averageElapsedMs/1000).toFixed(1)+'s'}</strong></div>
   <div class="usage-metric"><span>${u('已测速请求','Timed API requests')}</span><strong class="usage-small-value">${fmt(summary.timedCalls,lang)}</strong></div>
  </div>
  <div class="usage-costs">
   <div class="usage-deepseek-cost"><span>${u('DeepSeek 官方价格自动测算','DeepSeek cost · official rate estimate')}</span><strong>${deepseekDisplay}</strong></div>
   ${deepseekUncertain?`<p class="usage-cost-unknown">${u('其中 '+summary.deepseekBoundedCalls+' 次缺少缓存明细、'+summary.deepseekUnpricedCalls+' 次缺少可计算数据；带范围或未计入的费用不代表最终账单。',summary.deepseekBoundedCalls+' calls lack cache details, '+summary.deepseekUnpricedCalls+' calls lack sufficient usage. Ranges and unknown charges are not billed totals.')}</p>`:''}
   <div><span>${u('其他服务商报告费用（USD）','Other reported costs (USD)')}</span><strong>${hasReportedCost?usd(summary.providerCostUsd):'—'}</strong></div>
   <div><span>${u('按自填单价估算','Custom-rate estimate')}</span><strong>${hasRateEstimate?usd(summary.estimatedUsd):'—'}</strong></div>
   <div><span>${u('可统计部分合计','Known-priced subtotal')}</span><strong>${hasPriced?usd(summary.coveredUsd):'—'}</strong></div>
  </div>
  <p class="usage-disclaimer">${u('只统计当前浏览器的请求，含重试与失败。DeepSeek 按已核对的官方人民币价格、缓存明细和请求时段自动测算；其他服务商的 USD 数字不与人民币相加。旧记录没有完整明细的部分可能不能重算；实际扣费仍以服务商账单为准。','Tracks this browser only, including retries/failures. DeepSeek uses published CNY rates, cache counts and request time. Other providers\' USD costs are not added to CNY. Some older records cannot be fully repriced; provider billing is authoritative.')}</p>
  ${officialPricingHtml}
  <details class="usage-details"><summary>${u('推演各阶段的真实等待时间','Measured latency by simulation stage')} · ${summary.stageTimings.length}</summary>
   <p class="usage-disclaimer">${u('仅显示启用测速后的最近 300 次 API 请求；包含失败与重试。这里的累计耗时是请求时间之和，不等于整个页面的总等待时间。','Shows the most recent 300 timed API requests, including failed calls and retries. Sum of request times does not equal total simulation wall-clock time.')}</p>
   <div class="usage-stage-list">${stageRows||`<p class="usage-no-records">${u('尚无各阶段测速数据。','No stage latency data yet.')}</p>`}</div>
  </details>
  <details class="usage-details"><summary>${u('各模型用量明细','Usage by model')} · ${rows.length}</summary><div class="usage-model-list">${modelRows||`<p class="usage-no-records">${u('还没有请求记录。','No requests recorded yet.')}</p>`}</div></details>
  <div class="usage-footer"><span>${u('不包含其他设备的用量','Does not include other devices')}</span><button type="button" class="usage-clear" data-action="clear-usage">${u('清空统计','Clear usage')}</button></div>
 </section>`;
}