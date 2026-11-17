// Browser acceptance with isolated Auth/Data/Edge fixtures. No real account credentials or records.
import {createRequire} from 'node:module';import {readFileSync,existsSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import assert from 'node:assert/strict';
import {createPaymentHandler} from '../supabase/functions/_shared/payments/handler.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const base='https://kuniam68.github.io/cardiobug-sandbox/';
const local=process.env.CARDIOBUG_LOCAL==='1';
const COURSE='test-paid-course',LESSON='test-cardiology-basics';
const users=[{id:'11111111-1111-4111-8111-111111111111',email:'bdt@fixture.invalid',name:'BDT fixture'},{id:'22222222-2222-4222-8222-222222222222',email:'usd@fixture.invalid',name:'USD fixture'},{id:'33333333-3333-4333-8333-333333333333',email:'admin@fixture.invalid',name:'Admin fixture'}];
const publicUser=u=>({...u,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{display_name:u.name},identities:[]});
const fixtureEpoch=Math.floor(Date.now()/1000);
const jwt=u=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:u.id,aud:'authenticated',role:'authenticated',exp:fixtureEpoch+3600,iat:fixtureEpoch})).toString('base64url'),'fixture-signature'].join('.');
const userFor=req=>users.find(u=>req.headers()['authorization']==='Bearer '+jwt(u));
const original={id:COURSE,title:'TEST — Sandbox Paid Course',subtitle:'TEST — Sandbox Paid Course',category:'Sandbox testing',description:'Synthetic course for testing paid-content protection. Not for real students.',level:'Beginner',art:'anatomy',isSample:true,outcomes:['Identify the number of chambers in the human heart.'],lessons:[{id:LESSON,title:'TEST — Cardiology Basics',minutes:1,content:'The heart has four chambers: two atria and two ventricles.',question:'How many chambers does the human heart have?',options:['Two','Three','Four'],answer:2,explanation:'The human heart has two atria and two ventricles.'}]};
const preview=structuredClone(original);Object.assign(preview.lessons[0],{content:'Enroll to access this lesson.',question:'This lesson requires course access.',options:['Locked','Locked','Locked'],answer:0,explanation:'Complete checkout to access this lesson.'});
const orders=new Map(),keys=new Map(),enrolled=new Set(),progress=new Map();let no=0;const actions=[];
const repository={isTester:async()=>true,isAdmin:async id=>id===users[2].id,
 quote:async()=>({paid:true,prices:[{currency:'BDT',amountMinor:10000},{currency:'USD',amountMinor:500}]}),
 createOrder:async(actor,course,currency,key)=>{const k=actor+key;if(keys.has(k)){const old=orders.get(keys.get(k));if(old.currency!==currency||old.course_id!==course)throw new Error('Conflict');return old}const o={id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(++no).padStart(12,'0')}`,user_id:actor,course_id:course,currency,amount_minor:currency==='BDT'?10000:500,provider:'sandbox-'+currency.toLowerCase(),environment:'sandbox',status:'pending',provider_reference:null};orders.set(o.id,o);keys.set(k,o.id);return o},
 getOrder:async(actor,id)=>{const o=orders.get(id);if(!o||o.user_id!==actor)throw new Error('Not owned');return o},
 myOrders:async actor=>[...orders.values()].filter(o=>o.user_id===actor),
 finalize:async(actor,r)=>{const o=await repository.getOrder(actor,r.orderId);assert.equal(o.amount_minor,r.amountMinor);assert.equal(o.currency,r.currency);if(o.status!=='pending'){if(o.status===r.status)return o;throw new Error('Terminal conflict')}o.status=r.status;o.provider_reference=r.reference;if(o.status==='succeeded')enrolled.add(actor);return o},savePrices:async()=>{throw new Error('Price editing is outside this acceptance run')}
};
const handler=createPaymentHandler({env:{projectUrl:'https://szqiueneqmktiilagbdv.supabase.co',environment:'sandbox',sandboxProjectRef:'szqiueneqmktiilagbdv',signingSecret:'local-fixture-receipt-signing-key-32-characters',allowedOrigins:['https://kuniam68.github.io']},repository,authenticate:async req=>users.find(u=>req.headers.get('Authorization')==='Bearer '+jwt(u))});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results=[];
async function contextFor(viewport){
 const ctx=await browser.newContext({viewport,ignoreHTTPSErrors:true,reducedMotion:'reduce'});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers:{'Access-Control-Allow-Origin':'https://kuniam68.github.io'}});
  if(url.hostname==='zeneffylfgiyezpegqto.supabase.co'||url.pathname.startsWith('/Cardiology-/'))return route.abort();
  if(local&&url.href.startsWith(base)){const f=resolve(process.cwd(),decodeURIComponent(url.pathname.slice('/cardiobug-sandbox/'.length))||'index.html');if(!f.startsWith(process.cwd())||!existsSync(f))return route.fulfill({status:404,body:'Not found'});return route.fulfill({path:f})}
  if(url.hostname!=='szqiueneqmktiilagbdv.supabase.co')return route.continue();
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'https://kuniam68.github.io','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type,x-supabase-api-version','Access-Control-Allow-Methods':'GET,POST,OPTIONS'},body:''});
  const user=userFor(req);let body={};try{body=req.postDataJSON()||{}}catch{}
  if(url.pathname==='/auth/v1/token'){
   const u=users.find(u=>u.email===body.email);if(!u)return json({error:'invalid_credentials'},400);
   return json({access_token:jwt(u),refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:publicUser(u)});
  }
  if(url.pathname==='/auth/v1/user')return user?json(publicUser(user)):json({message:'Not authenticated'},401);
  if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,body:''});
  if(url.pathname==='/functions/v1/payments-sandbox'){
   actions.push(body.action);const response=await handler(new Request(url.href,{method:req.method(),headers:{Origin:'https://kuniam68.github.io',Authorization:req.headers()['authorization']||'','Content-Type':'application/json'},body:req.postData()}));
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  }
  if(url.pathname==='/rest/v1/academy_courses')return json([{id:COURSE,payload:preview,published:true,archived:false,updated_at:'2026-01-01T00:00:00Z'}]);
  if(url.pathname==='/rest/v1/payment_course_settings')return json([{course_id:COURSE,paid:true}]);
  if(url.pathname==='/rest/v1/payment_prices')return json([{course_id:COURSE,currency:'BDT',amount_minor:10000},{course_id:COURSE,currency:'USD',amount_minor:500}]);
  if(url.pathname==='/rest/v1/enrollments')return json(user&&enrolled.has(user.id)?[{user_id:user.id,course_id:COURSE,created_at:'2026-01-01T00:00:00Z'}]:[]);
  if(url.pathname==='/rest/v1/lesson_progress')return json(user&&progress.has(user.id)?[{course_id:COURSE,lesson_id:LESSON,quiz_score:1,quiz_total:1}]:[]);
  const rpc=url.pathname.split('/rpc/')[1];
  if(rpc==='is_academy_admin')return json(user?.id===users[2].id);
  if(rpc==='payment_course_is_paid')return json(true);
  if(rpc==='payment_has_access')return json(Boolean(user&&(enrolled.has(user.id)||user.id===users[2].id)));
  if(rpc==='payment_get_content')return user&&(enrolled.has(user.id)||user.id===users[2].id)?json(original):json({message:'Course access required'},403);
  if(rpc==='academy_complete_lesson'){
   if(!user||!enrolled.has(user.id))return json({message:'Enrollment required'},403);
   if(body.selected_answer!==2)return json({correct:false,score:0,total:1,saved:false});progress.set(user.id,true);return json({correct:true,score:1,total:1,saved:true});
  }
  if(rpc==='academy_admin_enrollments')return user?.id===users[2].id?json([...enrolled].map(id=>({user_id:id,course_id:COURSE,enrolled_at:'2026-01-01T00:00:00Z',completed_lessons:progress.has(id)?1:0,lesson_total:1,quiz_score:progress.has(id)?1:0}))):json({message:'Admin required'},403);
  throw new Error('Unhandled fixture request: '+url.pathname);
 });return ctx;
}
async function signIn(page,u,next){await page.goto(base+'signin.html?next='+encodeURIComponent(next));await page.locator('#auth-form').waitFor();await page.locator('[name=email]').fill(u.email);await page.locator('[name=password]').fill('fixture-password-only');await page.locator('#auth-form button[type=submit]').click();await page.waitForURL('**/'+next);}
try{
 for(const [index,currency,viewport] of [[0,'BDT',{width:1280,height:900}],[1,'USD',{width:390,height:844}]]){
  const ctx=await contextFor(viewport),page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await signIn(page,users[index],'course.html?id='+COURSE);await page.locator('#enroll').waitFor();assert.equal(await page.locator('#enroll').isDisabled(),false);assert.doesNotMatch(await page.locator('body').innerText(),/The heart has four chambers/);await page.locator('#enroll').click();await page.waitForURL('**/checkout.html?course='+COURSE);await page.locator('#checkout-currency').waitFor();await page.locator('#checkout-currency').selectOption(currency);
  for(const outcome of index===0?['failed','cancelled','succeeded']:['succeeded']){
   await page.locator('#create-order').click();await page.getByRole('button',{name:'Dummy payment — success'}).waitFor();
   const before=orders.size;await page.reload();await page.getByRole('button',{name:'Dummy payment — success'}).waitFor();assert.equal(orders.size,before,'Reload must not duplicate an order');
   const label=outcome==='failed'?'Simulate failure':outcome==='cancelled'?'Cancel dummy payment':'Dummy payment — success';await page.getByRole('button',{name:label,exact:true}).click();
   if(outcome!=='succeeded'){await page.getByRole('link',{name:'Try a new dummy order'}).waitFor();assert.equal(enrolled.has(users[index].id),false);await page.getByRole('link',{name:'Try a new dummy order'}).click();await page.locator('#create-order').waitFor();await page.locator('#checkout-currency').selectOption(currency)}
   else{await page.getByRole('link',{name:'Open protected course'}).waitFor();assert.ok(enrolled.has(users[index].id));await page.getByRole('link',{name:'Open protected course'}).click();}
  }
  await page.locator('#enroll').waitFor();await page.locator('#enroll').click();await page.locator('#quiz').waitFor();assert.match(await page.locator('body').innerText(),/The heart has four chambers/);
  await page.locator('input[name=answer][value="0"]').check();await page.locator('#quiz button[type=submit]').click();assert.equal(await page.locator('#complete').isDisabled(),true);
  await page.locator('input[name=answer][value="2"]').check();await page.locator('#quiz button[type=submit]').click();await page.locator('#complete').click();await page.getByText('Lesson complete. Quiz score 1/1.',{exact:false}).waitFor();
  await page.goto(base+'dashboard.html');await page.getByText('Quiz score: 1 / 1',{exact:false}).waitFor();assert.match(await page.locator('body').innerText(),/1 of 1 lessons completed/);await page.locator('#payment-history').getByText('succeeded',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(errors.length,0,errors.join(';'));
  results.push({currency,viewport:viewport.width,purchase:true,quiz:true,progress:true,dashboard:true,errors});await ctx.close();
 }
 const anon=await contextFor({width:390,height:844}),p=await anon.newPage();await p.goto(base+'lesson.html?course='+COURSE+'&lesson='+LESSON);await p.getByText('Course access required.',{exact:true}).waitFor();assert.doesNotMatch(await p.locator('body').innerText(),/The heart has four chambers/);await anon.close();
 const admin=await contextFor({width:1280,height:900}),a=await admin.newPage();await signIn(a,users[2],'admin.html');await a.getByRole('heading',{name:'Student enrollments'}).waitFor();assert.match(await a.locator('#admin-enrollments').innerText(),/1\/1 lessons/);await a.getByRole('button',{name:'Edit',exact:true}).click();await a.locator('#course-editor').waitFor({state:'visible'});assert.equal(await a.locator('[data-field=content]').inputValue(),original.lessons[0].content);assert.equal(await a.locator('[data-field=question]').inputValue(),original.lessons[0].question);assert.equal(await a.locator('[data-field=answer]').inputValue(),'2');assert.equal(await a.locator('[data-field=explanation]').inputValue(),original.lessons[0].explanation);await admin.close();
 results.push({anonymousLocked:true,adminEnrollmentView:true,adminPrivateEditor:true});
 console.log(JSON.stringify({mode:local?'local-static-with-isolated-fixtures':'deployed-static-with-isolated-fixtures',results,simulatedOrders:orders.size,handlerActions:actions.length,passed:true},null,2));
}finally{await browser.close()}
