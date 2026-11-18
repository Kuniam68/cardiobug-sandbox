// Official hosted-checkout API v4. No card data enters the academy application.
export const PROVIDER='sslcommerz';
export const ENDPOINTS=Object.freeze({sandbox:'https://sandbox.sslcommerz.com',live:'https://securepay.sslcommerz.com'});
export function toMinor(value){const s=String(value??'');if(!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(s))throw new Error('Invalid provider amount');const [whole,frac='']=s.split('.');const n=Number(whole)*100+Number(frac.padEnd(2,'0'));if(!Number.isSafeInteger(n))throw new Error('Invalid provider amount');return n;}
export function decimal(n){if(!Number.isSafeInteger(n)||n<1)throw new Error('Invalid amount');return Math.floor(n/100)+'.'+String(n%100).padStart(2,'0');}
export function hostedURL(value,mode){const u=new URL(value);if(u.origin!==ENDPOINTS[mode]||u.username||u.password||u.protocol!=='https:')throw new Error('Unexpected provider redirect');return u.href;}
export function verifyPayment(data,order,validationId){
 if(!['VALID','VALIDATED'].includes(data?.status)||data.val_id!==validationId||data.tran_id!==order.merchant_ref||!data.bank_tran_id||String(data.bank_tran_id).length>100)throw new Error('Invalid provider verification');
 // Native BDT only. Published foreign currency conversion is not genuine USD collection.
 if(data.currency!=='BDT'||(data.currency_type&&data.currency_type!=='BDT')||order.currency!=='BDT'||toMinor(data.amount)!==Number(order.amount_minor)||(data.currency_amount!==undefined&&toMinor(data.currency_amount)!==Number(order.amount_minor)))throw new Error('Receipt amount or currency mismatch');
 return {merchantTransaction:order.merchant_ref,amountMinor:Number(order.amount_minor),currency:'BDT',environment:order.environment,status:String(data.risk_level)==='0'?'succeeded':'review',validationReference:validationId,bankTransaction:String(data.bank_tran_id)};
}
export function createSSLCommerz({mode,storeId,password,fetchImpl=fetch}){
 if(!ENDPOINTS[mode]||!storeId||!password)throw new Error('Gateway credentials unavailable');
 const auth={store_id:storeId,store_passwd:password,format:'json'};
 async function request(path,params,method='GET'){
  const url=new URL(path,ENDPOINTS[mode]);const form=new URLSearchParams({...auth,...params});if(method==='GET')url.search=form.toString();
  // Never log URLs, credentials, raw notifications or responses. TLS checks remain enabled.
  const res=await fetchImpl(url.href,{method,redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store',...(method==='POST'?{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()}:{})});
  if(!res.ok)throw new Error('Gateway unavailable');const text=await res.text();if(text.length>131072)throw new Error('Oversized provider response');return JSON.parse(text);
 }
 return {
  mode,
  async initiate(order,customer,callbackBase){
   if(order.environment!==mode||order.currency!=='BDT'||Number(order.amount_minor)<1000||Number(order.amount_minor)>50000000)throw new Error('Unsupported gateway order');
   const r=await request('/gwprocess/v4/api.php',{total_amount:decimal(Number(order.amount_minor)),currency:'BDT',tran_id:order.merchant_ref,success_url:callbackBase+'/success',fail_url:callbackBase+'/fail',cancel_url:callbackBase+'/cancel',ipn_url:callbackBase+'/ipn',emi_option:'0',shipping_method:'NO',num_of_item:'1',product_name:customer.courseTitle.slice(0,200),product_category:'Education',product_profile:'non-physical-goods',cus_name:customer.name,cus_email:customer.email,cus_phone:customer.phone,cus_country:customer.country,cus_add1:customer.address,cus_city:customer.city,cus_postcode:customer.postcode},'POST');
   if(r.status!=='SUCCESS'||typeof r.sessionkey!=='string'||!r.sessionkey||r.sessionkey.length>255)throw new Error('Session creation uncertain');return {sessionKey:r.sessionkey,url:hostedURL(r.GatewayPageURL,mode)};
  },
  async validate(order,valId){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(valId))throw new Error('Invalid validation reference');return verifyPayment(await request('/validator/api/validationserverAPI.php',{val_id:valId}),order,valId);},
  async reconcile(order){
   const r=await request('/validator/api/merchantTransIDvalidationAPI.php',{tran_id:order.merchant_ref});
   if(r.APIConnect!=='DONE'||!Array.isArray(r.element))throw new Error('Reconciliation unavailable');
   const records=r.element.filter(x=>x.tran_id===order.merchant_ref);const success=records.filter(x=>['VALID','VALIDATED'].includes(x.status));
   if(success.length){const result=await this.validate(order,success[0].val_id);if(new Set(success.map(x=>x.val_id)).size>1)result.status='review';return result;}
   if(!records.length)return null;
   // Only provider-authenticated terminal outcomes with exact immutable amount/currency count.
   if(records.some(x=>!['FAILED','CANCELLED'].includes(x.status)))return null;
   for(const x of records)if(x.currency!=='BDT'||toMinor(x.amount)!==Number(order.amount_minor)||(x.currency_type&&x.currency_type!=='BDT'))throw new Error('Reconciliation mismatch');
   return {merchantTransaction:order.merchant_ref,amountMinor:Number(order.amount_minor),currency:'BDT',environment:order.environment,status:records.every(x=>x.status==='CANCELLED')?'cancelled':'failed',validationReference:null,bankTransaction:null};
  },
  async initiateRefund(order,refund){
   const r=await request('/validator/api/merchantTransIDvalidationAPI.php',{bank_tran_id:order.bank_reference,refund_trans_id:refund.refund_trans_id,refund_amount:decimal(Number(refund.amount_minor)),refund_remarks:refund.reason,refe_id:refund.id,v:'1'});
   if(r.APIConnect!=='DONE'||r.bank_tran_id!==order.bank_reference||r.trans_id!==order.merchant_ref||!['success','processing'].includes(r.status)||!r.refund_ref_id)throw new Error('Refund initiation uncertain');
   return {reference:r.refund_ref_id,status:'processing'};
  },
  async queryRefund(order,refund){
   if(!refund.provider_reference)throw new Error('Refund reference unavailable; merchant support required');
   const r=await request('/validator/api/merchantTransIDvalidationAPI.php',{refund_ref_id:refund.provider_reference});
   if(r.APIConnect!=='DONE'||r.bank_tran_id!==order.bank_reference||(r.tran_id||r.trans_id)!==order.merchant_ref||r.refund_ref_id!==refund.provider_reference||!['refunded','processing','cancelled'].includes(r.status)||(r.refund_amount!==undefined&&toMinor(r.refund_amount)!==Number(refund.amount_minor)))throw new Error('Refund verification failed');
   return {reference:refund.provider_reference,status:r.status};
  }
 };
}
