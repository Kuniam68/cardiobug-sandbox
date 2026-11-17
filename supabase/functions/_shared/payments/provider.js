// Sandbox-only adapters. No live gateway or merchant capability is assumed.
const encoder=new TextEncoder();
export const sandboxCapabilities=Object.freeze({environment:'sandbox',currencies:['BDT','USD'],liveMerchantVerified:false});
function canonical(r){return JSON.stringify([r.environment,r.provider,r.orderId,r.userId,r.amountMinor,r.currency,r.status,r.reference])}
async function key(secret){if(typeof secret!=='string'||secret.length<32)throw new Error('Sandbox signing is not configured.');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
function unhex(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new Error('Invalid sandbox receipt.');return Uint8Array.from(value.match(/../g),b=>parseInt(b,16))}
export function sandboxProvider(code){if(!['BDT','USD'].includes(code))throw new Error('Unsupported currency.');const id='sandbox-'+code.toLowerCase();return {
 id,environment:'sandbox',currencies:[code],liveMerchantVerified:false,
 async createCheckout(order){if(order.currency!==code||order.provider!==id||order.environment!=='sandbox')throw new Error('Provider mismatch.');return {reference:`sandbox-checkout-${order.id}`,environment:'sandbox'}},
 async simulate(order,status,secret){if(!['succeeded','failed','cancelled'].includes(status))throw new Error('Invalid sandbox outcome.');await this.createCheckout(order);const receipt={environment:'sandbox',provider:id,orderId:order.id,userId:order.user_id,amountMinor:order.amount_minor,currency:code,status,reference:`${id}-${order.id}`};return {...receipt,signature:hex(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(canonical(receipt))))}},
 async verify(receipt,secret){if(receipt.environment!=='sandbox'||receipt.provider!==id||receipt.currency!==code)throw new Error('Invalid sandbox receipt.');if(!await crypto.subtle.verify('HMAC',await key(secret),unhex(receipt.signature),encoder.encode(canonical(receipt))))throw new Error('Invalid sandbox receipt.');return receipt}
}}
