import {createClient} from 'npm:@supabase/supabase-js@2.50.0';
import {createPaymentHandler,assertSandbox} from '../_shared/payments/handler.js';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
// Server-only receipt key derived from the project's built-in secret. Never returned or logged.
const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('cardiobug:sandbox:receipts:'+serviceKey));
const receiptKey=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
const env={
 projectUrl:Deno.env.get('SUPABASE_URL')||'',
 environment:'sandbox',
 sandboxProjectRef:'szqiueneqmktiilagbdv',
 signingSecret:serviceKey?receiptKey:'',
 allowedOrigins:['https://kuniam68.github.io']
};
let handler: ReturnType<typeof createPaymentHandler>;
function initialize(){
 const admin=createClient(env.projectUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const publicClient=createClient(env.projectUrl,Deno.env.get('SUPABASE_ANON_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await admin.rpc(name,args);if(error)throw new Error('Sandbox database request failed.');return data};
 const repository={
  async isTester(actor:string){const settings=await admin.from('payment_sandbox_settings').select('enabled,environment').eq('singleton',true).maybeSingle();if(settings.error)throw settings.error;if(!settings.data?.enabled||settings.data.environment!=='sandbox')return false;const {data,error}=await admin.from('payment_test_accounts').select('user_id').eq('user_id',actor).maybeSingle();if(error)throw error;return Boolean(data)},
  async isAdmin(actor:string){return await rpc('payment_actor_is_admin',{actor})===true},
  quote:(actor:string,course:string)=>rpc('payment_quote',{actor,course_key:course}),
  createOrder:(actor:string,course:string,code:string,key:string)=>rpc('payment_create_order',{actor,course_key:course,selected_currency:code,idempotency_key:key}),
  async getOrder(actor:string,id:string){const {data,error}=await admin.from('payment_orders').select('*').eq('id',id).eq('user_id',actor).single();if(error)throw new Error('Order not available.');return data},
  async myOrders(actor:string){const {data,error}=await admin.from('payment_orders').select('*').eq('user_id',actor).order('created_at',{ascending:false}).limit(50);if(error)throw error;return data},
  finalize:(actor:string,r:any)=>rpc('payment_finalize_order',{actor,order_key:r.orderId,receipt_amount:r.amountMinor,receipt_currency:r.currency,receipt_provider:r.provider,receipt_status:r.status,receipt_reference:r.reference}),
  savePrices:(actor:string,course:string,paid:boolean,prices:any[])=>rpc('payment_set_prices',{actor,course_key:course,is_paid:paid,price_bdt:prices.find(p=>p.currency==='BDT').amountMinor,price_usd:prices.find(p=>p.currency==='USD').amountMinor})
 };
 return createPaymentHandler({env,repository,authenticate:async(request:Request)=>{
  const header=request.headers.get('Authorization')||'';if(!header.startsWith('Bearer '))return null;
  // Validate the JWT with Supabase Auth. Never trust decoded browser claims.
  const {data,error}=await publicClient.auth.getUser(header.slice(7));return error?null:data.user;
 }});
}
Deno.serve(async request=>{try{assertSandbox(env)}catch{return new Response('Sandbox payments unavailable.',{status:403})}handler??=initialize();return await handler(request)});
