import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createStudentAccess,studentCourseControls} from '../assets/student-access.js';

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

async function renderStudent({paid,access=false,checkout=false,lesson=false,failed=false}) {
  const c={id:'fixture-course',title:'Fixture',subtitle:'Fixture course',category:'Testing',level:'Beginner',
    minutes:1,art:'anatomy',description:'Synthetic test',outcomes:['Learn'],sources:[],isSample:false,
    lessons:[{id:'fixture-lesson',title:'Lesson',minutes:1,body:'PRIVATE_MARKER',options:['a','b','c']} ]};
  const detail={innerHTML:''},lessonPage={innerHTML:''},grid={innerHTML:''},enroll={disabled:false};
  const selectors=new Map(lesson?[['#lesson-page',lessonPage],['#quiz',{}],['#complete',{}]]:[['#course-detail',detail],['#enroll',enroll]]);
  const document={title:'',querySelector:s=>selectors.get(s)||null,getElementById:()=>null,
    querySelectorAll:s=>s==='[data-course-grid]'?[grid]:[]};
  const context=vm.createContext({document,location:{search:'?id=fixture-course&course=fixture-course&lesson=fixture-lesson'},
    URLSearchParams,config:{},configured:true,courses:[c],getCourse:id=>id===c.id?c:null,loadCourses:async()=>{},catalogStatus:'live',
    sandboxEnabled:()=>checkout,paymentCatalog:async()=>{if(failed)throw new Error('Network');return new Set(paid?[c.id]:[])},
    protectedCourse:async()=>{if(failed)throw new Error('Network');return {access:{paid,access:!paid||access}}},
    studentCourseControls,currentUser:async()=>null});
  const source=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  await vm.runInContext('(async()=>{'+source+'})()',context);
  return {detail:detail.innerHTML,lesson:lessonPage.innerHTML,grid:grid.innerHTML};
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
