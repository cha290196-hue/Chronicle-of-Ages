/** Plain, bilingual settings-panel renderer. The API key never enters this UI. */
import {summarizeUsage,getUsagePrice} from './usage-meter.mjs';
const h=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=(n,lang)=>Number(n||0).toLocaleString(lang==='zh'?'zh-CN':'en-US');
const usd=n=>'$'+Number(n||0).toFixed(n&&n<.01?6:4);
export function renderUsageDashboard({lang='en',provider='custom',model=''}={}){
 const u=(zh,en)=>lang==='zh'?zh:en;
 const summary=summarizeUsage(),tot=summary.totals,rows=summary.rows;
 const price=getUsagePrice(provider,model,'text');
 const size=Math.max(1,...rows.map(r=>r.totalTokens));
 const hasReportedCost=tot.providerCostCalls>0;
 const hasRateEstimate=rows.some(r=>r.configuredPrice&&r.meteredCalls>r.providerCostCalls);
 const hasPriced=hasReportedCost||hasRateEstimate;
 const modelRows=rows.slice(0,15).map(r=>`<div class="usage-model-row">
  <div class="usage-model-head"><strong title="${h(r.model)}">${h(r.model)}</strong><span>${fmt(r.calls,lang)} ${u('次','calls')}</span></div>
  <div class="usage-model-rail"><span style="width:${Math.max(2,100*r.totalTokens/size).toFixed(1)}%"></span></div>
  <div class="usage-model-foot"><span>${h(r.channel)} · ${fmt(r.inputTokens,lang)} / ${fmt(r.outputTokens,lang)} ${u('输入/输出','in/out')}</span><span>${r.meteredCalls?`${usd(r.combinedKnownUsd)}${r.missingPrice?' + ?':''}`:'—'}</span></div>
 </div>`).join('');
 return `<section class="settings-section usage-panel" aria-label="${u('Token 用量与费用','Token usage and cost')}">
  <div class="settings-section-head"><strong>${u('用量与费用','Usage & Cost')}</strong><span>${u('本设备统计','This device only')}</span></div>
  <div class="usage-metrics">
   <div class="usage-metric"><span>${u('API 调用','API calls')}</span><strong>${fmt(tot.calls,lang)}</strong></div>
   <div class="usage-metric"><span>${u('服务商报告 Token','Provider-reported tokens')}</span><strong>${tot.meteredCalls?fmt(tot.totalTokens,lang):'—'}</strong></div>
   <div class="usage-metric"><span>${u('输入 / 输出','Input / output')}</span><strong class="usage-small-value">${fmt(tot.inputTokens,lang)} / ${fmt(tot.outputTokens,lang)}</strong></div>
   <div class="usage-metric"><span>${u('有用量 / 无记录','Metered / unknown')}</span><strong class="usage-small-value">${fmt(tot.meteredCalls,lang)} / ${fmt(tot.unmeteredCalls,lang)}</strong></div>
  </div>
  <div class="usage-costs">
   <div><span>${u('服务商报告费用','Provider-reported cost')}</span><strong>${hasReportedCost?usd(summary.providerCostUsd):'—'}</strong></div>
   <div><span>${u('按自填单价估算','Custom-rate estimate')}</span><strong>${hasRateEstimate?usd(summary.estimatedUsd):'—'}</strong></div>
   <div><span>${u('可统计部分合计','Known-priced subtotal')}</span><strong>${hasPriced?usd(summary.coveredUsd):'—'}</strong></div>
  </div>
  <p class="usage-disclaimer">${u('仅统计当前浏览器启用此功能后的请求（包括重试和失败）。Token 数来自服务商返回的 usage，缺失不猜测；费用不是服务商账单。无单价的模型或图像请求可能无法估价。','Tracks this browser since feature activation, including retries and failures. Tokens use provider usage reports only. This is not a provider bill; missing usage, rates and image costs remain unknown.')}</p>
  <div class="usage-pricing">
   <div class="usage-pricing-title">${u('当前文本模型单价','Current text-model prices')} <span>USD / 1M tokens</span></div>
   <div class="usage-pricing-model">${h(provider)} / ${h(model||u('未配置模型','No model configured'))}</div>
   <div class="usage-price-grid">
    <label>${u('输入','Input')}<input id="usage-price-input" type="number" min="0" max="100000" step="any" inputmode="decimal" placeholder="${u('自行填写','Enter rate')}" value="${price?h(price.inputPerMillion):''}"></label>
    <label>${u('输出','Output')}<input id="usage-price-output" type="number" min="0" max="100000" step="any" inputmode="decimal" placeholder="${u('自行填写','Enter rate')}" value="${price?h(price.outputPerMillion):''}"></label>
   </div>
   <div class="usage-pricing-actions"><button type="button" class="secondary-btn" data-action="save-usage-price">${u('保存单价','Save prices')}</button><span>${u('不预设模型价格','No assumed model prices')}</span></div>
  </div>
  <details class="usage-details"><summary>${u('各模型用量明细','Usage by model')} · ${rows.length}</summary><div class="usage-model-list">${modelRows||`<p class="usage-no-records">${u('还没有请求记录。','No requests recorded yet.')}</p>`}</div></details>
  <div class="usage-footer"><span>${u('不包含其他设备的用量','Does not include other devices')}</span><button type="button" class="usage-clear" data-action="clear-usage">${u('清空统计','Clear usage')}</button></div>
 </section>`;
}
