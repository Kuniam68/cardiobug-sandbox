import {client,currentUser} from './auth.js?v=gateway-1';
import {checkoutEnabled,gatewayReadiness,paymentRequest,paymentAccess} from './payments.js?v=gateway-1';
import {minorToDecimal} from './money.js?v=gateway-1';
import {escapeHtml as esc} from './course-model.js?v=gateway-1';
const root=document.getElementById('checkout-app'),params=new URLSearchParams(location.search);
const money=(n,c)=>(c==='BDT'?'৳':'$')+minorToDecimal(Number(n));
let user,quote,ready,order,key,course;
const $=s=>root.querySelector(s);
function tell(text,error=false){$('#checkout-status').textContent=text;$('#checkout-status').classList.toggle('error',error);}
function safeGateway(url){const u=new URL(url);if(!['https://securepay.sslcommerz.com','https://sandbox.sslcommerz.com'].includes(u.origin)||u.username||u.password)throw new Error('Unverified payment destination.');return u.href;}
function keyStore(){return 'cardiobug:checkout:'+user.id+':'+course+':BDT';}
function storageGet(){try{return sessionStorage.getItem(keyStore());}catch{return null;}}
function retain(value){try{sessionStorage.setItem(keyStore(),value);}catch{}}
function statusView(){
 const el=$('#order-status');el.replaceChildren();if(!order)return;
 const titles={initializing:'Preparing your payment',pending:'Awaiting payment',session_unknown:'Payment session needs reconciliation',succeeded:'Payment verified — course unlocked',failed:'Payment failed',cancelled:'Payment cancelled',review:'Payment needs review',refunded:'Payment refunded'};
 el.innerHTML=`<div class="notice"><h3>${esc(titles[order.status]||'Payment status')}</h3><p>${esc(order.currency)} ${esc(money(order.amount_minor,order.currency))}</p><p>Reference: ${esc(order.merchant_ref)}</p><p>Your access changes only after server verification. A return-page message is not proof of payment.</p></div>`;
 const controls=document.createElement('div');controls.className='actions';
 function link(label,href){const a=document.createElement('a');a.className='btn';a.textContent=label;a.href=href;controls.append(a);}
 if(order.status==='succeeded')link('Open your course','course.html?id='+encodeURIComponent(course));
 if(order.status==='pending'&&order.checkoutUrl&&ready.available&&checkoutEnabled()){
  const b=document.createElement('button');b.type='button';b.className='btn primary';b.textContent='Continue securely with SSLCOMMERZ';b.onclick=()=>location.assign(safeGateway(order.checkoutUrl));controls.append(b);
 }
 if(['failed','cancelled','refunded'].includes(order.status))link('Try checkout again','checkout.html?course='+encodeURIComponent(course)+'&new=1');
 if(ready.available){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Check payment status';b.onclick=async()=>{b.disabled=true;try{order=await paymentRequest({action:'reconcile',orderId:order.id});statusView();tell(order.status==='succeeded'?'Payment verified. Your course is ready.':'Latest provider status checked. If still pending, wait before trying again.');}catch(e){tell(e.message,true);}finally{b.disabled=false;}};controls.append(b);}
 link('Student dashboard','dashboard.html');el.append(controls);
 if(['initializing','pending','session_unknown','review','succeeded'].includes(order.status)){$('#pay-button').disabled=true;$('#billing-fields').disabled=true;}
}
async function init(){
 root.innerHTML='<div id="checkout-status" class="notice" role="status"></div><div id="checkout-layout"></div>';
 try{
  course=params.get('course')||'';if(!/^[a-z][a-z0-9-]{1,79}$/.test(course))throw new Error('Choose a course from the course catalog to review enrollment.');
  const c=await client();user=await currentUser();
  if(user)quote=await paymentRequest({action:'quote',courseId:course});
  else{const row=await c.from('academy_courses').select('payload').eq('id',course).maybeSingle();const prices=await c.from('payment_prices').select('currency,amount_minor').eq('course_id',course);const paid=await c.rpc('payment_course_is_paid',{course_key:course});if(row.error||prices.error||paid.error||!row.data)throw new Error('Course information is unavailable.');quote={title:row.data.payload.subtitle||row.data.payload.title,description:row.data.payload.description,paid:paid.data,prices:prices.data.filter(p=>p.amount_minor!==null).map(p=>({currency:p.currency,amountMinor:p.amount_minor}))};}
  ready=await gatewayReadiness();
  if(!quote.paid){$('#checkout-layout').innerHTML=`<h2>${esc(quote.title)}</h2><p>This course is free. No checkout is required.</p><a class="btn primary" href="course.html?id=${encodeURIComponent(course)}">Open course</a>`;return;}
  const bdt=quote.prices.find(x=>x.currency==='BDT'),usd=quote.prices.find(x=>x.currency==='USD'),canPay=Boolean(user&&ready.available&&checkoutEnabled()&&quote.checkoutAvailable&&bdt);
  $('#checkout-layout').innerHTML=`<div class="checkout-grid"><article><span class="eyebrow">COURSE ENROLLMENT</span><h2>${esc(quote.title)}</h2><p>${esc(quote.description)}</p><div class="payment-methods" aria-label="Hosted payment methods"><span>Cards</span><span>Mobile banking</span><span>Bank payments</span></div><p>When activated, available methods are displayed on SSLCOMMERZ’s secure hosted page. Cardiobug never asks for your card number, PIN, CVV or banking password.</p><div class="notice">${canPay?'Your exact BDT price is verified by the server before payment.':'Official sandbox checkout is not yet available. No money will be collected.'}</div><form id="checkout-form"><fieldset id="billing-fields" ${canPay?'':'disabled'}><legend>Billing details</legend>${[['name','Full name','text',50],['phone','Phone number','tel',20],['address','Address','text',100],['city','City','text',50],['postcode','Postal code','text',30],['country','Country','text',50]].map(([name,label,type,max])=>`<div class="field"><label for="billing-${name}">${label}</label><input id="billing-${name}" name="${name}" type="${type}" maxlength="${max}" required autocomplete="${({name:'name',phone:'tel',address:'street-address',city:'address-level2',postcode:'postal-code',country:'country-name'})[name]}"></div>`).join('')}<label class="terms-check"><input type="checkbox" required><span>I agree to the <a href="terms.html">terms</a> and <a href="refunds.html">refund policy</a>.</span></label></fieldset><button class="btn primary" id="pay-button" ${canPay?'':'disabled'}>${canPay?'Continue to secure payment':'Official sandbox checkout unavailable'}</button></form>${!user?`<a class="btn" href="signin.html?next=${encodeURIComponent('checkout.html?course='+course)}">Sign in to your student account</a>`:''}</article><aside class="content-panel checkout-summary"><h3>Enrollment summary</h3><p>${esc(quote.title)}</p><div class="field"><label for="checkout-currency">Payment currency</label><select id="checkout-currency"><option value="BDT">BDT${bdt?' — '+esc(money(bdt.amountMinor,'BDT')):' — price unavailable'}</option><option value="USD" disabled>USD${usd?' — '+esc(money(usd.amountMinor,'USD')):''} · collection unavailable</option></select></div><p>Exact BDT course price</p><strong class="checkout-total">${bdt?esc(money(bdt.amountMinor,'BDT')):'Price unavailable'}</strong>${usd?`<p>Independent USD course price: ${esc(money(usd.amountMinor,'USD'))}. USD collection is unavailable; it is not a conversion.</p>`:''}<p>No payment can be submitted until merchant activation and provider acceptance are complete.</p><a class="inline-link" href="course.html?id=${encodeURIComponent(course)}">← Back to course</a><div id="order-status" aria-live="polite"></div></aside></div>`;
  if(user&&await paymentAccess(course).then(x=>x.access)){$('#pay-button').disabled=true;tell('You already have course access. Open your course from the dashboard.');}
  if(params.has('new')){try{sessionStorage.removeItem(keyStore());}catch{}}
  if(params.has('order')){if(!user){tell('Sign in to view your verified order status.');return;}order=await paymentRequest({action:'get-order',orderId:params.get('order')});if(order.course_id!==course)throw new Error('Order does not match the course.');statusView();}
  $('#checkout-form').onsubmit=async e=>{e.preventDefault();if(!canPay||$('#pay-button').disabled)return;$('#pay-button').disabled=true;
   try{const data=new FormData(e.target),customer=Object.fromEntries(['name','phone','address','city','postcode','country'].map(k=>[k,String(data.get(k)||'')]));key??=storageGet()||crypto.randomUUID();retain(key);order=await paymentRequest({action:'create-session',courseId:course,currency:'BDT',requestKey:key,customer});history.replaceState(null,'','checkout.html?course='+encodeURIComponent(course)+'&order='+encodeURIComponent(order.id));statusView();if(order.checkoutUrl)location.assign(safeGateway(order.checkoutUrl));else tell('A session is already being prepared. Check payment status before retrying.');}
   catch(e){tell(e.message,true);if(e.orderId){history.replaceState(null,'','checkout.html?course='+encodeURIComponent(course)+'&order='+encodeURIComponent(e.orderId));try{order=await paymentRequest({action:'get-order',orderId:e.orderId});statusView();}catch{}}else $('#pay-button').disabled=false;}
  };
 }catch(e){tell(e.message||'Checkout information is temporarily unavailable.',true);}
}
if(root)init();
