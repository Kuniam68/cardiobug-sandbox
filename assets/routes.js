// Allow only learning routes under this repository's origin and path after sign-in.
export function safeNext(next,current=globalThis.location?.href){
 if(!next||!current)return 'dashboard.html';
 try{const url=new URL(next,current),base=new URL('.',current);
  if(url.origin===base.origin&&url.pathname.startsWith(base.pathname)&&['course.html','lesson.html','dashboard.html','admin.html','checkout.html','pricing.html'].includes(url.pathname.split('/').pop()))return url.href;
 }catch{}
 return 'dashboard.html';
}
