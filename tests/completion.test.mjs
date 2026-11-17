import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function fixture(result,error=null,enrolled=true){
 const calls=[];const context=vm.createContext({config:{supabaseUrl:'sandbox',supabasePublishableKey:'public'},paymentAccess:async()=>({paid:true,access:enrolled})});
 const source=readFileSync(new URL('../assets/auth.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 vm.runInContext(source+'\nclient=async()=>globalThis.database;currentUser=async()=>({id:"student"});globalThis.finish=complete;',context);
 context.database={rpc:async(name,args)=>{calls.push({name,args});return {data:result,error}},from:()=>{throw new Error('Direct progress writes forbidden')}};
 return {calls,context};
}
test('completion submits the actual answer to the scoring RPC without direct table writes',async()=>{
 const f=fixture({correct:true,score:1,total:1,saved:true});
 assert.equal((await f.context.finish('paid-course','lesson-one',2)).score,1);
 assert.equal(f.calls[0].name,'academy_complete_lesson');assert.equal(f.calls[0].args.selected_answer,2);
});
test('incorrect server-scored answer cannot be reported as saved',async()=>{
 const f=fixture({correct:false,score:0,total:1,saved:false});
 await assert.rejects(f.context.finish('paid-course','lesson-one',0),/correct answer/);
});
test('completion propagates backend failure rather than showing false success',async()=>{
 const f=fixture(null,new Error('Denied'));await assert.rejects(f.context.finish('paid-course','lesson-one',2),/Denied/);
});
test('paid completion does not submit a quiz when enrollment access is absent',async()=>{
 const f=fixture(null,null,false);await assert.rejects(f.context.finish('paid-course','lesson-one',2));assert.equal(f.calls.length,0);
});
