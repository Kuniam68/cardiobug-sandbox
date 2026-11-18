// Classification and existing enrollment access are independent of checkout availability.
export function createStudentAccess({getClient,getUser}) {
  return {
    async catalog() {
      const c=await getClient();
      const {data,error}=await c.from('payment_course_settings').select('course_id').eq('paid',true);
      if(error||!Array.isArray(data)||data.some(row=>typeof row.course_id!=='string'))
        throw new Error('Could not verify course availability.');
      return new Set(data.map(row=>row.course_id));
    },
    async access(courseId) {
      const c=await getClient();
      const {data:paid,error}=await c.rpc('payment_course_is_paid',{course_key:courseId});
      if(error||typeof paid!=='boolean')throw new Error('Could not verify course availability.');
      if(!paid)return {paid:false,access:true};
      if(!await getUser())return {paid:true,access:false};
      const result=await c.rpc('payment_has_access',{course_key:courseId});
      if(result.error||typeof result.data!=='boolean')throw new Error('Could not verify course access.');
      return {paid:true,access:result.data};
    }
  };
}

export function studentCourseControls({paid=false,access=false,verified=true},checkoutEnabled) {
  if(!verified)return {badge:'AVAILABILITY UNVERIFIED',label:'Course temporarily unavailable',disabled:true,canRead:false};
  if(!paid)return {badge:'SELF-PACED · FREE',label:'Enroll & save progress ↗',disabled:false,canRead:true};
  if(access)return {badge:'PAID COURSE · ACCESS GRANTED',label:'Continue learning ↗',disabled:false,canRead:true};
  return {badge:checkoutEnabled?'PAID COURSE · LOCKED':'PAID COURSE · CHECKOUT UNAVAILABLE',
    label:checkoutEnabled?'Open secure checkout ↗':'Locked — checkout unavailable',disabled:!checkoutEnabled,canRead:false};
}
