import {chromium,expect as baseExpect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {createStore} from '../backend/store.mjs';
import {createApi} from '../backend/server.mjs';
import {bagItems} from '../src/bag-catalog.js';
import {furniture2026Items} from '../src/furniture-2026.js';
import {getItem} from '../src/items.js';
import {money,cloudState,studyCredit,setFocus} from './browser-helpers.mjs';

const expect=baseExpect.configure({timeout:30000});
const url=process.env.TEST_URL||'http://127.0.0.1:4178/',live=process.env.CATALOG_LIVE_API==='1';
const store=live?null:createStore(':memory:'),server=live?null:createApi(store,{rateLimit:false});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1100}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
const [a,b]=await Promise.all(contexts.map(context=>context.newPage())),errors=[];
for(const page of [a,b]){
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  if(server)await page.route('**/cloud-config.json*',route=>route.fulfill({json:{apiUrl:`http://127.0.0.1:${server.address().port}`}}));
}
async function category(page,id){await page.locator('#shop-catalog').click();await page.locator(`[data-category="${id}"]`).click();}
async function product(page,id){await category(page,getItem(id).category);await page.locator('#item-search').fill(id.startsWith('bag-')?getItem(id).name:getItem(id).reference.name);await page.locator(`[data-item="${id}"]`).click();await expect(page.locator('#item-preview canvas')).toHaveAttribute('data-item',id);}
async function credit(page){await page.locator('#study-open').click();await page.locator('#minutes').fill('480');await setFocus(page,100);await page.locator('#study-form button[type="submit"]').click();await expect(page.locator('#study-dialog')).not.toBeVisible();}
async function place(page,slot){await page.locator('#placement-room').selectOption('living');await page.locator(`#placement-slots button[data-slot="${slot}"]`).click();await page.locator('#place-item').click();await expect(page.locator('#item-dialog')).not.toBeVisible();}
async function noOverflow(page){const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,dialog:[...document.querySelectorAll('dialog[open]')].map(d=>[d.scrollWidth,d.clientWidth])}));expect(widths.page).toBeLessThanOrEqual(widths.viewport);for(const [scroll,width]of widths.dialog)expect(scroll).toBeLessThanOrEqual(width);}

