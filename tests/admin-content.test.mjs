import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEditableCourse,assertEditableCourse} from '../assets/admin-content.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const full = () => ({id:'fixture-course', title:'Fixture', subtitle:'Fixture course',
  category:'Testing', description:'Synthetic regression fixture', outcomes:['Learn something'],
  lessons:[{id:'fixture-lesson',title:'Lesson',minutes:1,content:'Original private lesson',
    question:'Question?',options:['One','Two','Three'],answer:2,explanation:'Original explanation'}]});
const preview = () => {
  const c=full();Object.assign(c.lessons[0], {content:'Enroll to access this lesson.',
    question:'This lesson requires course access.',explanation:'Complete checkout to access this lesson.'});
  return c;
};
function client(responses) {
  const calls=[];
  return {calls,async rpc(name,args) {
    calls.push({name,args});
    if (!(name in responses)) throw new Error('Unexpected RPC: '+name);
    return responses[name];
  }};
}
test('paid editing loads private lesson despite checkout being disabled; no public fallback',async()=>{
  const c=client({payment_get_content:{data:full(),error:null}});
  const result=await loadEditableCourse(c,{id:'fixture-course',payload:preview()});
  assert.equal(result.lessons[0].content,'Original private lesson');
  assert.equal(result.lessons[0].answer,2);
  assert.deepEqual(c.calls,[{name:'payment_get_content',args:{course_key:'fixture-course'}}]);
});
test('free course with no private payload remains editable',async()=>{
  const c=client({payment_get_content:{data:null},payment_course_is_paid:{data:false}});
  assert.deepEqual(await loadEditableCourse(c,{id:'fixture-course',payload:full()}),full());
});
test('denied/failed private loading rejects even with valid cached content',async()=>{
  const c=client({payment_get_content:{data:null,error:{message:'Denied'}}});
  await assert.rejects(loadEditableCourse(c,{id:'fixture-course',payload:full()}),/Editing is blocked/);
});
test('network failure never falls back to the preview',async()=>{
  await assert.rejects(loadEditableCourse({rpc:async()=>{throw new Error('Network failure')}},
    {id:'fixture-course',payload:preview()}),/Network failure/);
});
test('missing paid payload blocks editing',async()=>{
  const c=client({payment_get_content:{data:null},payment_course_is_paid:{data:true}});
  await assert.rejects(loadEditableCourse(c,{id:'fixture-course',payload:preview()}),/Editing is blocked/);
});
test('unknown/error pricing status blocks the free fallback',async()=>{
  for(const mode of [{data:null},{data:undefined},{data:false,error:{message:'Denied'}}]){
    const c=client({payment_get_content:{data:null},payment_course_is_paid:mode});
    await assert.rejects(loadEditableCourse(c,{id:'fixture-course',payload:full()}),/Editing is blocked/);
  }
});
test('locked placeholders are rejected on both loading and saving',async()=>{
  assert.throws(()=>assertEditableCourse(preview()),/cannot be saved/);
  const c=client({payment_get_content:{data:preview()}});
  await assert.rejects(loadEditableCourse(c,{id:'fixture-course',payload:preview()}),/cannot be saved/);
});
test('stale preview cannot be used after course becomes free',async()=>{
  const c=client({payment_get_content:{data:null},payment_course_is_paid:{data:false}});
  await assert.rejects(loadEditableCourse(c,{id:'fixture-course',payload:preview()}),/cannot be saved/);
});
test('malformed or mismatched protected payload is rejected',async()=>{
  for(const payload of [undefined,[],{...full(),id:'wrong-course'},{...full(),lessons:[]}]){
    const c=client({payment_get_content:{data:payload}});
    await assert.rejects(loadEditableCourse(c,{id:'fixture-course',payload:full()}));
  }
});
test('new/free course edits preserve entered lesson text and answers',()=>{
  const c=full();c.lessons[0].content='Administrator edits';
  assert.equal(assertEditableCourse(c).lessons[0].content,'Administrator edits');
  assert.equal(c.lessons[0].answer,2);
});

// Exercise the real form submission handler without a browser or hosted writes.
async function submitFixture(course,{ready=true,recheckFails=false}={}) {
  const calls=[];
  const fields=new Map();
  for(const key of ['id','title','subtitle','category','level','art','description'])
    fields.set('#course-'+key,{value:course[key]||''});
  fields.set('#course-sample',{checked:true});
  fields.set('#course-outcomes',{value:course.outcomes.join('\n')});
  fields.set('#course-editor',{hidden:false,querySelectorAll:()=>[]});
  fields.set('#admin-status',{textContent:'',classList:{toggle(){}},scrollIntoView(){}});
  const lesson=course.lessons[0];
  const root={querySelector:s=>fields.get(s),querySelectorAll:()=>[{
    querySelectorAll:s=>s==='[data-field]'?
      ['id','title','minutes','content','question','answer','explanation'].map(k=>({dataset:{field:k},value:String(lesson[k])})):
      lesson.options.map(value=>({value}))
  }]};
  const c={rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='payment_get_content') return recheckFails?{error:{message:'Denied'}}:{data:full()};
    if(name==='save_academy_course') return {error:null};
    throw new Error('Unexpected RPC');
  },from:()=>{throw new Error('List refresh omitted in fixture')}};
  const context=vm.createContext({document:{getElementById:()=>root},config:{paymentSandboxEnabled:false},
    assertEditableCourse,loadEditableCourse,client:async()=>c,friendlyError:e=>e.message});
  const source=readFileSync(new URL('../assets/admin.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace('if(root)init();','');
  vm.runInContext(source+`\neditorReady=${ready};editingId='fixture-course';rows=[{id:'fixture-course',payload:{}}];globalThis.submit=save;`,context);
  await context.submit({preventDefault(){},submitter:{id:'save-draft'}});
  return {calls,notice:fields.get('#admin-status').textContent};
}
test('form refuses saving before full content has loaded',async()=>{
  const r=await submitFixture(full(),{ready:false});
  assert.equal(r.calls.length,0);
  assert.match(r.notice,/Load the full course/);
});
test('form never submits locked placeholders to the save RPC',async()=>{
  const r=await submitFixture(preview());
  assert.equal(r.calls.length,0);
  assert.match(r.notice,/cannot be saved/);
});
test('form blocks save if protected content becomes unavailable',async()=>{
  const r=await submitFixture(full(),{recheckFails:true});
  assert.deepEqual(r.calls.map(c=>c.name),['payment_get_content']);
});
test('form with checkout disabled saves full edited text after protection recheck',async()=>{
  const edited=full();edited.lessons[0].content='Updated synthetic text';
  const r=await submitFixture(edited);
  const saved=r.calls.find(c=>c.name==='save_academy_course');
  assert.ok(saved);
  assert.equal(saved.args.course_payload.lessons[0].content,'Updated synthetic text');
  assert.equal(saved.args.is_published,false);
});
