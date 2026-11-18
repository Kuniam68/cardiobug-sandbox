import {config} from './config.js?v=gateway-1';
import {client,currentUser} from './auth.js?v=gateway-1';
import {normalizeCourse} from './course-model.js?v=gateway-1';
import {createStudentAccess} from './student-access.js?v=gateway-1';
const studentAccess=createStudentAccess({getClient:client,getUser:currentUser});
export const checkoutEnabled=()=>config.paymentCheckoutEnabled===true;
export function assertPaymentConfig(){if(config.supabaseUrl!=='https://szqiueneqmktiilagbdv.supabase.co'||config.paymentSandboxEnabled!==false)throw new Error('Production payment configuration rejected.');}
export const endpoint=()=>new URL('/functions/v1/academy-payments',config.supabaseUrl);
export async function gatewayReadiness(){assertPaymentConfig();const r=await fetch(endpoint(),{cache:'no-store'});if(!r.ok)throw new Error('Payment availability could not be verified.');return r.json();}
export async function paymentRequest(body){assertPaymentConfig();const c=await client();const {data:{session},error}=await c.auth.getSession();if(error||!session)throw new Error('Sign in to view your payment details.');const r=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json','apikey':config.supabasePublishableKey,'Authorization':'Bearer '+session.access_token},body:JSON.stringify(body),cache:'no-store'});const data=await r.json();if(!r.ok){const error=new Error(data.error||'Payment service unavailable.');if(data.orderId)error.orderId=data.orderId;throw error;}return data;}
export const paymentCatalog=()=>studentAccess.catalog();
export const paymentAccess=id=>studentAccess.access(id);
export async function protectedCourse(courseId){const access=await paymentAccess(courseId);if(!access.paid||!access.access)return {access};const c=await client();const {data,error}=await c.rpc('payment_get_content',{course_key:courseId});if(error||!data)throw new Error('Protected content is unavailable.');return {access,course:normalizeCourse(data,courseId)};}