try{
  if(!bagItems.length)throw Error('Handbag catalog is not ready');
  await mkdir('test-results',{recursive:true});
  await a.goto(url,{waitUntil:'domcontentloaded'});await a.locator('#connect-name').fill('商品测试甲');await a.locator('#create-room').click();await expect(a.locator('#cloud-connected')).toBeVisible();await a.locator('#make-invite').click();await expect(a.locator('#invite-output')).toBeVisible();const invite=await a.locator('#invite-link').inputValue();await a.locator('#close-cloud').click();
  await b.goto(invite,{waitUntil:'domcontentloaded'});await b.locator('#connect-name').fill('商品测试乙');await b.locator('#join-room').click();await expect(b.locator('#connected-summary')).toContainText('两个人都加入了');await b.locator('#close-cloud').click();
  // Public integration smoke: room use is shared, reversible and free.
  const roomUseBefore=await Promise.all([a,b].map(async page=>({state:await cloudState(page),balance:await page.locator('#balance').textContent()})));
  const originalRoomName=await a.locator('#room-picker option[value="bed2"]').textContent();
  const assertRoomUsePreserves=async()=>{for(const [index,page]of [a,b].entries()){await expect(page.locator('#balance')).toHaveText(roomUseBefore[index].balance);const current=await cloudState(page);expect(current.events).toEqual(roomUseBefore[index].state.events);expect(current.placements||[]).toEqual(roomUseBefore[index].state.placements||[]);expect(current.selected).toBe(roomUseBefore[index].state.selected);}};
  await a.locator('#room-picker').selectOption('bed2');await expect(a.locator('#room-use')).toHaveText('设为猫房');await a.locator('#room-use').click();
  for(const page of [a,b])await expect(page.locator('#scene canvas')).toHaveAttribute('data-cat-rooms','bed2');
  await b.locator('#room-picker').selectOption('bed2');await expect(b.locator('#room-detail strong')).toHaveText('猫房');await expect(b.locator('#room-use')).toHaveText('恢复原用途');await assertRoomUsePreserves();
  await b.locator('#room-use').click();
  for(const page of [a,b]){await expect(page.locator('#scene canvas')).toHaveAttribute('data-cat-rooms','');await expect(page.locator('#room-picker option[value="bed2"]')).toHaveText(originalRoomName);await expect(page.locator('#room-use')).toHaveText('设为猫房');}
  await assertRoomUsePreserves();console.log('PASS: paired cat-room conversion/restoration preserves both balances, events and placements');
  await category(a,'bags');await expect(a.locator('#bag-filters')).toBeVisible();
  for(const brand of new Set(bagItems.map(item=>item.reference.brand))){
    await a.locator('[data-bag-brand]').filter({hasText:brand==='Louis Vuitton'?'Louis Vuitton':brand}).last().click();
    await expect(a.locator('#shop-grid [data-item]')).toHaveCount(bagItems.filter(item=>item.reference.brand===brand).length);
  }
  await a.locator('[data-bag-brand="all"]').click();await a.locator('#shop-more').click();
  for(const item of bagItems){const image=a.locator(`[data-item="${item.id}"] img`);await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);}
  await a.locator('#shop').screenshot({path:'test-results/october-bags-desktop.png'});
  await Promise.all([credit(a),credit(b)]);await expect.poll(async()=>(await cloudState(a)).events.filter(event=>event.type==='study').length).toBe(2);
  const funds=studyCredit(await cloudState(a)),bag=[...bagItems].sort((x,y)=>x.price-y.price)[0];
  await product(a,bag.id);await expect(a.locator('.checkout-total strong')).toHaveText(money(bag.price));await expect(a.locator('#item-reference details')).toHaveAttribute('open','');await expect(a.locator('.product-source')).toHaveAttribute('href',bag.reference.url);await expect(a.locator('.reference-date')).toContainText('2026-10-04');
  await a.locator('#item-dialog').screenshot({path:'test-results/october-bag-detail.png'});
  let dropped=false;await contexts[0].route('**/v1/action',async route=>{if(!dropped&&route.request().postDataJSON().action?.type==='purchase'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await a.locator('#buy-item').click();await expect(a.locator('#item-error')).toContainText('未确认');await a.locator('#item-close').click();await a.locator('#sync-open').click();await a.locator('#retry-sync').click();await expect.poll(async()=>(await cloudState(a)).events.filter(event=>event.type==='purchase'&&event.item===bag.id).length).toBe(1);await a.locator('#close-cloud').click();await contexts[0].unroute('**/v1/action');
  await category(a,'bags');await a.locator('#item-search').fill('');await a.locator('#shop-inventory').click();const owned=(await cloudState(a)).events.find(event=>event.type==='purchase');await a.locator(`[data-owned="${owned.id}"]`).click();await place(a,0);
  const furniture=furniture2026Items.find(item=>item.category==='furniture'),cat=furniture2026Items.find(item=>item.category==='cats');
  for(const [item,slot]of [[furniture,12],[cat,13]]){await product(b,item.id);await expect(b.locator('.checkout-total strong')).toHaveText(money(item.price));await b.locator('#item-reference summary').click();await expect.poll(()=>b.locator('#item-reference img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);await noOverflow(b);await b.locator('#buy-item').click();await expect(b.locator('#place-item')).toBeVisible();await place(b,slot);}
  const spent=bag.price+furniture.price+cat.price;await expect(a.locator('#balance')).toHaveText(money(funds-spent));await expect(b.locator('#balance')).toHaveText(money(funds-spent));await expect(a.locator('#scene canvas')).toHaveAttribute('data-placed','3');
  await category(b,'bags');await b.locator('#item-search').fill('');await b.locator('#shop-more').click();await noOverflow(b);await b.locator('#shop').screenshot({path:'test-results/october-bags-mobile.png'});
  await b.locator('#ledger-wallet-open').click();await b.locator('#ledger-type').selectOption('purchase');await expect(b.locator('.ledger-entry')).toHaveCount(3);await expect(b.locator('#ledger-expense')).toHaveText(money(spent));await b.locator('#ledger-close').click();
  const saved=await cloudState(a);await Promise.all([a.reload({waitUntil:'domcontentloaded'}),b.reload({waitUntil:'domcontentloaded'})]);await expect(a.locator('#sync-open')).toContainText('已联机');await expect(b.locator('#scene canvas')).toHaveAttribute('data-placed','3');expect((await cloudState(a)).events).toEqual(saved.events);expect((await cloudState(b)).placements).toEqual(saved.placements);expect(errors).toEqual([]);
  console.log(`OCTOBER CATALOG PASSED: paired cat-room conversion/restoration, ${bagItems.length} decoded handbag photos, brands, real prices, ${furniture2026Items.length} new furniture/cat products, paired purchase/placement/ledger, exactly-once lost-response retry, reload and mobile (${live?'public':'isolated'} API).`);
}finally{await browser.close();if(server){await new Promise(resolve=>server.close(resolve));store.close();}}
