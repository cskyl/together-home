import {chromium,expect as baseExpect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {createStore} from '../backend/store.mjs';
import {createApi} from '../backend/server.mjs';
import {items,getItem,furnitureGroups,quote,optionGroups} from '../src/items.js';
import {freshState} from '../src/state.js';
import {money,localState,cloudState,studyCredit,setFocus} from './browser-helpers.mjs';

const expect=baseExpect.configure({timeout:25000});
const url=process.env.TEST_URL||'http://localhost:4178/',live=process.env.PRODUCT_LIVE_API==='1';
const store=live?null:createStore(),server=live?null:createApi(store,{rateLimit:false});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
function watch(page){page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));}
async function category(page,id){await page.locator('#shop-catalog').click();await page.locator(`[data-category=${id}]`).click();}
async function clearFilters(page){await page.locator('#item-search').fill('');await page.locator('#shop-budget').fill('');await page.locator('#shop-sort').selectOption('catalog');await page.locator('[data-furniture-group=all]').click();}
async function openProduct(page,id){await category(page,getItem(id).category);if(await page.locator(`[data-item="${id}"]`).count()===0)await page.locator('#shop-more').click();await page.locator(`[data-item="${id}"]`).click();await expect(page.locator('#item-preview canvas')).toHaveAttribute('data-item',id);await expect(page.locator('.checkout-total strong')).toHaveText(money(getItem(id).price));}
async function study(page){await page.locator('#study-open').click();await page.locator('#minutes').fill('100');await setFocus(page,100);await page.locator('#study-form button[type=submit]').click();await expect(page.locator('#study-dialog')).not.toBeVisible();}
async function noOverflow(page){const sizes=await page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>({client:d.clientWidth,scroll:d.scrollWidth}))}));expect(sizes.page).toBeLessThanOrEqual(sizes.width);for(const d of sizes.dialogs)expect(d.scroll).toBeLessThanOrEqual(d.client);}
const visibleIds=page=>page.locator('#shop-grid [data-item]').evaluateAll(nodes=>nodes.map(node=>node.dataset.item));
try{
  await mkdir('test-results',{recursive:true});
  const local=await browser.newPage({viewport:{width:1440,height:1050}});watch(local);
  await local.route('**/cloud-config.json*',route=>route.fulfill({json:{apiUrl:''}}));
  const legacy={...freshState(),events:[
    {id:'old-study-products',type:'study',person:0,minutes:300,note:'更新前的学习',at:'2026-09-19T12:00:00Z'},
    {id:'old-tree-products',type:'purchase',person:1,item:'cat-tree',config:{},amount:650,at:'2026-09-19T12:01:00Z'},
    {id:'v2-desk-products',type:'purchase',person:0,item:'furniture-standingdesk',config:{},amount:150,priceVersion:2,at:'2026-09-19T12:02:00Z'}
  ]};
  await local.addInitScript(state=>{if(!localStorage.getItem('together-home-v1'))localStorage.setItem('together-home-v1',JSON.stringify(state));},legacy);
  await local.goto(url,{waitUntil:'domcontentloaded'});await expect(local.locator('#balance')).toHaveText('$2,200');
  let decoded=0;
  for(const id of ['furniture','cars','cats','decor']){
    await category(local,id);if(await local.locator('#shop-more').isVisible())await local.locator('#shop-more').click();
    const expected=items.filter(item=>item.category===id&&!item.archived);
    await expect(local.locator('#shop-grid [data-reference-photo]')).toHaveCount(expected.length);
    const images=await local.locator('#shop-grid [data-reference-photo]').evaluateAll(async nodes=>{for(const image of nodes)image.loading='eager';return await Promise.all(nodes.map(async image=>{await image.decode();const imageBox=image.getBoundingClientRect(),artBox=image.closest('.item-art').getBoundingClientRect();return {id:image.dataset.referencePhoto,width:image.naturalWidth,height:image.naturalHeight,box:{width:imageBox.width,height:imageBox.height,parentWidth:artBox.width,parentHeight:artBox.height}};}));});
    expect(images.every(image=>image.width>=250&&image.height>=150)).toBe(true);for(const image of images){expect(image.box.width,image.id+' fits card width').toBeLessThanOrEqual(image.box.parentWidth+1);expect(image.box.height,image.id+' fits card height').toBeLessThanOrEqual(image.box.parentHeight+1);}decoded+=images.length;
  }
  expect(decoded).toBe(86);
  await category(local,'furniture');await expect(local.locator('[data-furniture-group]')).toHaveCount(9);
  for(const [group] of furnitureGroups.filter(([id])=>id!=='all')){
    await local.locator(`[data-furniture-group=${group}]`).click();
    const expected=items.filter(item=>item.category==='furniture'&&item.roomGroup===group).map(item=>item.id);
    expect(expected.length).toBeGreaterThan(0);expect(await visibleIds(local)).toEqual(expected.slice(0,8));
  }
  await local.locator('[data-furniture-group=all]').click();await local.locator('#shop-budget').fill('55');
  const affordable=items.filter(item=>item.category==='furniture'&&item.price<=55);
  await local.locator('#shop-sort').selectOption('price-asc');expect(await visibleIds(local)).toEqual([...affordable].sort((a,b)=>a.price-b.price).map(item=>item.id));
  await local.locator('#shop-sort').selectOption('price-desc');expect(await visibleIds(local)).toEqual([...affordable].sort((a,b)=>b.price-a.price).map(item=>item.id));
  await local.locator('#shop-budget').fill('0');await expect(local.locator('.shop-card')).toHaveCount(0);await expect(local.locator('.shop-empty')).toBeVisible();
  await clearFilters(local);await local.locator('#item-search').fill('IKEA');await expect(local.locator('.shop-card')).toHaveCount(items.filter(item=>item.category==='furniture'&&item.reference.brand==='IKEA').length);
  const desk=getItem('furniture-standingdesk');await local.locator('#item-search').fill(desk.reference.name.split(' ')[0]);expect(await visibleIds(local)).toContain(desk.id);
  await clearFilters(local);await openProduct(local,desk.id);
  await expect(local.locator('.product-reference h3')).toHaveText(desk.reference.name);
  await expect(local.locator('.product-specs dt')).toHaveCount(desk.reference.specs.length);
  await expect(local.locator('.product-source')).toHaveAttribute('href',desk.reference.url);
  await expect(local.locator('.product-source')).toHaveAttribute('rel','noopener noreferrer');
  await expect(local.locator('.retail-price')).toContainText('官网参考价');
  await expect(local.locator('.retail-price strong')).toHaveText(new Intl.NumberFormat('zh-CN',{style:'currency',currency:'USD'}).format(desk.reference.retailPrice.amount));
  await expect(local.locator('.checkout-total')).toContainText('游戏资金');await expect(local.locator('.checkout-total strong')).toHaveText(money(desk.price));
  await local.locator('#item-reference summary').click();await local.locator('#item-reference img').evaluate(image=>image.decode());
  await local.locator('#item-dialog').screenshot({path:'test-results/products-standingdesk-desktop.png'});
  await local.locator('#buy-item').click();await expect(local.locator('#place-item')).toBeVisible();
  const next=await localState(local),purchased=next.events.at(-1);expect(purchased).toMatchObject({item:desk.id,amount:desk.price,priceVersion:3});expect(next.events.slice(0,-1)).toEqual(legacy.events);
  await local.locator('#item-close').click();await expect(local.locator('#balance')).toHaveText(money(2200-desk.price));
  await local.locator('#ledger-wallet-open').click();await local.locator('#ledger-type').selectOption('purchase');
  await expect(local.locator('[data-event-id=old-tree-products] .ledger-amount')).toHaveText('− $650');
  await expect(local.locator(`[data-event-id="${purchased.id}"] .ledger-amount`)).toHaveText('− '+money(desk.price));await expect(local.locator('#ledger-expense')).toHaveText(money(800+desk.price));await local.locator('#ledger-close').click();
  await category(local,'cats');await local.locator('#shop-inventory').click();await local.locator('[data-owned=old-tree-products]').click();await expect(local.locator('#item-description')).toContainText('当时花费 $650');await local.locator('#item-close').click();
  await local.reload({waitUntil:'domcontentloaded'});expect((await localState(local)).events).toEqual(next.events);
  const car=items.find(item=>item.category==='cars'&&!item.archived&&item.optionGroups?.trim?.values.length>1);expect(car).toBeTruthy();await openProduct(local,car.id);await expect(local.locator('.product-reference')).toContainText(car.reference.brand);await expect(local.locator('.vehicle-price-breakdown')).toContainText('基础车型 MSRP');
  const trim=optionGroups(car).trim.values[1];await local.locator('[data-option=trim]').selectOption(trim.id);const chosenConfig=await local.locator('[data-option]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.option,node.value]))),configured=quote(car.id,chosenConfig);await expect(local.locator('.checkout-total strong')).toHaveText(money(configured.amount));await expect(local.locator('.product-reference h3')).toContainText(trim.name);await expect(local.locator('.retail-price strong')).toHaveText(new Intl.NumberFormat('zh-CN',{style:'currency',currency:'USD'}).format(trim.totalPrice??car.price+trim.price));
  await local.setViewportSize({width:390,height:844});if(!await local.locator('#item-reference details').evaluate(node=>node.open))await local.locator('#item-reference summary').click();await local.locator('#item-reference img').evaluate(image=>image.decode());await noOverflow(local);await local.locator('#item-dialog').screenshot({path:'test-results/products-car-mobile.png'});await local.locator('#item-close').click();
  await category(local,'furniture');await local.locator('[data-furniture-group=kitchen]').click();await noOverflow(local);await local.locator('#shop').screenshot({path:'test-results/products-filters-mobile.png'});await local.close();
  console.log('PASS: 86 official images decode; eight room filters, game budget/sort, brand/model search, real specs and MSRP; v1/v2/v3 purchases coexist after reload.');

  const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1050}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
  const [a,b]=await Promise.all(contexts.map(context=>context.newPage()));for(const page of [a,b]){watch(page);if(server)await page.route('**/cloud-config.json*',route=>route.fulfill({json:{apiUrl:`http://127.0.0.1:${server.address().port}`}}));}
  await a.goto(url,{waitUntil:'domcontentloaded'});await a.locator('#connect-name').fill('实物测试甲');await a.locator('#create-room').click();await expect(a.locator('#cloud-connected')).toBeVisible();await a.locator('#make-invite').click();await expect(a.locator('#invite-output')).toBeVisible();const invite=await a.locator('#invite-link').inputValue();await a.locator('#close-cloud').click();
  await b.goto(invite,{waitUntil:'domcontentloaded'});await b.locator('#connect-name').fill('实物测试乙');await b.locator('#join-room').click();await expect(b.locator('#connected-summary')).toContainText('两个人都加入了');await b.locator('#close-cloud').click();
  await a.locator('#design-open').click();await a.locator('[data-design-template=cozy]').click();await a.locator('#design-name').fill('实物家具测试屋');await a.locator('#design-name').press('Tab');await a.locator('#design-save').click();await expect(a.locator('#designer-dialog')).not.toBeVisible();await expect(b.locator('#plan-title')).toHaveText('实物家具测试屋');
  const design=(await cloudState(a)).customPlans[0],room=design.rooms.find(room=>room.type==='study');expect(room).toBeTruthy();await study(a);await expect(b.locator('#balance')).toHaveText(money(studyCredit(await cloudState(a))));
  await openProduct(a,desk.id);await a.locator('#buy-item').click();await expect(a.locator('#place-item')).toBeVisible();const owned=(await cloudState(a)).events.at(-1);expect(owned).toMatchObject({item:desk.id,amount:desk.price,priceVersion:3,person:0});
  await a.locator('#placement-room').selectOption(room.id);await a.locator('#free-position-u').fill('35');await a.locator('#free-position-v').fill('55');await a.locator('#place-item').click();await expect(a.locator('#item-dialog')).not.toBeVisible();await expect(b.locator('#owned-count')).toHaveText('1');await expect(b.locator('#scene canvas')).toHaveAttribute('data-placed','1');
  await category(b,'furniture');await b.locator('#shop-inventory').click();await b.locator(`[data-owned="${owned.id}"]`).click();await expect(b.locator('#item-description')).toContainText('当时花费 '+money(desk.price));await b.locator('#free-position-u').fill('65');await b.locator('#free-position-v').fill('45');await b.locator('#rotate-item').click();await noOverflow(b);await b.locator('#item-dialog').screenshot({path:'test-results/products-shared-placement-mobile.png'});await b.locator('#place-item').click();await expect(b.locator('#item-dialog')).not.toBeVisible();
  await expect.poll(async()=>(await cloudState(a)).placements[0]).toMatchObject({id:owned.id,plan:design.id,room:room.id,u:65,v:45,rotation:1});
  const saved=await cloudState(a);await a.locator('#reset-view').click();await a.locator('.model-panel').screenshot({path:'test-results/products-room-3d.png'});
  await Promise.all([a.reload({waitUntil:'domcontentloaded'}),b.reload({waitUntil:'domcontentloaded'})]);
  for(const page of [a,b]){await expect(page.locator('#sync-open')).toContainText('已联机');await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','1');expect((await cloudState(page)).events).toEqual(saved.events);expect((await cloudState(page)).placements).toEqual(saved.placements);await expect(page.locator('#balance')).toHaveText(money(studyCredit(saved)-desk.price));}
  await b.locator('#ledger-wallet-open').click();await b.locator('#ledger-type').selectOption('purchase');await expect(b.locator('.ledger-entry')).toHaveCount(1);await expect(b.locator('.ledger-amount')).toHaveText('− '+money(desk.price));await noOverflow(b);
  expect(errors).toEqual([]);console.log(`REAL PRODUCTS BROWSER PASSED (${live?'public API':'isolated API'}): server v3 pricing, partner position/rotation, ledger and reload; ${url}`);
}finally{await browser.close();if(server){await new Promise(resolve=>server.close(resolve));store.close();}}
