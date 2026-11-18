import {createClient} from 'npm:@supabase/supabase-js@2.50.0';
import {createCommerceHandler} from '../_shared/commerce/handler.js';
const projectUrl=Deno.env.get('SUPABASE_URL')||'';
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')||JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;
const secretKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
const server=createClient(projectUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
const publicClient=createClient(projectUrl,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await server.rpc(name,args);if(error)throw new Error('Database operation denied');return data;};
async function one(table:string,key:string,value:string){const {data,error}=await server.from(table).select('*').eq(key,value).maybeSingle();if(error)throw new Error('Record unavailable');return data;}
async function rows(table:string,columns:string,limit=100){const {data,error}=await server.from(table).select(columns).order('created_at',{ascending:false}).limit(limit);if(error)throw new Error('Records unavailable');return data;}
const repository={
 settings:()=>one('commerce_settings','singleton','true'),
 async isAdmin(actor:string){return Boolean(await one('academy_admins','user_id',actor));},
 order:(id:string)=>one('commerce_orders','id',id),orderByReference:(ref:string)=>one('commerce_orders','merchant_ref',ref),refund:(id:string)=>one('commerce_refunds','id',id),
 async quote(id:string){const c=await publicClient.from('academy_courses').select('id,payload').eq('id',id).maybeSingle();if(c.error||!c.data)return null;const setting=await publicClient.from('payment_course_settings').select('paid').eq('course_id',id).maybeSingle();const p=await publicClient.from('payment_prices').select('currency,amount_minor').eq('course_id',id);if(setting.error||p.error)throw new Error('Prices unavailable');return {courseId:id,title:c.data.payload.subtitle||c.data.payload.title,description:c.data.payload.description,paid:setting.data?.paid===true,prices:p.data.filter(x=>x.amount_minor!==null).map(x=>({currency:x.currency,amountMinor:x.amount_minor}))};},
 async myOrders(actor:string){const {data,error}=await server.from('commerce_orders').select('*').eq('user_id',actor).order('created_at',{ascending:false}).limit(100);if(error)throw new Error('Orders unavailable');return data;},
 adminOrders:()=>rows('commerce_orders','*'),adminRefunds:()=>rows('commerce_refunds','id,order_id,amount_minor,status,reason,created_at,provider_reference'),audit:()=>rows('commerce_audit','id,actor,event,order_id,details,created_at'),
 createOrder:(actor:string,course:string,currency:string,key:string,mode:string)=>rpc('commerce_create_order',{actor,course_key:course,selected_currency:currency,idempotency_key:key,expected_environment:mode}),
 claimSession:(id:string)=>rpc('commerce_claim_session',{order_key:id}),
 attachSession:(id:string,s:any)=>rpc('commerce_attach_session',{order_key:id,provider_session:s.sessionKey,provider_url:s.url}),
 sessionUnknown:(id:string)=>rpc('commerce_session_unknown',{order_key:id}),
 claimReconciliation:(id:string,actor:string)=>rpc('commerce_claim_reconciliation',{order_key:id,actor}),
 recordPayment:(id:string,r:any)=>rpc('commerce_record_payment',{order_key:id,merchant_transaction:r.merchantTransaction,verified_amount:r.amountMinor,verified_currency:r.currency,verified_environment:r.environment,verified_status:r.status,validation_reference:r.validationReference,bank_transaction:r.bankTransaction}),
 requestRefund:(actor:string,id:string,reason:string)=>rpc('commerce_request_refund',{actor,order_key:id,reason_text:reason}),claimRefund:(actor:string,id:string)=>rpc('commerce_claim_refund',{actor,refund_key:id}),recordRefund:(id:string,ref:string|null,status:string)=>rpc('commerce_record_refund',{refund_key:id,provider_ref:ref,verified_status:status})
};
const handler=createCommerceHandler({env:{projectUrl,mode:Deno.env.get('COMMERCE_MODE')||'disabled',providerAccepted:Deno.env.get('COMMERCE_PROVIDER_ACCEPTED')==='true',liveApproved:Deno.env.get('COMMERCE_LIVE_APPROVED')==='true',refundsApproved:Deno.env.get('COMMERCE_REFUNDS_APPROVED')==='true',storeId:Deno.env.get('SSLCOMMERZ_STORE_ID')||'',password:Deno.env.get('SSLCOMMERZ_STORE_PASSWORD')||''},repository,authenticate:async(request:Request)=>{const value=request.headers.get('Authorization')||'';if(!value.startsWith('Bearer '))return null;const {data,error}=await publicClient.auth.getUser(value.slice(7));return error?null:data.user;}});
Deno.serve(handler);
