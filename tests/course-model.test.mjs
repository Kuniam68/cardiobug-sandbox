import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCourse,normalizeCourse} from '../assets/course-model.js';
const make=()=>({id:'example-course',title:'Example',subtitle:'Example course',category:'Foundations',description:'A sample',outcomes:['Understand the topic'],isSample:true,lessons:[{id:'first-lesson',title:'First lesson',content:'<img src=x onerror=alert(1)>\n\nSecond paragraph',minutes:5,question:'Which?',options:['One','Two','Three'],answer:1,explanation:'Two is correct.'}]});
test('managed lesson content is escaped and never rendered as executable markup',()=>{const c=normalizeCourse(make(),'example-course');assert.ok(c.lessons[0].body.includes('&lt;img'));assert.ok(!c.lessons[0].body.includes('<img'));assert.equal(c.minutes,5);assert.equal(c.isSample,true)});
test('duplicate lesson IDs, unsafe route IDs, and invalid knowledge checks are rejected',()=>{let c=make();c.lessons.push({...c.lessons[0]});assert.throws(()=>validateCourse(c),/unique/);c=make();c.id='../bad';assert.throws(()=>validateCourse(c),/course ID/);c=make();c.lessons[0].answer=4;assert.throws(()=>validateCourse(c),/question/)});
