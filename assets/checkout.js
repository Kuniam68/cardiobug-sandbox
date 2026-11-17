import {paymentRequest,assertPaymentSandbox} from './payments.js?v=trial-1';
import {minorToDecimal} from './money.js?v=trial-1';
import {currentUser} from './auth.js?v=trial-1';
import {paymentAccess} from './payments.js?v=trial-1';
const root=document.getElementById('checkout-app');
let order=null,requestKey=null,prices=[],actor=null,courseId='';
const $=s=>root.querySelector(s);
const money=(n,c)=>(c==='BDT'?'৳':'$')+minorToDecimal(Number(n));
const keyFor=c=>`cardiobug:dummy-order:${actor.id}:${courseId}:${c}`;
const storage={get(k){try{return sessionStorage.getItem(k)}catch{return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch{}},remove(k){try{sessionStorage.removeItem(k)}catch{}}};
function message(text,error=false){$('#checkout-status').textContent=text;$('#checkout-status').classList.toggle('error',error)}
async function init(){
 root.innerHTML='<div id="checkout-status" class="notice" role="status"></div><div id="checkout-content"></div>';
 try{
  assertPaymentSandbox();const params=new URLSearchParams(location.search);courseId=params.get('course')||'';
  if(!/^[a-z][a-z0-9-]{1,79}$/.test(courseId))throw new Error('Choose a valid course from the course catalog.');
  actor=await currentUser();
  if(!actor){$('#checkout-content').innerHTML=`<h2>Sign in for your dummy purchase</h2><p>No real money is charged.</p><a class="btn primary" href="signin.html?next=${encodeURIComponent('checkout.html?course='+courseId)}">Sign in to continue</a>`;return}
  if(params.has('new'))for(const c of ['BDT','USD'])storage.remove(keyFor(c));
  const quote=await paymentRequest({action:'quote',courseId});
  if(!quote.paid){$('#checkout-content').innerHTML=`<p>This is a free course.</p><a class="btn primary" href="course.html?id=${encodeURIComponent(courseId)}">Open course</a>`;return}
  prices=quote.prices;
  if(!Array.isArray(prices)||!prices.length)throw new Error('No sandbox currency is available.');
  const access=await paymentAccess(courseId);
  if(access.access&&!params.has('order')){$('#checkout-content').innerHTML=`<h2>You already have course access</h2><a class="btn primary" href="course.html?id=${encodeURIComponent(courseId)}">Open your course</a> <a class="btn" href="dashboard.html">Student dashboard</a>`;return}
  $('#checkout-content').innerHTML='<h2>Choose your dummy payment</h2><p>SIMULATION ONLY. No card, bank account, or real money is involved.</p><div class="field"><label for="checkout-currency">Payment currency</label><select id="checkout-currency"></select></div><p id="quoted-price" style="margin-top:20px"></p><button class="btn primary" id="create-order">Create dummy order</button><div id="order-summary" aria-live="polite"></div>';
  for(const p of prices){if(!['BDT','USD'].includes(p.currency))throw new Error('Unsupported currency.');const option=document.createElement('option');option.value=p.currency;option.textContent=p.currency+' — '+money(p.amountMinor,p.currency);$('#checkout-currency').append(option)}
  const show=()=>{const p=prices.find(p=>p.currency===$('#checkout-currency').value);$('#quoted-price').textContent='Exact simulated amount: '+p.currency+' '+money(p.amountMinor,p.currency);requestKey=null};
  $('#checkout-currency').onchange=show;show();
  $('#create-order').onclick=async()=>{
   const b=$('#create-order');b.disabled=true;
   try{const currency=$('#checkout-currency').value;requestKey??=storage.get(keyFor(currency))||crypto.randomUUID();storage.set(keyFor(currency),requestKey);
    order=await paymentRequest({action:'create-order',courseId,currency,requestKey});
    history.replaceState(null,'','checkout.html?course='+encodeURIComponent(courseId)+'&order='+encodeURIComponent(order.id));
    $('#checkout-currency').disabled=true;renderOrder();message('Dummy order created. Choose a simulated outcome below.');
   }catch(e){message(e.message,true);b.disabled=false}
  };
  if(params.has('order')){order=await paymentRequest({action:'get-order',orderId:params.get('order')});if(order.course_id!==courseId)throw new Error('Order does not match this course.');$('#checkout-currency').value=order.currency;$('#checkout-currency').disabled=true;$('#create-order').disabled=true;renderOrder()}
 }catch(e){message(e.message||'The sandbox checkout is unavailable. Please sign in again or retry.',true)}
}
function renderOrder(){
 const el=$('#order-summary');el.replaceChildren();
 const h=document.createElement('h3');h.style.marginTop='30px';h.textContent='Dummy order: '+order.currency+' '+money(order.amount_minor,order.currency);el.append(h);
 for(const text of ['Order: '+order.id,'Status: '+order.status,'Transaction reference: '+(order.provider_reference||'Not settled')]){const p=document.createElement('p');p.textContent=text;el.append(p)}
 if(order.status==='pending'){
  const actions=document.createElement('div');actions.className='actions';
  for(const [outcome,label] of [['succeeded','Dummy payment — success'],['failed','Simulate failure'],['cancelled','Cancel dummy payment']]){
   const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;
   b.onclick=async()=>{actions.querySelectorAll('button').forEach(x=>x.disabled=true);
    try{order=await paymentRequest({action:'simulate',orderId:order.id,outcome});renderOrder();message(order.status==='succeeded'?'Dummy payment verified. You are enrolled; open your course below.':'Dummy payment '+order.status+'. No enrollment was granted.')}
    catch(e){message(e.message,true);try{order=await paymentRequest({action:'get-order',orderId:order.id});renderOrder()}catch{actions.querySelectorAll('button').forEach(x=>x.disabled=false)}}
   };actions.append(b);
  }
  el.append(actions);
 }else{
  const link=document.createElement('a');link.className='btn primary';
  link.href=order.status==='succeeded'?'course.html?id='+encodeURIComponent(order.course_id):'checkout.html?course='+encodeURIComponent(order.course_id)+'&new=1';
  link.textContent=order.status==='succeeded'?'Open protected course':'Try a new dummy order';el.append(link);
  const dashboard=document.createElement('a');dashboard.className='btn';dashboard.href='dashboard.html';dashboard.textContent='View student dashboard';el.append(dashboard);
 }
}
if(root)init();
