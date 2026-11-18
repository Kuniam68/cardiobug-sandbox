import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createStudentAccess,studentCourseControls} from '../assets/student-access.js';
import {studentPriceSummary,hasAvailablePrice} from '../assets/student-prices.js';

function source(paid,access=false,user={id:'student'}) {
  const calls=[];
  const c={rpc:async(name)=>{calls.push(name);return {data:name==='payment_course_is_paid'?paid:access}},
    from:()=>({select:()=>({eq:async()=>({data:[{course_id:'fixture-course'}]})})})};
  return {calls,api:createStudentAccess({getClient:async()=>c,getUser:async()=>user})};
}
test('paid classification works with no checkout dependency',async()=>{
  const s=source(true);
  assert.deepEqual(await s.api.access('fixture-course'),{paid:true,access:false});
  assert.ok((await s.api.catalog()).has('fixture-course'));
});
test('anonymous paid user is denied without requesting protected content',async()=>{
  const s=source(true,false,null);
  assert.equal((await s.api.access('fixture-course')).access,false);
  assert.deepEqual(s.calls,['payment_course_is_paid']);
});
test('existing paid enrollment stays accessible with checkout disabled',async()=>{
  const state=await source(true,true).api.access('fixture-course');
  assert.equal(studentCourseControls(state,false).canRead,true);
});
test('ordinary free access does not require a student account',async()=>{
  assert.deepEqual(await source(false,false,null).api.access('fixture-course'),{paid:false,access:true});
});
test('unverified classification fails closed',async()=>{
  for(const data of [null,undefined,'false']){
    await assert.rejects(source(data).api.access('fixture-course'));
  }
});
test('catalog failures never become an empty free-course classification',async()=>{
  const api=createStudentAccess({getClient:async()=>({from:()=>({select:()=>({eq:async()=>({data:null,error:{}})})})}),getUser:async()=>null});
  await assert.rejects(api.catalog());
});

function authHarness(paid,access,checkout) {
  const writes=[],location={href:''};
  const c={from:table=>({upsert:async row=>{writes.push({table,row});return {}}})};
  const context=vm.createContext({config:{supabaseUrl:'sandbox',supabasePublishableKey:'public',paymentSandboxEnabled:checkout},
    location,paymentAccess:async()=>({paid,access})});
  let text=readFileSync(new URL('../assets/auth.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  vm.runInContext(text+'\nclient=async()=>globalThis.stubClient;currentUser=async()=>({id:"student"});globalThis.enroll=enroll;globalThis.complete=complete;',context);
  context.stubClient=c;
  return {context,writes,location};
}
test('paid course with checkout disabled never writes an enrollment',async()=>{
  const h=authHarness(true,false,false);
  await assert.rejects(h.context.enroll('fixture-course'),/Checkout is currently unavailable/);
  assert.equal(h.writes.length,0);assert.equal(h.location.href,'');
});
test('paid course with checkout enabled routes to checkout without self-enrollment',async()=>{
  const h=authHarness(true,false,true);
  assert.equal(await h.context.enroll('fixture-course'),false);
  assert.match(h.location.href,/^checkout.html\?course=fixture-course$/);
  assert.equal(h.writes.length,0);
});
test('progress cannot be written after enrollment is denied or redirected',async()=>{
  for(const checkout of [false,true]){
    const h=authHarness(true,false,checkout);
    await assert.rejects(h.context.complete('fixture-course','fixture-lesson'));
    assert.equal(h.writes.length,0);
  }
});
test('free enrollment still writes the current student enrollment',async()=>{
  const h=authHarness(false,true,false);
  assert.equal(await h.context.enroll('fixture-course'),true);
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].table,'enrollments');
});
test('already authorized paid students do not self-enroll',async()=>{
  const h=authHarness(true,true,false);
  assert.equal(await h.context.enroll('fixture-course'),true);assert.equal(h.writes.length,0);
});

