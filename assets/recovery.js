// Recovery credentials remain in memory. Never log a callback URL or token.
export class RecoveryError extends Error {
  constructor(code, message) { super(message); this.name='RecoveryError'; this.code=code; }
}
const invalid=()=>new RecoveryError('invalid','This reset link is invalid, expired, or has already been used. Request a new password reset email.');
const missing=()=>new RecoveryError('missing','Open a fresh password reset link from your email to continue.');
export function parseRecoveryLink(href) {
  const url=new URL(href),query=url.searchParams,hash=new URLSearchParams(url.hash.slice(1));
  if(query.has('error')||query.has('error_code')||hash.has('error')||hash.has('error_code'))throw invalid();
  for(const p of [query,hash])for(const key of ['token_hash','code','access_token','refresh_token','type'])if(p.getAll(key).length>1)throw invalid();
  const type=query.get('type')||hash.get('type');
  if(type&&type!=='recovery')throw invalid();
  const otp=query.get('token_hash'),code=query.get('code'),access=hash.get('access_token'),refresh=hash.get('refresh_token');
  if([Boolean(otp),Boolean(code),Boolean(access||refresh)].filter(Boolean).length>1)throw invalid();
  if(otp&&otp.length<=4096)return {kind:'otp',tokenHash:otp};
  if(code&&code.length<=4096)return {kind:'pkce',code};
  if(access&&refresh&&type==='recovery'&&access.length<=16384&&refresh.length<=8192)return {kind:'legacy',accessToken:access,refreshToken:refresh};
  if(access||refresh||query.has('token_hash')||query.has('code'))throw invalid();
  throw missing();
}
export function recoveryStorage(browserStorage,verifierKey,sourceKey=verifierKey) {
  const memory=new Map();
  return {
    getItem(key) { if(key===verifierKey){try{return browserStorage?.getItem(sourceKey)??null}catch{return null}}return memory.get(key)??null; },
    setItem(key,value) { memory.set(key,value); },
    removeItem(key) { memory.delete(key); if(key===verifierKey){try{browserStorage?.removeItem(sourceKey)}catch{}} }
  };
}
export function hasRecoveryVerifier(storage,key) {
  try { const raw=storage.getItem(key); if(!raw)return false;const value=JSON.parse(raw);return typeof value==='string'&&value.endsWith('/PASSWORD_RECOVERY'); } catch { return false; }
}
function safeError(error) {
  if(error instanceof RecoveryError)return error;
  if(error?.code==='same_password')return new RecoveryError('password','Choose a password different from your current password.');
  if(error?.code==='weak_password')return new RecoveryError('password','Choose a stronger password with at least 12 characters.');
  if(error?.status===429)return new RecoveryError('retry','Too many attempts. Wait a little before trying again.');
  if(error instanceof TypeError||['AuthRetryableFetchError'].includes(error?.name))return new RecoveryError('retry','The authentication service could not be reached. Check your connection and try again.');
  return invalid();
}
export function createRecoveryController({auth,link,canExchangePkce=()=>false,now=()=>Date.now()}) {
  let state='idle',userId=null,validatedAt=0,pending=null,candidate=null;
  async function validateSession(session) {
    if(!session?.access_token||!session?.refresh_token)throw invalid();
    const {data,error}=await auth.getUser(session.access_token);
    if(error)throw error;
    if(!data?.user?.id||(session.user?.id&&session.user.id!==data.user.id)||(userId&&userId!==data.user.id))throw invalid();
    return data.user.id;
  }
  async function initialize() {
    if(state==='ready')return;
    if(pending)return pending;
    if(state!=='idle')throw invalid();
    state='validating';
    pending=(async()=>{
      try {
        let response;
        if(candidate)response={data:{session:candidate},error:null};
        else if(link.kind==='otp')response=await auth.verifyOtp({token_hash:link.tokenHash,type:'recovery'});
        else if(link.kind==='pkce'){
          if(!canExchangePkce())throw new RecoveryError('browser','This link belongs to a different browser session. Open it in the browser tab where you requested it, or request a new reset email.');
          response=await auth.exchangeCodeForSession(link.code);
        }else if(link.kind==='legacy')response=await auth.setSession({access_token:link.accessToken,refresh_token:link.refreshToken});
        else throw missing();
        if(response.error)throw response.error;
        candidate=response.data?.session;
        userId=await validateSession(candidate);
        validatedAt=now();link=null;state='ready';
      }catch(error){const safe=safeError(error);state=safe.code==='retry'?'idle':'invalid';if(state==='invalid'){link=null;candidate=null}throw safe;}
      finally{pending=null;}
    })();
    return pending;
  }
  async function updatePassword(password) {
    if(state!=='ready')throw new RecoveryError('not-ready','Validate your password reset link before choosing a new password.');
    if(typeof password!=='string'||password.length<12||password.length>128)throw new RecoveryError('password','Use a password between 12 and 128 characters.');
    state='saving';
    try {
      if(now()-validatedAt>15*60*1000)throw invalid();
      const {data,error}=await auth.getSession();if(error)throw error;
      await validateSession(data?.session);
      const result=await auth.updateUser({password});if(result.error)throw result.error;
      state='complete';candidate=null;
      // Revoke only the isolated recovery session. Other account sessions are untouched.
      try{await auth.signOut({scope:'local'})}catch{}
    }catch(error){const safe=safeError(error);state=['password','retry'].includes(safe.code)?'ready':'invalid';throw safe;}
  }
  return {initialize,updatePassword,get state(){return state}};
}
