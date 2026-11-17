import {minorToDecimal,MAX_MINOR} from './money.js?v=trial-1';

const codes=['BDT','USD'];
const validAmount=value=>Number.isSafeInteger(value)&&value>=1&&value<=MAX_MINOR;

export async function readStudentPrices(getClient,courseIds) {
  const ids=[...new Set(courseIds)];
  const prices=new Map(ids.map(id=>[id,{BDT:null,USD:null}]));
  if(!ids.length)return prices;
  const c=await getClient();
  // Public pricing fields only. RLS decides which published courses are visible.
  const {data,error}=await c.from('payment_prices')
    .select('course_id,currency,amount_minor').in('course_id',ids);
  if(error||!Array.isArray(data))throw new Error('Course prices are unavailable.');
  const seen=new Set();
  for(const row of data){
    if(!row||!prices.has(row.course_id)||!codes.includes(row.currency))continue;
    const key=JSON.stringify([row.course_id,row.currency]);
    const value=!seen.has(key)&&validAmount(row.amount_minor)?row.amount_minor:null;
    seen.add(key);
    prices.get(row.course_id)[row.currency]=value;
  }
  return prices;
}

export const hasAvailablePrice=prices=>codes.some(code=>validAmount(prices?.[code]));

export function studentPriceSummary(prices,{paid,verified=true,checkoutEnabled=false}) {
  if(!paid)return '';
  const amounts=codes.map(code=>{
    const amount=verified?prices?.[code]:null;
    const text=validAmount(amount)?(code==='BDT'?'৳':'$')+minorToDecimal(amount):'Price unavailable';
    return `<p><strong>${code}</strong> <span>${text}</span></p>`;
  }).join('');
  return `<div class="course-prices" aria-label="Course prices">${amounts}${checkoutEnabled?'':'<p class="notice">Payments unavailable · checkout disabled</p>'}</div>`;
}
