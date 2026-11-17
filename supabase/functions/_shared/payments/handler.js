import {sandboxProvider} from './provider.js';
const PRODUCTION_PROJECT='zeneffylfgiyezpegqto';
export function assertSandbox(env){const url=new URL(env.projectUrl);const ref=url.hostname.split('.')[0];if(env.environment!=='sandbox'||!env.sandboxProjectRef||ref!==env.sandboxProjectRef||ref===PRODUCTION_PROJECT)throw new Error('Sandbox payments are unavailable.');if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Invalid sandbox project.');if(!env.signingSecret||env.signingSecret.length<32)throw new Error('Sandbox payments are unavailable.')}
function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))throw new Error('Invalid request fields.')}
function id(value){if(typeof value!=='string'||!/^[a-z][a-z0-9-]{1,79}$/.test(value))throw new Error('Invalid course ID.');return value}
function uuid(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw new Error('Invalid order reference.');return value}
export function createPaymentHandler({env,authenticate,repository}){return async request=>{
 let origin;try{assertSandbox(env);origin=request.headers.get('Origin');if(!origin||!env.allowedOrigins.includes(origin))throw new Error('Origin not allowed.')}catch{return new Response(JSON.stringify({error:'Sandbox payments are unavailable for this environment.'}),{status:403,headers:{'Content-Type':'application/json'}})}
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 try{
  const user=await authenticate(request);if(!user?.id)return reply({error:'Sign in to use the sandbox.'},401);
  if(!await repository.isTester(user.id))return reply({error:'An authorized sandbox test account is required.'},403);
  const text=await request.text();if(text.length>8192)return reply({error:'Request too large.'},413);const b=JSON.parse(text);
  if(b.action==='quote'){fields(b,['action','courseId']);return reply(await repository.quote(user.id,id(b.courseId)))}
  if(b.action==='create-order'){fields(b,['action','courseId','currency','requestKey']);if(!['BDT','USD'].includes(b.currency))throw new Error('Choose BDT or USD.');const order=await repository.createOrder(user.id,id(b.courseId),b.currency,uuid(b.requestKey));await sandboxProvider(order.currency).createCheckout(order);return reply(order)}
  if(b.action==='get-order'){fields(b,['action','orderId']);return reply(await repository.getOrder(user.id,uuid(b.orderId)))}
  if(b.action==='my-orders'){fields(b,['action']);return reply(await repository.myOrders(user.id))}
  if(b.action==='simulate'){
   fields(b,['action','orderId','outcome']);if(!['succeeded','failed','cancelled'].includes(b.outcome))throw new Error('Invalid sandbox outcome.');
   const order=await repository.getOrder(user.id,uuid(b.orderId));const provider=sandboxProvider(order.currency);
   const receipt=await provider.verify(await provider.simulate(order,b.outcome,env.signingSecret),env.signingSecret);
   // Receipt stays server-side; the browser supplies neither amount nor currency here.
   return reply(await repository.finalize(user.id,receipt));
  }
  if(b.action==='admin-prices'){
   fields(b,['action','courseId','paid','prices']);if(!await repository.isAdmin(user.id))return reply({error:'Administrator access required.'},403);
   if(typeof b.paid!=='boolean'||!Array.isArray(b.prices)||b.prices.length!==2)throw new Error('Both currency settings are required.');const seen=new Set();for(const p of b.prices){fields(p,['currency','amountMinor']);if(!['BDT','USD'].includes(p.currency)||seen.has(p.currency))throw new Error('Invalid prices.');seen.add(p.currency);if(p.amountMinor!==null&&(!Number.isSafeInteger(p.amountMinor)||p.amountMinor<1||p.amountMinor>1_000_000_000))throw new Error('Invalid price.');}if(b.paid&&b.prices.every(p=>p.amountMinor===null))throw new Error('Enable at least one currency.');return reply(await repository.savePrices(user.id,id(b.courseId),b.paid,b.prices));
  }
  return reply({error:'Unknown sandbox action.'},400);
 }catch(error){const permitted=['Invalid request fields.','Invalid course ID.','Invalid order reference.','Choose BDT or USD.','Invalid sandbox outcome.','Both currency settings are required.','Invalid prices.','Invalid price.','Enable at least one currency.'];return reply({error:permitted.includes(error?.message)?error.message:'The sandbox request could not be completed. Refresh the order or try again.'},400)}
}}
