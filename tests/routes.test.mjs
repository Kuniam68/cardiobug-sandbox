import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeNext} from '../assets/routes.js';
const base='https://kuniam68.github.io/Cardiology-/signin.html';
test('login returns to permitted learning route',()=>assert.equal(safeNext('course.html?id=heart-foundations',base),'https://kuniam68.github.io/Cardiology-/course.html?id=heart-foundations'));
test('login rejects external and unexpected destinations',()=>{for(const url of ['https://example.com/dashboard.html','//example.com/course.html','javascript:alert(1)','../dashboard.html','signin.html','assets/app.js','https://kuniam68.github.io/another/dashboard.html'])assert.equal(safeNext(url,base),'dashboard.html')});
