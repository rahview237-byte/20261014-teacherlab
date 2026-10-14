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
  const m = context.createClassroomDemo({ today: () => day });
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
  for (const operation of [() => m.bulk(0), () => m.roster(), () => m.history(), () => m.resetPin('s2','1234'), () => m.cancel(1), () => m.warm(5), () => m.group(0,1)]) assert.throws(operation);
  assert.equal(m.my().id, 's1');
  m.logout(); assert.throws(() => m.my());
});
test('Direct claims allow two per area, eight total, without a code', () => {
  const {m}=setup();loginStudent(m);
  for(let area=0;area<4;area++){
    m.claim(area);m.claim(area);assert.equal(m.my().usedByArea[area],2);
    assert.throws(()=>m.claim(area));
  }
  assert.equal(m.my().used,8);
  loginStudent(m,'s2','2345');assert.equal(m.my().used,0);m.claim(0);assert.equal(m.my().counts[0],1);
  m.logout();assert.throws(()=>m.claim(0));
});
test('Cancellation keeps the used area allowance and leaves other areas available', () => {
  const {m}=setup();loginStudent(m);m.claim(0);m.claim(0);m.logout();loginTeacher(m);
  const id=m.history()[0].id;m.cancel(id);assert.throws(()=>m.cancel(id));
  loginStudent(m);assert.equal(m.my().usedByArea[0],2);assert.throws(()=>m.claim(0));m.claim(1);
});
test('Korean date boundary resets every area allowance and preserves totals', () => {
  const {m,nextDay}=setup();loginStudent(m);
  for(let area=0;area<4;area++){m.claim(area);m.claim(area);}
  nextDay();assert.equal(m.my().used,0);
  for(let area=0;area<4;area++){assert.equal(m.my().counts[area],2);assert.equal(m.my().usedByArea[area],0);m.claim(area);m.claim(area);}
  assert.equal(m.my().used,8);
});
test('Bulk awards affect every student and do not consume self-claim quota', () => {
  const {m}=setup();loginTeacher(m);assert.equal(m.bulk(2).granted,3);
  for(const s of m.roster()){assert.equal(s.counts[2],1);assert.equal(s.used,0);}
  loginStudent(m);assert.equal(m.my().counts[2],1);
});
test('Thirty-stamp ceiling and bulk skip counts', () => {
  const {m}=setup();loginTeacher(m);
  for(let i=0;i<29;i++)m.bulk(0);
  loginStudent(m);m.claim(0);assert.throws(()=>m.claim(0));assert.equal(m.my().used,1);
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
  assert.ok(!/teacherCode|data-claim-code|칭찬 코드/.test(html));
  assert.ok(html.includes('repeat(30,minmax(0,1fr))'));
});
console.log(`${passed} checks passed. Browser rendering and server security were not tested.`);