async function renderStudent({paid,access=false,checkout=false,lesson=false,failed=false,priceRows={BDT:10000,USD:500},priceFailure=false,listing=false}) {
  const c={id:'fixture-course',title:'Fixture',subtitle:'Fixture course',category:'Testing',level:'Beginner',
    minutes:1,art:'anatomy',description:'Synthetic test',outcomes:['Learn'],sources:[],isSample:false,
    lessons:[{id:'fixture-lesson',title:'Lesson',minutes:1,body:'PRIVATE_MARKER',options:['a','b','c']} ]};
  const detail={innerHTML:''},lessonPage={innerHTML:''},grid={innerHTML:''},enroll={disabled:false};
  const calls=[];
  const selectors=new Map(listing?[['#catalog',grid],['#course-search',{value:'',addEventListener(){}}],['#course-count',{textContent:''}],['#category',{value:'',options:[],add(o){this.options.push(o)},addEventListener(){}}]]:lesson?[['#lesson-page',lessonPage],['#quiz',{}],['#complete',{}]]:[['#course-detail',detail],['#enroll',enroll]]);
  const document={title:'',querySelector:s=>selectors.get(s)||null,getElementById:()=>null,
    querySelectorAll:s=>s==='[data-course-grid]'&&!listing?[grid]:[]};
  const context=vm.createContext({document,location:{search:listing?'':'?id=fixture-course&course=fixture-course&lesson=fixture-lesson'},
    URLSearchParams,Option:class{constructor(label,value){this.label=label;this.value=value;}},config:{},configured:true,courses:[c],getCourse:id=>id===c.id?c:null,loadCourses:async()=>{calls.push('load-catalog')},catalogStatus:'live',
    sandboxEnabled:()=>checkout,paymentCatalog:async()=>{calls.push('verify-paid');if(failed)throw new Error('Network');return new Set(paid?[c.id]:[])},
    protectedCourse:async()=>{if(failed)throw new Error('Network');return {access:{paid,access:!paid||access}}},
    studentCourseControls,studentPriceSummary,hasAvailablePrice,client:async()=>null,readStudentPrices:async()=>{if(priceFailure)throw new Error('Price request failed');return new Map([[c.id,priceRows]])},currentUser:async()=>null});
  const source=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  await vm.runInContext('(async()=>{'+source+'})()',context);
  return {calls,detail:detail.innerHTML,lesson:lessonPage.innerHTML,grid:grid.innerHTML};
}
test('rendered paid course has disabled unavailable controls without free preview',async()=>{
  const html=await renderStudent({paid:true});
  assert.match(html.detail,/id="enroll" disabled/);assert.match(html.detail,/CHECKOUT UNAVAILABLE/);
  assert.doesNotMatch(html.detail,/SELF-PACED · FREE|Preview first lesson/);
  assert.match(html.grid,/Paid course · checkout unavailable/);
});
test('rendered paid course offers checkout only when enabled',async()=>{
  const html=await renderStudent({paid:true,checkout:true});
  assert.match(html.detail,/Open sandbox checkout/);assert.doesNotMatch(html.detail,/id="enroll" disabled/);
});
test('locked direct lesson URL renders no lesson content or checkout link when disabled',async()=>{
  const html=await renderStudent({paid:true,lesson:true});
  assert.match(html.lesson,/Checkout is currently unavailable/);
  assert.doesNotMatch(html.lesson,/PRIVATE_MARKER|href="checkout.html/);
});
test('locked direct lesson URL may offer checkout when enabled, never the lesson body',async()=>{
  const html=await renderStudent({paid:true,lesson:true,checkout:true});
  assert.match(html.lesson,/href="checkout.html/);assert.doesNotMatch(html.lesson,/PRIVATE_MARKER/);
});
test('rendered free course retains enrollment and preview controls',async()=>{
  const html=await renderStudent({paid:false});
  assert.match(html.detail,/SELF-PACED · FREE/);assert.match(html.detail,/Preview first lesson/);
  assert.doesNotMatch(html.detail,/id="enroll" disabled/);
});
test('free lesson remains readable without checkout',async()=>{
  const html=await renderStudent({paid:false,lesson:true});
  assert.match(html.lesson,/PRIVATE_MARKER/);
  assert.doesNotMatch(html.lesson,/Course access required/);
});
test('paid student with verified access can read lessons with checkout disabled',async()=>{
  const html=await renderStudent({paid:true,access:true,lesson:true});
  assert.match(html.lesson,/PRIVATE_MARKER/);
  assert.doesNotMatch(html.lesson,/Course access required/);
});
test('availability failure disables enrollment and hides paid content',async()=>{
  const html=await renderStudent({paid:true,failed:true});
  assert.match(html.detail,/AVAILABILITY UNVERIFIED/);assert.match(html.detail,/id="enroll" disabled/);
});

test('cards and course details show both independent prices while checkout is disabled',async()=>{
  const html=await renderStudent({paid:true});
  for(const view of [html.grid,html.detail]){
    assert.match(view,/BDT<\/strong> <span>৳100\.00/);
    assert.match(view,/USD<\/strong> <span>\$5\.00/);
    assert.match(view,/Payments unavailable/);
    assert.doesNotMatch(view,/Free course|SELF-PACED · FREE|Preview first lesson/);
  }
  assert.match(html.detail,/id="enroll" disabled/);
});
test('price request failures keep paid cards and details locked',async()=>{
  const html=await renderStudent({paid:true,priceFailure:true});
  for(const view of [html.grid,html.detail]){
    assert.match(view,/Price unavailable/);
    assert.doesNotMatch(view,/Free course|SELF-PACED · FREE/);
  }
  assert.match(html.detail,/id="enroll" disabled/);
});
test('missing and invalid amounts never become free controls, even with checkout simulated on',async()=>{
  for(const priceRows of [undefined,{}, {BDT:0,USD:-1},{BDT:'10000',USD:Infinity}]){
    const html=await renderStudent({paid:true,priceRows:priceRows??{},checkout:true});
    assert.match(html.detail,/id="enroll" disabled/);
    assert.match(html.detail,/prices unavailable/);
    assert.doesNotMatch(html.detail,/SELF-PACED · FREE|Preview first lesson/);
  }
});
test('one missing currency does not hide the independently available price',async()=>{
  const html=await renderStudent({paid:true,priceRows:{BDT:10000,USD:null}});
  assert.match(html.detail,/৳100\.00/);assert.match(html.detail,/<strong>USD<\/strong> <span>Price unavailable/);
});
test('ordinary free cards and details do not acquire paid pricing messages',async()=>{
  const html=await renderStudent({paid:false,priceFailure:true});
  assert.doesNotMatch(html.grid+html.detail,/course-prices|Payments unavailable|Price unavailable/);
  assert.match(html.detail,/Enroll & save progress/);
});
test('existing paid access stays available even when pricing fails',async()=>{
  const html=await renderStudent({paid:true,access:true,priceFailure:true});
  assert.match(html.detail,/Continue learning/);assert.doesNotMatch(html.detail,/id="enroll" disabled/);
});

test('actual catalog container loads published courses and independent paid prices without a generic grid marker',async()=>{const html=await renderStudent({paid:true,listing:true});assert.deepEqual(html.calls,['load-catalog','verify-paid']);assert.match(html.grid,/৳100\.00/);assert.match(html.grid,/\$5\.00/);assert.match(html.grid,/Paid course · checkout unavailable/);});
