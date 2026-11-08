/**
 * DeepSeek published API token prices, verified 2026-11-08.
 * Primary reference (CNY): https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * Prices are RMB per 1,000,000 tokens, and may be changed by DeepSeek.
 * This is an estimate of API usage, NOT the provider's balance/actual bill.
 */
export const DEEPSEEK_PRICE_SOURCE='https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
export const DEEPSEEK_RATE_VERIFIED_ON='2026-11-08';
export const DEEPSEEK_RATES_CNY={
 'deepseek-flash':{
  offpeak:{hit:.02,miss:1,output:4},
  peak:{hit:.04,miss:2,output:8}
 },
 'deepseek-v4-pro':{
  offpeak:{hit:.15,miss:4.5,output:13.5},
  peak:{hit:.30,miss:9,output:27}
 }
};
const ranges2026=[
 ['2026-01-01','2026-01-03'],
 ['2026-02-15','2026-02-23'],
 ['2026-04-04','2026-04-06'],
 ['2026-05-01','2026-05-05'],
 ['2026-06-19','2026-06-21'],
 ['2026-09-25','2026-09-27'],
 ['2026-10-01','2026-10-07']
];
// The 2026 holiday list comes from the State Council's 2025-11-04 notice.
// Official peak definition is Mon-Fri 09:00-12:00 and 14:00-18:00
// Beijing time, EXCEPT public holidays. Weekend make-up work stays off-peak.
const shanghaiParts=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
const whole=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?Math.trunc(n):null;
export function deepseekModelTier(provider,model,channel='text'){
 if(provider!=='deepseek'||channel!=='text')return null;
 const m=String(model||'').trim().toLowerCase();
 if(['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp'].includes(m))return 'deepseek-flash';
 if(m==='deepseek-v4-pro')return 'deepseek-v4-pro';
 return null;
}
export function deepseekBillingPeriod(isoDate){
 const date=new Date(isoDate);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(shanghaiParts.formatToParts(date)
  .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const day=`${parts.year}-${parts.month}-${parts.day}`;
 const dayOfWeek=new Date(day+'T00:00:00Z').getUTCDay();
 const isWeekend=dayOfWeek===0||dayOfWeek===6;
 const holiday=String(parts.year)==='2026'&&ranges2026.some(([start,end])=>day>=start&&day<=end);
 const hour=Number(parts.hour),minute=Number(parts.minute),minuteOfDay=hour*60+minute;
 const peak=!isWeekend&&!holiday&&((minuteOfDay>=540&&minuteOfDay<720)||(minuteOfDay>=840&&minuteOfDay<1080));
 return {period:peak?'peak':'offpeak',beijingDay:day,
  beijingClock:`${parts.hour}:${parts.minute}`,holiday,
  holidayCalendarVerified:parts.year==='2026',isWeekend};
}
/**
 * Direct official token price in CNY, broken down by cache hit/miss.
 * If a provider does not return cache-hit information, return a lower
 * and upper bound rather than pretending all tokens missed cache.
 */
export function deepseekTokenQuote({provider,model,channel='text',usage,time}={}){
 const tier=deepseekModelTier(provider,model,channel);
 const at=deepseekBillingPeriod(time);
 if(!tier||!at||!usage)return null;
 const input=whole(usage.input),output=whole(usage.output);
 if(input===null||output===null)return null;
 const tariff=DEEPSEEK_RATES_CNY[tier][at.period];
 const hitReported=whole(usage.cached);
 const missReported=whole(usage.missed);
 let hit=hitReported,miss=missReported;
 if(hit!==null&&miss===null)miss=Math.max(0,input-hit);
 if(miss!==null&&hit===null)hit=Math.max(0,input-miss);
 if(hit!==null&&miss!==null&&hit+miss!==input){
  // Inconsistent provider counters cannot be treated as a precise bill.
  hit=null;miss=null;
 }
 const outputCny=output*tariff.output/1000000;
 const minimumCny=(input*tariff.hit)/1000000+outputCny;
 const maximumCny=(input*tariff.miss)/1000000+outputCny;
 const exact=hit!==null&&miss!==null;
 const estimatedCny=exact?(hit*tariff.hit+miss*tariff.miss)/1000000+outputCny:null;
 return {currency:'CNY',source:DEEPSEEK_PRICE_SOURCE,verifiedOn:DEEPSEEK_RATE_VERIFIED_ON,
  tier,period:at.period,beijingDay:at.beijingDay,
  holidayCalendarVerified:at.holidayCalendarVerified,
  priced:true,exact,estimatedCny,minCny:exact?estimatedCny:minimumCny,
  maxCny:exact?estimatedCny:maximumCny,
  input,output,hit:exact?hit:null,miss:exact?miss:null};
}
