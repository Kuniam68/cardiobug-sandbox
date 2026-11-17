import test from 'node:test';
import assert from 'node:assert/strict';
import {readStudentPrices,studentPriceSummary,hasAvailablePrice} from '../assets/student-prices.js';

function database(data,error=null){
  const calls=[];
  return {calls,client:{from(table){calls.push(['from',table]);return {select(fields){
    calls.push(['select',fields]);return {async in(column,ids){calls.push(['in',column,ids]);return {data,error}}};
  }}}}};
}
const rows=[{course_id:'fixture',currency:'BDT',amount_minor:10000},
  {course_id:'fixture',currency:'USD',amount_minor:500}];

test('reads only public price fields for requested courses without payment endpoints',async()=>{
  const db=database(rows);
  const prices=await readStudentPrices(async()=>db.client,['fixture','fixture']);
  assert.deepEqual(db.calls,[['from','payment_prices'],['select','course_id,currency,amount_minor'],['in','course_id',['fixture']]]);
  assert.deepEqual(prices.get('fixture'),{BDT:10000,USD:500});
});
test('free-only catalogs make no price request',async()=>{
  const result=await readStudentPrices(async()=>{throw new Error('Unexpected request')},[]);
  assert.equal(result.size,0);
});
test('RLS-hidden and missing prices remain unavailable rather than zero',async()=>{
  const db=database([]);
  const prices=await readStudentPrices(async()=>db.client,['fixture']);
  assert.deepEqual(prices.get('fixture'),{BDT:null,USD:null});
  assert.equal(hasAvailablePrice(prices.get('fixture')),false);
  const html=studentPriceSummary(prices.get('fixture'),{paid:true});
  assert.match(html,/Price unavailable/);assert.doesNotMatch(html,/0\.00|Free/);
});
test('both currencies format directly from independently stored integer minor units',async()=>{
  const db=database(rows);
  const prices=(await readStudentPrices(async()=>db.client,['fixture'])).get('fixture');
  const html=studentPriceSummary(prices,{paid:true,checkoutEnabled:false});
  assert.match(html,/৳100\.00/);assert.match(html,/\$5\.00/);assert.match(html,/Payments unavailable/);
  const other=studentPriceSummary({BDT:12345,USD:679},{paid:true,checkoutEnabled:true});
  assert.match(other,/৳123\.45/);assert.match(other,/\$6\.79/);
  assert.doesNotMatch(other,/Payments unavailable/);
});
test('invalid values are rejected independently for each currency',async()=>{
  for(const amount of [null,undefined,0,-1,1.5,'10000',1000000001,Number.MAX_SAFE_INTEGER,NaN,Infinity]){
    const db=database([{...rows[0],amount_minor:amount},rows[1]]);
    const result=(await readStudentPrices(async()=>db.client,['fixture'])).get('fixture');
    assert.deepEqual(result,{BDT:null,USD:500});
  }
});
test('duplicate currency rows invalidate that currency instead of choosing a price',async()=>{
  const db=database([rows[0],{...rows[0],amount_minor:999},rows[0],rows[1]]);
  const result=(await readStudentPrices(async()=>db.client,['fixture'])).get('fixture');
  assert.deepEqual(result,{BDT:null,USD:500});
});
test('unrelated rows and unknown currencies cannot inject markup or content',async()=>{
  const db=database([null,{course_id:'other',currency:'BDT',amount_minor:1},
    {course_id:'fixture',currency:'<script>bad</script>',amount_minor:1},
    {...rows[0],private_content:'SECRET_FIXTURE'},rows[1]]);
  const prices=(await readStudentPrices(async()=>db.client,['fixture'])).get('fixture');
  const html=studentPriceSummary(prices,{paid:true});
  assert.doesNotMatch(html,/script|SECRET_FIXTURE/);assert.match(html,/৳100\.00/);
});
test('API errors and malformed responses are reported as unavailable',async()=>{
  for(const [data,error] of [[rows,{message:'Denied'}],[null,null],[{},null]]){
    const db=database(data,error);
    await assert.rejects(readStudentPrices(async()=>db.client,['fixture']),/unavailable/);
  }
  await assert.rejects(readStudentPrices(async()=>{throw new Error('Network')},['fixture']),/Network/);
});
test('free courses never render paid prices even if a stale price object exists',()=>{
  assert.equal(studentPriceSummary({BDT:10000,USD:500},{paid:false}),'');
});
test('unverified paid amounts are not rendered as authoritative prices',()=>{
  const html=studentPriceSummary({BDT:10000,USD:500},{paid:true,verified:false});
  assert.match(html,/Price unavailable/);assert.doesNotMatch(html,/৳100\.00|\$5\.00/);
});
