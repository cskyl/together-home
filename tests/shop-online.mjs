import { buildPercent,buildSpent,money,studyCredit,setFocus } from './browser-helpers.mjs';
import { chromium,expect } from '@playwright/test';
import { createStore } from '../backend/store.mjs';
import { createApi } from '../backend/server.mjs';
import { items,quote } from '../src/items.js';
import { mkdir } from 'node:fs/promises';
const car=items.find(i=>i.optionGroups&&i.reference.brand==='Toyota'&&/Camry/.test(i.name)),config={...quote(car.id).config,trim:car.optionGroups.trim.values[1].id},carCost=quote(car.id,config).amount;
const url=process.env.TEST_URL||'http://localhost:4178/';
const live=process.env.SHOP_LIVE_API==='1',store=live?null:createStore(),server=live?null:createApi(store,{rateLimit:false});
if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true}),contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1000}}),browser.newContext({viewport:{width:390,height:844}})]),[a,b]=await Promise.all(contexts.map(c=>c.newPage()));
const errors=[];for(const page of [a,b]){page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));if(server)await page.route('**/cloud-config.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({apiUrl:`http://127.0.0.1:${server.address().port}`})}));}
const snapshot=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('together-home-session-v1')).cached);
async function study(page,minutes){await page.locator('#study-open').click();await page.locator('#minutes').fill(String(minutes));await setFocus(page,100);await page.locator('#study-form button[type=submit]').click();await expect(page.locator('#study-dialog')).not.toBeVisible();}
try{
  await a.goto(url);await a.locator('#connect-name').fill('商店测试甲');await a.locator('#create-room').click();await expect(a.locator('#cloud-connected')).toBeVisible();await a.locator('#make-invite').click();await expect(a.locator('#invite-output')).toBeVisible();const invite=await a.locator('#invite-link').inputValue();await a.locator('#close-cloud').click();
  await b.goto(invite);await b.locator('#connect-name').fill('商店测试乙');await b.locator('#join-room').click();await expect(b.locator('#connected-summary')).toContainText('两个人都加入了');await b.locator('#close-cloud').click();
  await study(a,50);await a.locator('#invest').click();await expect(a.locator('#balance')).toHaveText('$0');await expect(b.locator('#balance')).toHaveText('$0');const constructionSpent=buildSpent(await snapshot(a));
  await Promise.all([study(a,480),study(b,100)]);await expect.poll(async()=>(await snapshot(a)).events.filter(e=>e.type==='study').length).toBe(3);while(studyCredit(await snapshot(a))-constructionSpent<carCost+1200)await study(a,480);const studyCount=(await snapshot(a)).events.filter(e=>e.type==='study').length,credited=studyCredit(await snapshot(a));await expect(a.locator('#balance')).toHaveText(money(credited-constructionSpent));await expect(b.locator('#balance')).toHaveText(money(credited-constructionSpent));
  await a.locator('[data-category=cars]').click();await a.locator(`[data-item="${car.id}"]`).click();for(const [k,v]of Object.entries(config))await a.locator(`[data-option=${k}]`).selectOption(v);await a.locator('#buy-item').click();await a.locator('#place-item').click();await expect(a.locator('#item-dialog')).not.toBeVisible();await expect(b.locator('#balance')).toHaveText(money(credited-constructionSpent-carCost-0));
  await b.locator('[data-category=cars]').click();await b.locator('#shop-inventory').click();await expect(b.locator('[data-owned]')).toHaveCount(1);await b.locator('[data-owned]').click();await expect(b.locator('#item-description')).toContainText(car.optionGroups.trim.values[1].name);await b.locator('#rotate-item').click();await b.locator('#place-item').click();await expect.poll(async()=>(await snapshot(a)).placements[0].rotation).toBe(1);
  expect((await snapshot(b)).events.find(e=>e.type==='purchase').config).toEqual(config);
  console.log('PASS: phone receives purchased car and options; rotation syncs back to desktop');
  await a.locator('[data-category=lego]').click();await a.locator('[data-item=lego-10182]').click();await a.locator('[data-option=display]').selectOption('lit');await a.locator('#buy-item').click();await a.locator('#placement-room').selectOption('study');await a.locator('#place-item').click();await expect(b.locator('#balance')).toHaveText(money(credited-constructionSpent-carCost-500));
  let dropped=false;await contexts[0].route('**/v1/action',async route=>{if(!dropped&&route.request().postDataJSON()?.action?.type==='purchase'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await a.locator('[data-category=blind]').click();await a.locator('[data-item=box-forest]').click();await a.locator('#buy-item').click();await expect(a.locator('#item-error')).toContainText('未确认');
  await expect(b.locator('#balance')).toHaveText(money(credited-constructionSpent-carCost-620));const first=(await snapshot(b)).events.find(e=>e.item==='box-forest');expect(first.variant).toMatch(/^[0-5]$/);
  await a.locator('#item-close').click();await a.locator('#sync-open').click();await a.locator('#retry-sync').click();await expect(a.locator('#balance')).toHaveText(money(credited-constructionSpent-carCost-620));await a.locator('#close-cloud').click();
  await expect.poll(async()=>(await snapshot(a)).events.filter(e=>e.item==='box-forest').length).toBe(1);expect((await snapshot(a)).events.find(e=>e.item==='box-forest')).toEqual(first);
  await a.locator('#shop-inventory').click();await a.locator('[data-owned]').click();await a.locator('#placement-room').selectOption('study');await expect(a.locator('[data-slot="0"]')).toBeDisabled();await a.locator('[data-slot="1"]').click();await a.locator('#place-item').click();await expect.poll(async()=>(await snapshot(b)).placements.length).toBe(3);
  console.log('PASS: lost blind-box response retries with one charge and the same saved result; occupied slots cannot be reused');
  await b.reload();await expect(b.locator('#sync-open')).toContainText('已联机');await expect(b.locator('#owned-count')).toHaveText('3');await expect(b.locator('#build-percent')).toHaveText(buildPercent(constructionSpent));await expect(b.locator('#scene canvas')).toHaveAttribute('data-placed','3');
  const final=await snapshot(b);expect(final.events.filter(e=>e.type==='study')).toHaveLength(studyCount);expect(final.events.filter(e=>e.type==='build')[0].amount).toBe(constructionSpent);expect(final.events.find(e=>e.item==='box-forest')).toEqual(first);
  await mkdir('test-results',{recursive:true});await b.locator('#shop').screenshot({path:'test-results/shop-online-mobile.png'});expect(errors).toEqual([]);
  console.log(`SHOP ONLINE PASSED (${live?'public API':'isolated API'}): `+url);
}finally{await browser.close();if(server){await new Promise(r=>server.close(r));store.close();}}
