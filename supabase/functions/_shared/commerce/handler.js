import {createSSLCommerz} from './sslcommerz.js';
const PROJECTS={zeneffylfgiyezpegqto:{mode:'live',site:'https://kuniam68.github.io/Cardiology-/'},szqiueneqmktiilagbdv:{mode:'sandbox',site:'https://kuniam68.github.io/cardiobug-sandbox/gateway-acceptance/'}};
const fields=(b,allowed)=>{if(!b||Array.isArray(b)||typeof b!=='object'||Object.keys(b).some(k=>!allowed.includes(k)))throw new Error('Invalid request');};
const uuid=v=>{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))throw new Error('Invalid reference');return v;};
const courseId=v=>{if(typeof v!=='string'||!/^[a-z][a-z0-9-]{1,79}$/.test(v))throw new Error('Invalid course');return v;};
export const orderView=o=>({id:o.id,course_id:o.course_id,merchant_ref:o.merchant_ref,currency:o.currency,amount_minor:o.amount_minor,price_revision:o.price_revision,status:o.status,created_at:o.created_at,updated_at:o.updated_at,environment:o.environment,provider:o.provider});
export function deployment(env){const u=new URL(env.projectUrl),ref=u.hostname.split('.')[0],p=PROJECTS[ref];if(!p||u.origin!==`https://${ref}.supabase.co`)throw new Error('Unexpected project');return {...p,ref,origin:new URL(p.site).origin,callback:u.origin+'/functions/v1/academy-payments/callback'};}
export function readiness(env,settings){const p=deployment(env);const credentials=Boolean(env.storeId&&env.password);const modeMatches=env.mode===p.mode&&settings.provider_environment===p.mode;const approved=env.providerAccepted===true&&settings.merchant_approved===true&&(p.mode!=='live'||env.liveApproved===true);return {provider:'sslcommerz',available:Boolean(credentials&&modeMatches&&approved&&settings.live_enabled),mode:env.mode==='live'?'live':env.mode==='sandbox'?'sandbox':'disabled',currencies:['BDT'],usdAvailable:false,credentialsConfigured:credentials,providerAccepted:env.providerAccepted===true,merchantApproved:settings.merchant_approved===true,activationApproved:p.mode!=='live'||env.liveApproved===true,databaseEnabled:settings.live_enabled===true,modeMatches,refundsEnabled:env.refundsApproved===true};}
function customer(input,user,title){fields(input,['name','phone','address','city','postcode','country']);const clean={};for(const [k,max] of [['name',50],['phone',20],['address',50],['city',50],['postcode',30],['country',50]]){if(typeof input[k]!=='string'||input[k].trim().length<1||input[k].trim().length>max||/[\u0000-\u001f]/.test(input[k]))throw new Error('Complete billing details');clean[k]=input[k].trim();}if(user.email?.length>50)throw new Error('The payment provider accepts account emails up to 50 characters. Contact support before purchasing.');if(!/^[+0-9 ()-]{7,20}$/.test(clean.phone)||!user.email)throw new Error('Invalid billing details');return {...clean,email:user.email,courseTitle:title};}
export function createCommerceHandler({env,repository,authenticate,providerFactory=createSSLCommerz}){
 const site=deployment(env);
 const provider=()=>providerFactory({mode:env.mode,storeId:env.storeId,password:env.password});
 const json=(body,status=200,origin=null)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}:{})}});
 const ready=async()=>readiness(env,await repository.settings());
 const allowProvider=async()=>{const r=await ready();if(!r.credentialsConfigured||!r.modeMatches||!r.providerAccepted||!r.merchantApproved||!r.activationApproved)throw new Error('Provider not approved');return r;};
 const owned=async(user,id,admin=false)=>{const o=await repository.order(uuid(id));if(!o||(!admin&&o.user_id!==user.id))throw new Error('Order unavailable');return o;};
 const settle=async(o,r)=>r?repository.recordPayment(o.id,r):o;
 async function reconcile(o){return settle(o,await provider().reconcile(o));}
 return async request=>{
  const url=new URL(request.url);const callback=url.pathname.match(/\/academy-payments\/callback\/(success|fail|cancel|ipn)$/);
  if(callback){
   if(request.method!=='POST')return json({error:'POST required'},405);
   try{
    await allowProvider();if(Number(request.headers.get('content-length')||0)>16384)return json({error:'Notification too large'},413);const text=await request.text();if(text.length>16384)return json({error:'Notification too large'},413);
    const data=new URLSearchParams(text);for(const k of new Set(data.keys()))if(data.getAll(k).length>1)throw new Error('Duplicate notification field');
    const ref=data.get('tran_id');if(!/^CB[a-f0-9]{28}$/.test(ref||''))throw new Error('Unknown transaction');const o=await repository.orderByReference(ref);if(!o||o.environment!==env.mode)throw new Error('Unknown transaction');
    // Callback status/signature/amount are untrusted. Verify with credential-authenticated provider API.
    if(data.get('val_id'))await settle(o,await provider().validate(o,data.get('val_id')));else await reconcile(o);
    if(callback[1]==='ipn')return json({received:true});
    const destination=new URL('checkout.html',site.site);destination.searchParams.set('order',o.id);destination.searchParams.set('course',o.course_id);
    return new Response(null,{status:303,headers:{Location:destination.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
   }catch{return json({error:'Notification not verified; reconciliation is required'},503);}
  }
  const origin=request.headers.get('Origin');if(origin&&origin!==site.origin)return json({error:'Origin denied'},403);
  const cors=origin===site.origin?origin:null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':site.origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
  if(request.method==='GET')return json({provider:'sslcommerz',available:(await ready()).available,currencies:['BDT'],usdAvailable:false},200,cors);
  if(request.method!=='POST')return json({error:'Method not allowed'},405,cors);
  try{
   const user=await authenticate(request);if(!user?.id||!user.email_confirmed_at)return json({error:'Sign in with an email-confirmed account.'},401,cors);
   if(Number(request.headers.get('content-length')||0)>8192)return json({error:'Request too large'},413,cors);const text=await request.text();if(text.length>8192)return json({error:'Request too large'},413,cors);const b=JSON.parse(text);
   if(b.action==='quote'){
    fields(b,['action','courseId']);const quote=await repository.quote(courseId(b.courseId));if(!quote)throw new Error('Course unavailable');const r=await ready();const bdt=quote.prices?.find(p=>p.currency==='BDT');const payable=Number.isSafeInteger(bdt?.amountMinor)&&bdt.amountMinor>=1000&&bdt.amountMinor<=50000000;return json({...quote,checkoutAvailable:r.available&&payable,supportedCurrencies:r.available&&payable?['BDT']:[],provider:'sslcommerz'},200,cors);
   }
   if(b.action==='my-orders'){fields(b,['action']);return json((await repository.myOrders(user.id)).map(orderView),200,cors);}
   if(b.action==='get-order'){
    fields(b,['action','orderId']);const o=await owned(user,b.orderId);return json({...orderView(o),checkoutUrl:o.status==='pending'?o.checkout_url:null},200,cors);
   }
   if(b.action==='create-session'){
    fields(b,['action','courseId','currency','requestKey','customer']);const r=await allowProvider();if(!r.available)return json({error:'Live checkout is not yet available.'},503,cors);
    if(b.currency!=='BDT')return json({error:'This gateway is approved for BDT only. USD collection is unavailable.'},400,cors);
    const quote=await repository.quote(courseId(b.courseId));if(!quote?.paid)throw new Error('Paid course unavailable');const billing=customer(b.customer,user,quote.title);
    let o=await repository.createOrder(user.id,b.courseId,b.currency,uuid(b.requestKey),env.mode);
    if(o.status==='pending'&&o.checkout_url)return json({...orderView(o),checkoutUrl:o.checkout_url},200,cors);
    if(o.status!=='initializing'||!await repository.claimSession(o.id))return json({...orderView(o),checkoutUrl:null},200,cors);
    try{const s=await provider().initiate(o,billing,site.callback);o=await repository.attachSession(o.id,s);return json({...orderView(o),checkoutUrl:o.checkout_url},200,cors);}
    catch{await repository.sessionUnknown(o.id);return json({error:'The session result is uncertain. Check your payment status before trying again.',orderId:o.id},503,cors);}
   }
   if(b.action==='reconcile'){
    fields(b,['action','orderId']);await allowProvider();let o=await owned(user,b.orderId);if(await repository.claimReconciliation(o.id,user.id))o=await reconcile(o);return json(orderView(o),200,cors);
   }
   const admin=await repository.isAdmin(user.id);if(!admin)return json({error:'Administrator access required.'},403,cors);
   if(b.action==='admin-overview'){fields(b,['action']);return json({readiness:await ready(),orders:(await repository.adminOrders()).map(o=>({...orderView(o),user_id:o.user_id})),refunds:await repository.adminRefunds(),audit:await repository.audit()},200,cors);}
   if(b.action==='admin-reconcile'){fields(b,['action','orderId']);await allowProvider();let o=await owned(user,b.orderId,true);if(await repository.claimReconciliation(o.id,user.id))o=await reconcile(o);return json(orderView(o),200,cors);}
   if(b.action==='refund-request'){fields(b,['action','orderId','reason']);if(typeof b.reason!=='string'||b.reason.trim().length<5||b.reason.length>255)throw new Error('Refund reason required');return json(await repository.requestRefund(user.id,uuid(b.orderId),b.reason),200,cors);}
   if(b.action==='refund-execute'){
    fields(b,['action','refundId']);const r=await allowProvider();if(!r.available||!r.refundsEnabled)return json({error:'Refund execution requires separate financial activation approval.'},403,cors);
    const f=await repository.claimRefund(user.id,uuid(b.refundId)),o=await repository.order(f.order_id);
    try{const result=await provider().initiateRefund(o,f);return json(await repository.recordRefund(f.id,result.reference,result.status),200,cors);}catch{await repository.recordRefund(f.id,null,'unknown');return json({error:'Refund outcome uncertain. Do not retry; reconcile with the merchant.'},503,cors);}
   }
   if(b.action==='refund-reconcile'){
    fields(b,['action','refundId']);await allowProvider();const f=await repository.refund(uuid(b.refundId));if(!f)throw new Error('Refund unavailable');const result=await provider().queryRefund(await repository.order(f.order_id),f);return json(await repository.recordRefund(f.id,result.reference,result.status),200,cors);
   }
   return json({error:'Unsupported action'},400,cors);
  }catch(error){const allowed=['Complete billing details','Invalid billing details','The payment provider accepts account emails up to 50 characters. Contact support before purchasing.'];return json({error:allowed.includes(error?.message)?error.message:'The request could not be completed safely. Refresh your payment status or contact support.'},400,cors);}
 };
}
