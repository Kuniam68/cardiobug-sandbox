export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,79}$/.test(id);
export function validateCourse(c){
 if(!validId(c.id))throw new Error('Use a course ID with 2–80 lowercase letters, numbers, or hyphens, starting with a letter.');
 for(const key of ['title','subtitle','category','description'])if(typeof c[key]!=='string'||!c[key].trim()||c[key].length>2000)throw new Error('Complete the course title, subtitle, category, and description.');
 if(!Array.isArray(c.outcomes)||!c.outcomes.length||c.outcomes.length>12||c.outcomes.some(x=>typeof x!=='string'||!x.trim()||x.length>500))throw new Error('Add 1–12 learning outcomes.');
 if(!Array.isArray(c.lessons)||!c.lessons.length||c.lessons.length>60)throw new Error('Add 1–60 lessons.');
 const ids=new Set();for(const l of c.lessons){if(!validId(l.id)||ids.has(l.id))throw new Error('Every lesson needs a unique, valid ID.');ids.add(l.id);if(typeof l.title!=='string'||!l.title.trim()||l.title.length>200)throw new Error('Each lesson needs a title of up to 200 characters.');if(typeof l.content!=='string'||!l.content.trim()||l.content.length>50000)throw new Error('Each lesson needs text content (up to 50,000 characters).');if(!Number.isInteger(l.minutes)||l.minutes<1||l.minutes>600)throw new Error('Lesson duration must be 1–600 minutes.');if(typeof l.question!=='string'||!l.question.trim()||typeof l.explanation!=='string'||!l.explanation.trim()||!Array.isArray(l.options)||l.options.length!==3||l.options.some(o=>typeof o!=='string'||!o.trim()||o.length>500)||!Number.isInteger(l.answer)||l.answer<0||l.answer>2)throw new Error('Complete each lesson’s question, three answers, correct answer, and explanation.');}
 return c;
}
export function normalizeCourse(payload,id){
 const c=validateCourse({...payload,id});return {...c,isSample:Boolean(c.isSample),level:typeof c.level==='string'?c.level:'Beginner',art:['anatomy','ecg','prevention'].includes(c.art)?c.art:'anatomy',minutes:c.lessons.reduce((n,l)=>n+l.minutes,0),sources:[],lessons:c.lessons.map(l=>({...l,body:l.content.split(/\n\s*\n/).map(text=>'<p>'+escapeHtml(text).replace(/\n/g,'<br>')+'</p>').join('')}))};
}
