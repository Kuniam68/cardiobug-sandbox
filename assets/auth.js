import {config} from './config.js';
import {paymentAccess} from './payments.js';
import {recoveryStorage,hasRecoveryVerifier} from './recovery.js';
export const configured=Boolean(config.supabaseUrl&&config.supabasePublishableKey);
let clientPromise;
export function client(){
 if(!configured)return Promise.resolve(null);
 if(!clientPromise)clientPromise=(async()=>{const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm');return createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{flowType:'pkce',persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true}})})();
 return clientPromise;
}
export async function currentUser(){const c=await client();if(!c)return null;const {data,error}=await c.auth.getUser();if(error){if(error.name==='AuthSessionMissingError')return null;throw error}return data.user}
export async function recoveryClient(){
 if(!configured)throw new Error('Account recovery is not configured.');
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm');
 const baseKey='sb-'+new URL(config.supabaseUrl).hostname.split('.')[0]+'-auth-token';
 const storageKey=baseKey+'-recovery';
 let browserStorage;try{browserStorage=globalThis.sessionStorage}catch{}
 const verifierKey=storageKey+'-code-verifier';
 const storage=recoveryStorage(browserStorage,verifierKey,baseKey+'-code-verifier');
 const isolated=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{flowType:'pkce',storageKey,storage,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
 return {auth:isolated.auth,canExchangePkce:()=>hasRecoveryVerifier(storage,verifierKey)};
}
export function redirectUrl(page='dashboard.html'){return new URL(page,location.href).href}
export async function enroll(courseId){const access=await paymentAccess(courseId);if(access.paid){if(access.access)return true;if(config.paymentSandboxEnabled!==true)throw new Error('Paid course locked. Checkout is currently unavailable.');location.href='checkout.html?course='+encodeURIComponent(courseId);return false}const c=await client();const user=await currentUser();if(!c||!user){location.href='signin.html?next='+encodeURIComponent('course.html?id='+courseId);return false}const {error}=await c.from('enrollments').upsert({user_id:user.id,course_id:courseId},{onConflict:'user_id,course_id',ignoreDuplicates:true});if(error)throw error;return true}
export async function complete(courseId,lessonId){const c=await client();const user=await currentUser();if(!c||!user)throw new Error('Sign in and enroll to save your progress.');if(!await enroll(courseId))throw new Error('Course access is required before saving progress.');const {error}=await c.from('lesson_progress').upsert({user_id:user.id,course_id:courseId,lesson_id:lessonId},{onConflict:'user_id,course_id,lesson_id',ignoreDuplicates:true});if(error)throw error}
export async function progress(){const c=await client();const user=await currentUser();if(!c||!user)return {enrollments:[],lessons:[]};const [e,l]=await Promise.all([c.from('enrollments').select('course_id,created_at').eq('user_id',user.id).order('created_at',{ascending:false}),c.from('lesson_progress').select('course_id,lesson_id').eq('user_id',user.id)]);if(e.error)throw e.error;if(l.error)throw l.error;return {enrollments:e.data,lessons:l.data}}
export function friendlyError(error){const msg=error?.message||'Something went wrong. Please try again.';if(/fetch|network|load/i.test(msg))return 'Could not connect. Check your internet connection and try again.';if(/relation|schema cache|row-level|permission denied/i.test(msg))return 'The learning database is not configured yet. Please contact the academy administrator.';return msg}
