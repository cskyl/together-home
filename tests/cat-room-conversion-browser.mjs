// Always uses an isolated in-memory API; no live credentials or database.
import {chromium,expect as baseExpect} from '@playwright/test';
import {createServer as createViteServer} from 'vite';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {createStore} from '../backend/store.mjs';
import {createApi} from '../backend/server.mjs';
import {plans} from '../src/plans.js';
import {balance,invested,inventory} from '../src/state.js';
import {cloudState,money} from './browser-helpers.mjs';

const origins=[],expect=baseExpect.configure({timeout:22000}),store=createStore(undefined,{studyRoll:()=>500}),server=createApi(store,{rateLimit:false,origins});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const vite=process.env.TEST_URL?null:await createViteServer({server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
if(vite)await vite.listen();
const url=process.env.TEST_URL||`http://127.0.0.1:${vite.httpServer.address().port}/`;
origins.push(new URL(url).origin);
const aToken=randomBytes(32).toString('hex'),bToken=randomBytes(32).toString('hex'),invite=randomBytes(32).toString('hex');
store.create(aToken,{name:'猫房甲',invite});store.join(bToken,{name:'猫房乙',invite});
const action=(who,action)=>store.action(who,{requestId:randomUUID(),action});
for(const plan of plans){action(aToken,{type:'study',minutes:80});action(aToken,{type:'build',plan:plan.id});}
action(bToken,{type:'study',minutes:480});action(aToken,{type:'purchase',item:'furniture-bed'});action(bToken,{type:'purchase',item:'cat-tree'});
let seed=store.snapshot(aToken).state;const [bed,tree]=inventory(seed);
action(aToken,{type:'place',id:bed.id,position:{plan:'riverside',room:'bed2',slot:12,rotation:1}});action(bToken,{type:'place',id:tree.id,position:{plan:'riverside',room:'kitchen',slot:13,rotation:2}});action(aToken,{type:'select',plan:'riverside'});seed=store.snapshot(aToken).state;
const browser=await chromium.launch({channel:'msedge',headless:true}),contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1100}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
const pages=await Promise.all(contexts.map(c=>c.newPage())),[a,b]=pages,errors=[];
for(const [index,page]of pages.entries()){
  page.setDefaultTimeout(22000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/cloud-config.json*',route=>route.fulfill({json:{apiUrl:`http://127.0.0.1:${server.address().port}`}}));
  const token=index?bToken:aToken,snapshot=store.snapshot(token);
  await page.addInitScript(session=>{if(!localStorage.getItem('together-home-session-v1'))localStorage.setItem('together-home-session-v1',JSON.stringify(session));},{token,roomId:snapshot.roomId,slot:snapshot.slot,memberCount:2,cached:snapshot.state,pending:null});
}
const cats=(page,ids)=>expect(page.locator('#scene canvas')).toHaveAttribute('data-cat-rooms',ids.join(','));
async function pick(page,id){await page.locator('#room-picker').selectOption(id);await expect(page.locator('#room-detail')).toBeVisible();}
async function changeUse(page,id,label){await pick(page,id);await expect(page.locator('#room-use')).toHaveText(label);await page.locator('#room-use').click();await expect(page.locator('#room-use')).toBeEnabled();}
async function refresh(page){await page.locator('#sync-open').click();await page.locator('#retry-sync').click();await page.locator('#close-cloud').click();}
try{
  await mkdir('test-results',{recursive:true});await Promise.all(pages.map(page=>page.goto(url,{waitUntil:'domcontentloaded'})));
  for(const page of pages){await expect(page.locator('#sync-open')).toContainText('已联机');await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','2');await expect(page.locator('#balance')).toHaveText(money(balance(seed)));}
  await pick(a,'garage');await expect(a.locator('#room-use')).toHaveCount(0);
  // Keep the placement editor open while the other member changes the room.
  await a.locator('[data-category=furniture]').click();await a.locator('#shop-inventory').click();await a.locator(`[data-owned="${bed.id}"]`).click();
  await expect(a.locator('#placement-room')).toHaveValue('bed2');await expect(a.locator('#placement-room option:checked')).toHaveText('次卧');
  await changeUse(b,'bed2','设为猫房');await expect(a.locator('#placement-room option:checked')).toHaveText('猫房');await expect(a.locator('#item-dialog')).toBeVisible();await expect(a.locator('#placement-room')).toHaveValue('bed2');
  await changeUse(b,'bed2','恢复原用途');await expect(a.locator('#placement-room option:checked')).toHaveText('次卧');await expect(a.locator('#placement-room')).toHaveValue('bed2');expect(store.snapshot(aToken).state.placements).toEqual(seed.placements);await a.locator('#item-close').click();
  console.log('PASS: already-open placement dialog follows partner conversion/restoration without changing position');
  await changeUse(a,'bed2','设为猫房');await cats(a,['bed2']);await cats(b,['bed2']);
  for(const page of pages){const furnished=(await page.locator('#scene canvas').getAttribute('data-default-furnished-rooms')).split(',');expect(furnished).not.toContain('bed2');await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','2');}
  await b.locator('[data-category=furniture]').click();await b.locator('#shop-inventory').click();await b.locator(`[data-owned="${bed.id}"]`).click();await expect(b.locator('#placement-room')).toHaveValue('bed2');await expect(b.locator('#placement-room option:checked')).toHaveText('猫房');await b.locator('#item-close').click();
  await pick(a,'bed2');await a.locator('.model-panel').screenshot({path:'test-results/cat-room-conversion-desktop.png'});
  await pick(b,'bed2');await b.locator('.model-panel').screenshot({path:'test-results/cat-room-conversion-mobile.png'});
  console.log('PASS: paired conversion, shop labels, owned furniture and desktop/mobile screenshots');

  // Keep one collaborator's displayed version stale, then reject their edit.
  const staleVersion=(await cloudState(b)).roomOverrides.find(v=>v.plan==='riverside').version;
  await b.route('**/v1/snapshot',route=>route.abort('failed'));
  await changeUse(a,'bed2','恢复原用途');await cats(a,[]);
  await changeUse(b,'study','设为猫房');await expect(b.locator('#room-use-error')).toContainText('刚更新');
  expect(store.snapshot(aToken).state.roomOverrides.find(v=>v.plan==='riverside')).toEqual({plan:'riverside',room:null,version:staleVersion+1});
  await b.unroute('**/v1/snapshot');await refresh(b);await cats(b,[]);
  expect((await a.locator('#scene canvas').getAttribute('data-default-furnished-rooms')).split(',')).toContain('bed2');
  console.log('PASS: stale collaborator edit rejected; original bedroom restored');

  // Conversion and restoration of a formerly restricted room preserve objects.
  await changeUse(b,'kitchen','设为猫房');await cats(a,['kitchen']);await cats(b,['kitchen']);
  expect((await cloudState(a)).placements).toEqual(seed.placements);
  await changeUse(a,'kitchen','恢复原用途');await cats(b,[]);
  for(const plan of plans.slice(1)){
    await b.locator(`.plan-select[data-plan=${plan.id}]`).click();await expect(b.locator('#plan-title')).toHaveText(plan.name);await changeUse(b,'bed2','设为猫房');await expect(a.locator('#scene canvas')).toHaveAttribute('data-plan',plan.id);await cats(a,['bed2']);
    expect(invested(await cloudState(b),plan.id)).toBe(invested(seed,plan.id));
  }
  await a.locator('.plan-select[data-plan=riverside]').click();await expect(b.locator('#plan-title')).toHaveText('Riverside');await cats(a,[]);await expect(a.locator('#scene canvas')).toHaveAttribute('data-placed','2');
  console.log('PASS: all six existing houses retain their construction and room settings');

  await a.locator('#design-open').click();await a.locator('[data-design-template=studio]').click();await a.locator('#design-name').fill('保留进度的猫房');await a.locator('#design-name').press('Tab');await a.locator('#design-save').click();await expect(a.locator('#designer-dialog')).not.toBeVisible();await expect(b.locator('#plan-title')).toHaveText('保留进度的猫房');
  const design=(await cloudState(a)).customPlans[0],bedroom=design.rooms.find(r=>r.type==='bed');
  await changeUse(b,bedroom.id,'设为猫房');await cats(a,[bedroom.id]);
  expect(decodeURIComponent(await a.locator('#floor-image').getAttribute('src'))).toContain('>猫房</text>');
  expect((await cloudState(b)).customPlans[0]).toEqual(design);

  // The server accepts restoration but the first response is lost. Retry must
  // use the same operation ID and must not create a second version or charge.
  let dropped=false;
  await a.route('**/v1/action',async route=>{if(!dropped&&route.request().postDataJSON()?.action?.type==='room-use'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await pick(a,bedroom.id);await a.locator('#room-use').click();await expect(a.locator('#room-use-error')).toContainText('未确认');await expect(a.locator('#room-use')).toHaveText('重试房间设置');await a.locator('#room-use').click();await expect(a.locator('#room-use')).toHaveText('设为猫房');await cats(b,[]);
  expect((await cloudState(a)).roomOverrides.find(v=>v.plan===design.id).version).toBe(2);
  await changeUse(a,bedroom.id,'设为猫房');await cats(b,[bedroom.id]);
  const saved=store.snapshot(aToken).state;expect(saved.events).toEqual(seed.events);expect(saved.placements).toEqual(seed.placements);expect(saved.customPlans).toEqual([design]);expect(balance(saved)).toBe(balance(seed));
  await Promise.all(pages.map(page=>page.reload({waitUntil:'domcontentloaded'})));
  for(const page of pages){await cats(page,[bedroom.id]);expect((await cloudState(page)).events).toEqual(seed.events);expect((await cloudState(page)).placements).toEqual(seed.placements);await expect(page.locator('#balance')).toHaveText(money(balance(seed)));}
  await pick(b,bedroom.id);const dimensions=await b.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);expect(errors).toEqual([]);
  console.log('CAT ROOM CONVERSION PASSED: six existing plans + custom, paired desktop/mobile, default furniture removal, owned placement preservation, stale conflict, dropped response retry, balances and reload.');
}finally{await browser.close();if(vite)await vite.close();await new Promise(resolve=>server.close(resolve));store.close();}
