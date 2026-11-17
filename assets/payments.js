import {config} from './config.js?v=trial-1';
import {client,currentUser} from './auth.js?v=trial-1';
import {normalizeCourse} from './course-model.js?v=trial-1';
import {createStudentAccess} from './student-access.js?v=trial-1';
const studentAccess=createStudentAccess({getClient:client,getUser:currentUser});
export const sandboxEnabled=()=>config.paymentSandboxEnabled===true;
export function assertPaymentSandbox(){if(!sandboxEnabled())throw new Error('The payment sandbox is disabled.');const url=new URL(config.supabaseUrl);if(url.hostname!=='szqiueneqmktiilagbdv.supabase.co')throw new Error('Use a separate sandbox Supabase project for payment testing.');}
export async function paymentRequest(body){assertPaymentSandbox();const c=await client();const {data:{session},error}=await c.auth.getSession();if(error||!session)throw new Error('Sign in with an authorized sandbox test account.');const response=await fetch(new URL('/functions/v1/payments-sandbox',config.supabaseUrl),{method:'POST',headers:{'Content-Type':'application/json','apikey':config.supabasePublishableKey,'Authorization':'Bearer '+session.access_token},body:JSON.stringify(body),cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Sandbox request failed.');return data}
export const paymentCatalog=()=>studentAccess.catalog();
export const paymentAccess=courseId=>studentAccess.access(courseId);
export async function protectedCourse(courseId){const access=await paymentAccess(courseId);if(!access.paid||!access.access)return {access};const c=await client();const {data,error}=await c.rpc('payment_get_content',{course_key:courseId});if(error||!data)throw new Error('Course content is unavailable.');return {access,course:normalizeCourse(data,courseId)}}
