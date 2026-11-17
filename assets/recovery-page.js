import {createRecoveryController,parseRecoveryLink} from './recovery.js?v=trial-1';
import {recoveryClient} from './auth.js?v=trial-1';

export function captureRecoveryLink(location,history){
 let link,error;
 try{link=parseRecoveryLink(location.href)}catch(e){error=e}
 // Strip all callback credentials before any asynchronous work; never persist them.
 history.replaceState(null,'',location.pathname);
 return {link,error};
}
export function mountRecoveryPage(form,captured){
 form.onsubmit=event=>event.preventDefault();
 const notice=document.getElementById('auth-status');
 if(!form.querySelector('[name=confirm-password]')){const label=document.createElement('label');label.textContent='Confirm new password';const input=document.createElement('input');input.name='confirm-password';input.type='password';input.autocomplete='new-password';input.required=true;input.minLength=12;input.maxLength=128;label.append(input);form.insertBefore(label,form.querySelector('button[type=submit]'));}
 const fields=form.querySelector('fieldset');
 const submit=form.querySelector('button[type=submit]');
 const setEnabled=value=>{if(fields)fields.disabled=!value;form.querySelectorAll('input').forEach(input=>input.disabled=!value);submit.disabled=!value};
 const tell=(message,error=false)=>{notice.textContent=message;notice.classList.toggle('error',error)};
 setEnabled(false);
 const request=document.createElement('a');request.href='forgot-password.html';request.className='btn';request.textContent='Request a new reset email';form.after(request);
 if(captured.error){tell(captured.error.message,true);return}
 const validate=document.createElement('button');validate.type='button';validate.className='btn primary';validate.textContent='Validate reset link';form.before(validate);
 tell('Validate your email link before entering a new password. Keep this page open until you finish.');
 let controller=null;
 validate.onclick=async()=>{
   validate.disabled=true;tell('Validating your reset link…');
   try{
     if(!controller)controller=createRecoveryController({...await recoveryClient(),link:captured.link});
     await controller.initialize();captured.link=null;
     validate.hidden=true;setEnabled(true);tell('Reset link verified. Choose and confirm your new password.');
     form.querySelector('[name=password]').focus();
   }catch(e){tell(e.message||'Unable to validate this link. Request a new reset email.',true);validate.disabled=controller?.state==='invalid';}
 };
 form.onsubmit=async event=>{
   event.preventDefault();if(!controller||controller.state!=='ready')return;
   const password=form.querySelector('[name=password]'),confirm=form.querySelector('[name=confirm-password]');
   confirm.setCustomValidity(password.value===confirm.value?'':'Passwords must match.');
   if(!form.reportValidity())return;
   setEnabled(false);tell('Updating your password securely…');
   try{await controller.updatePassword(password.value);form.reset();form.hidden=true;request.hidden=true;tell('Password updated. Sign in with your new password.');const signin=document.createElement('a');signin.href='signin.html';signin.className='btn primary';signin.textContent='Sign in';form.after(signin)}
   catch(e){tell(e.message||'The password could not be updated. Request a new reset email.',true);setEnabled(controller.state==='ready');}
 };
 form.querySelector('[name=confirm-password]').addEventListener('input',event=>event.target.setCustomValidity(''));
 form.querySelector('[name=password]').addEventListener('input',()=>form.querySelector('[name=confirm-password]').setCustomValidity(''));
}
