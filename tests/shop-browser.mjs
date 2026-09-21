import { buildPercent,money,studyCredit,setFocus } from './browser-helpers.mjs';
import { chromium,expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { items } from '../src/items.js';
const url=process.env.TEST_URL||'http://localhost:4178/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('together-home-v1')));
const category=async id=>{await page.locator(`#shop [data-category=${id}]`).click();};
async function open(id){await page.locator('#shop-catalog').click();await category(items.find(i=>i.id===id).category);if(await page.locator(`[data-item="${id}"]`).count()===0)await page.locator('#shop-more').click();await page.locator(`[data-item="${id}"]`).click();await expect(page.locator('#item-preview canvas')).toHaveAttribute('data-item',id);}
async function place(room,slot=0){await page.locator('#placement-room').selectOption(room);await page.locator(`[data-slot="${slot}"]`).click();await page.locator('#place-item').click();await expect(page.locator('#item-dialog')).not.toBeVisible();}
try{
  await mkdir('test-results',{recursive:true});
  await page.route('**/cloud-config.json*',route=>route.fulfill({contentType:'application/json',body:'{"apiUrl":""}'}));
  await page.addInitScript(()=>{if(!localStorage.getItem('together-home-v1'))localStorage.setItem('together-home-v1',JSON.stringify({version:1,selected:'riverside',names:['我','你'],events:[{id:'old-study',type:'study',person:0,minutes:50,note:'旧记录',at:'2026-09-01T12:00:00.000Z'},{id:'old-build',type:'build',plan:'riverside',amount:500,at:'2026-09-01T12:01:00.000Z'}]}));});await page.goto(url,{waitUntil:'domcontentloaded'});await expect(page.locator('.shop-card')).toHaveCount(8);await page.locator('#shop-more').click();await expect(page.locator('.shop-card')).toHaveCount(21);
  await page.locator('#shop-grid img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));console.log('PASS: 21 official LEGO reference images decode');
  await page.locator('#study-open').click();await page.locator('#minutes').fill('480');await setFocus(page,100);await page.locator('#study-form button[type=submit]').click();const credited=studyCredit(await data());await expect(page.locator('#balance')).toHaveText(money(credited-500));
  await open('car-coupe');const before=await page.locator('#item-preview canvas').screenshot();
  const config={paint:'red',wheels:'bronze',cabin:'ivory',roof:'open',trim:'sport'};for(const [key,value] of Object.entries(config))await page.locator(`[data-option=${key}]`).selectOption(value);
  await expect(page.locator('.checkout-total strong')).toHaveText('$3,400');expect(before.equals(await page.locator('#item-preview canvas').screenshot())).toBe(false);
  await page.locator('#item-dialog').screenshot({path:'test-results/shop-car-config.png'});
  await page.locator('#buy-item').click();await expect(page.locator('#place-item')).toBeVisible();await place('garage');await expect(page.locator('#balance')).toHaveText(money(credited-3900));await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','1');
  expect((await data()).events.find(e=>e.type==='purchase').config).toEqual(config);await page.locator('.model-panel').screenshot({path:'test-results/shop-car-garage.png'});
  await open('lego-10182');await page.locator('[data-option=display]').selectOption('lit');await page.locator('#buy-item').click();await place('study',0);await expect(page.locator('#balance')).toHaveText(money(credited-4400));
  await open('box-forest');await expect(page.locator('.variant')).toHaveCount(6);await expect(page.locator('.odds-note')).toContainText('没有隐藏款');await page.locator('#buy-item').click();await expect(page.locator('#item-eyebrow')).toContainText('开到了');const variant=(await data()).events.at(-1).variant;await page.locator('#rotate-item').click();await place('study',1);await expect(page.locator('#balance')).toHaveText(money(credited-4520));
  await open('plush-bear');await page.locator('#buy-item').click();await place('study',12);await expect(page.locator('#balance')).toHaveText(money(credited-4700));
  await open('decor-plant');await page.locator('#buy-item').click();await place('study',13);await expect(page.locator('#balance')).toHaveText(money(credited-4700-items.find(item=>item.id==='decor-plant').price));await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','5');await expect(page.locator('#build-percent')).toHaveText(buildPercent(500));
  await page.locator('.model-panel').screenshot({path:'test-results/shop-decorated-room.png'});
  await page.locator('#undo').click();await expect(page.locator('#toast')).toContainText('购买物品');
  console.log('PASS: purchases, live 3D options, opening, placement, shared funds and undo guard');
  const saved=await data();await page.reload({waitUntil:'domcontentloaded'});expect(await data()).toEqual(saved);expect((await data()).events.find(e=>e.item==='box-forest').variant).toBe(variant);
  await category('lego');await page.locator('#shop-inventory').click();await page.locator('[data-owned]').click();await page.locator('#placement-plan').selectOption('anthem');await page.locator('#placement-room').selectOption('study');await page.locator('#rotate-item').click();await page.locator('#place-item').click();await expect(page.locator('#plan-title')).toHaveText('Anthem');await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','1');
  await page.locator('[data-owned]').click();await page.locator('#store-item').click();await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','0');expect((await data()).events.filter(e=>e.type==='purchase')).toHaveLength(5);
  await page.locator('.plan-select[data-plan=riverside]').click();await expect(page.locator('#build-percent')).toHaveText(buildPercent(500));
  console.log('PASS: reload, collection persistence, relocation between houses and return to inventory');
  // Exercise every procedural model and dispose each temporary WebGL preview.
  for(const item of items){await open(item.id);await expect(page.locator('#item-preview canvas')).toBeVisible();await page.locator('#item-close').click();}
  console.log(`PASS: all ${items.length} product models open and close`);
  await page.setViewportSize({width:390,height:844});await open('car-suv');await page.locator('[data-option=paint]').selectOption('blue');await expect(page.locator('#buy-item')).toBeDisabled();
  const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,dialog:document.querySelector('#item-dialog').scrollWidth,client:document.querySelector('#item-dialog').clientWidth}));expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);expect(overflow.dialog).toBeLessThanOrEqual(overflow.client);
  await page.locator('#item-dialog').screenshot({path:'test-results/shop-mobile-dialog.png'});await page.locator('#item-close').click();await category('lego');await page.locator('#shop').screenshot({path:'test-results/shop-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.locator('#shop').screenshot({path:'test-results/shop-desktop.png'});
  expect(errors).toEqual([]);console.log('SHOP BROWSER PASSED: '+url);
}finally{await browser.close();}
