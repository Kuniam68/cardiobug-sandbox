import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {config} from '../assets/config.js';
import {safeNext} from '../assets/routes.js';
const root=new URL('../',import.meta.url);

test('immutable public configuration enforces sandbox identity and disabled checkout',()=>{
  assert.equal(config.supabaseUrl,'https://szqiueneqmktiilagbdv.supabase.co');
  assert.match(config.supabasePublishableKey,/^sb_publishable_/);
  assert.equal(config.paymentSandboxEnabled,false);
  assert.equal(config.turnstileMode,'optional');
  assert.ok(Object.isFrozen(config));
});
test('all social previews point to the sandbox and every page has one noindex directive',()=>{
  for(const name of readdirSync(root).filter(n=>n.endsWith('.html'))){
    const html=readFileSync(new URL(name,root),'utf8');
    assert.equal((html.match(/name="robots"/g)||[]).length,1,name);
    assert.match(html,/<meta name="robots" content="noindex,nofollow">/,name);
    assert.match(html,/<html lang="en">/,name);
    for(const match of html.matchAll(/https:\/\/kuniam68\.github\.io\/[^"\s]+/g)){
      assert.ok(new URL(match[0]).pathname.startsWith('/cardiobug-sandbox/'),name);
    }
  }
});
test('email token landing pages suppress referrers before scripts run',()=>{
  for(const name of ['signin.html','reset-password.html']){
    const html=readFileSync(new URL(name,root),'utf8');
    assert.match(html,/<meta name="referrer" content="no-referrer">/);
    assert.ok(html.indexOf('name="referrer"')<html.indexOf('<script'));
  }
});
test('redirects reject external, executable, traversal and lookalike routes',()=>{
  const current='https://kuniam68.github.io/cardiobug-sandbox/signin.html';
  for(const next of ['https://evil.example/dashboard.html','//evil.example/admin.html','javascript:alert(1)',
    '../outside/admin.html','/%2e%2e/admin.html','/cardiobug-sandbox-other/admin.html','data:text/html,hello']){
    assert.equal(safeNext(next,current),'dashboard.html');
  }
  assert.equal(safeNext('course.html?id=test-paid-course',current),'https://kuniam68.github.io/cardiobug-sandbox/course.html?id=test-paid-course');
});
test('Escape dismisses expanded navigation and restores focus',()=>{
  const listeners={};let expanded='false',focused=false,visible=false;
  const menu={getAttribute:()=>expanded,setAttribute:(_,value)=>expanded=value,focus:()=>focused=true};
  const navigation={classList:{toggle:(_,value)=>visible=value,remove:()=>visible=false}};
  const context=vm.createContext({$:selector=>selector==='#menu-toggle'?menu:navigation,
    document:{addEventListener:(event,handler)=>listeners[event]=handler}});
  const source=readFileSync(new URL('assets/app.js',root),'utf8');
  const start=source.indexOf("const menu=$('#menu-toggle');");
  const end=source.indexOf("document.querySelectorAll('[data-course-grid]')",start);
  vm.runInContext(source.slice(start,end),context);
  menu.onclick();assert.equal(expanded,'true');assert.equal(visible,true);
  listeners.keydown({key:'Escape'});
  assert.equal(expanded,'false');assert.equal(visible,false);assert.equal(focused,true);
});
test('authentication initialization does not wait for unrelated course or pricing reads',async()=>{
  const source=readFileSync(new URL('assets/app.js',root),'utf8').replace(/^import .*;\n/gm,'');
  const prefix=source.slice(0,source.indexOf('const catalogNotice='));
  let reads=0;
  const unexpected=async()=>{reads++;throw new Error('Unrelated read')};
  const context=vm.createContext({document:{querySelector:selector=>selector==='#auth-form'?{dataset:{mode:'signin'}}:null},
    location:{search:''},URLSearchParams,configured:true,loadCourses:unexpected,paymentCatalog:unexpected,readStudentPrices:unexpected});
  await vm.runInContext('(async()=>{'+prefix+'})()',context);
  assert.equal(reads,0);
});
for(const mode of ['optional','required'])test('CAPTCHA '+mode+' preserves token, expiration and reset behavior',async()=>{
  let callbacks,resets=0;
  const context=vm.createContext({config:{turnstileMode:mode,turnstileSiteKey:'fixture-public-key'},
    turnstile:{render:(_,options)=>{callbacks=options;return 'fixture-widget'},reset:()=>resets++}});
  const source=readFileSync(new URL('assets/captcha.js',root),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  vm.runInContext(source+'\nglobalThis.mount=mountCaptcha;',context);
  const c=await context.mount({},()=>{});
  if(mode==='required')assert.throws(()=>c.options(),/verification/);else assert.equal(c.options().captchaToken,undefined);
  callbacks.callback('fixture-token');assert.equal(c.options().captchaToken,'fixture-token');
  callbacks['expired-callback']();
  if(mode==='required')assert.throws(()=>c.options());else assert.equal(c.options().captchaToken,undefined);
  callbacks.callback('fresh-token');c.reset();assert.equal(resets,1);
  if(mode==='required')assert.throws(()=>c.options());else assert.equal(c.options().captchaToken,undefined);
});
