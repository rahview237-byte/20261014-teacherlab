// Tests the local mockup's rules, not server authentication or browser rendering.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = process.argv[2];
if (!path) throw new Error('Pass the absolute mockup HTML path.');
const html = fs.readFileSync(path, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const modelSource = script.split('// DEMO_MODEL_END')[0];
const context = vm.createContext({ crypto: webcrypto, Intl, Date, Uint32Array });
vm.runInContext(modelSource, context);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function setup() {
  let day = '2026-10-13';
  const m = context.createClassroomDemo({ today: () => day, random: () => '0123' });
  return { m, nextDay: () => { day = '2026-10-14'; } };
}
const loginTeacher = m => m.login('teacher', '', 'teacher2026!');
const loginStudent = (m, id = 's1', pin = '1234') => { m.logout(); m.login('student', id, pin); };
test('Script syntax and four-digit PIN validation', () => {
  const {m} = setup();
  assert.throws(() => m.login('student', 's1', '1111'));
  loginStudent(m);
  assert.equal(m.my().name, '김하늘');
  assert.throws(() => m.changePin('1234', '123'));
  m.changePin('1234', '0987');
  m.logout();
  assert.throws(() => m.login('student', 's1', '1234'));
  m.login('student', 's1', '0987');
});
test('Student cannot access teacher actions or another student records', () => {
  const {m} = setup(); loginStudent(m);
  for (const operation of [() => m.teacherCode(), () => m.bulk(0), () => m.roster(), () => m.history(), () => m.resetPin('s2','1234'), () => m.cancel(1), () => m.warm(5), () => m.group(0,1)]) assert.throws(operation);
  assert.equal(m.my().id, 's1');
  m.logout(); assert.throws(() => m.my());
});
test('Wrong praise code does not earn a stamp; two claims across all areas', () => {
  const {m} = setup(); loginTeacher(m); const code = m.teacherCode().value;
  assert.equal(code, '0123'); loginStudent(m);
  assert.throws(() => m.claim(0, '9999')); assert.equal(m.my().used, 0);
  m.claim(0, code); m.claim(1, code);
  assert.equal(m.my().used, 2); assert.equal(m.my().counts[0], 1); assert.equal(m.my().counts[1], 1);
  assert.throws(() => m.claim(2, code));
  loginStudent(m,'s2','2345'); assert.equal(m.my().used,0); assert.equal(m.my().counts[0],0);
});
test('Cancellation does not restore daily allowance or allow double cancellation', () => {
  const {m} = setup(); loginTeacher(m); const code=m.teacherCode().value; loginStudent(m);
  m.claim(0,code);m.claim(1,code);m.logout();loginTeacher(m);
  const id=m.history()[0].id;m.cancel(id);assert.throws(()=>m.cancel(id));
  loginStudent(m);assert.equal(m.my().used,2);assert.throws(()=>m.claim(2,code));
});
test('Korean date boundary rotates code and resets daily usage without losing totals', () => {
  const {m,nextDay}=setup();loginTeacher(m);const old=m.teacherCode().value;loginStudent(m);m.claim(0,old);m.claim(0,old);
  nextDay();assert.equal(m.my().used,0);assert.equal(m.my().counts[0],2);assert.throws(()=>m.claim(1,old));
  m.logout();loginTeacher(m);const fresh=m.teacherCode().value;assert.notEqual(fresh,old);loginStudent(m);m.claim(1,fresh);assert.equal(m.my().used,1);
});
test('Bulk awards affect every student and do not consume self-claim quota', () => {
  const {m}=setup();loginTeacher(m);assert.equal(m.bulk(2).granted,3);
  for(const s of m.roster()){assert.equal(s.counts[2],1);assert.equal(s.used,0);}
  loginStudent(m);assert.equal(m.my().counts[2],1);
});
test('Thirty-stamp ceiling and bulk skip counts', () => {
  const {m}=setup();loginTeacher(m);const code=m.teacherCode().value;
  for(let i=0;i<29;i++)m.bulk(0);
  loginStudent(m);m.claim(0,code);assert.throws(()=>m.claim(0,code));assert.equal(m.my().used,1);
  m.logout();loginTeacher(m);const result=m.bulk(0);assert.equal(result.granted,2);assert.equal(result.skipped,1);
  assert.equal(m.bulk(0).granted,0);for(const s of m.roster())assert.equal(s.counts[0],30);
});
test('Roster validation is atomic, duplicate names use distinct IDs, new PIN logs in', () => {
  const {m}=setup();loginTeacher(m);assert.throws(()=>m.addRoster('최나무, 4567\n오류, 22'));assert.equal(m.names().length,3);
  assert.equal(m.addRoster('김하늘, 4567\n정다온, 0001'),2);
  assert.notEqual(m.names()[0].id,m.names()[3].id);loginStudent(m,'s5','0001');assert.equal(m.my().name,'정다온');
});
test('Teacher can reset PIN; former PIN is rejected', () => {
  const {m}=setup();loginTeacher(m);m.resetPin('s1','9876');m.logout();assert.throws(()=>m.login('student','s1','1234'));m.login('student','s1','9876');
});
test('Five failed attempts are throttled', () => {
  const {m}=setup();for(let i=0;i<5;i++)assert.throws(()=>m.login('student','s1','0000'));assert.throws(()=>m.login('student','s1','1234'),/잠시/);
});
test('Group ceilings and thermometer five-degree bounds', () => {
  const {m}=setup();loginTeacher(m);for(let i=0;i<25;i++){m.group(0,1);m.warm(5);}assert.equal(m.groupCounts()[0],15);assert.equal(m.groupCounts()[1],0);assert.equal(m.temperature(),100);
  for(let i=0;i<25;i++){m.group(0,-1);m.warm(-5);}assert.equal(m.groupCounts()[0],0);assert.equal(m.temperature(),0);assert.throws(()=>m.warm(1));
});
test('Production-free mockup does not persist credentials or make API calls', () => {
  assert.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|WebSocket/.test(script));
  assert.ok(!html.includes('마지막 칭찬취소'));
  assert.ok(html.includes('repeat(30,minmax(0,1fr))'));
});
console.log(`${passed} checks passed. Browser rendering and server security were not tested.`);
