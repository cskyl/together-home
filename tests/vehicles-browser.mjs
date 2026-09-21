import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {items,quote} from '../src/items.js';
import {freshState,balance} from '../src/state.js';
import {localState,money} from './browser-helpers.mjs';
const url=process.env.TEST_URL||'http://localhost:4178/';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
const civic=items.find(i=>i.id==='vehicle-honda-civic'),porsche=items.find(i=>i.id==='vehicle-porsche-911');
const historical={...freshState(),events:[...Array.from({length:12},(_,i)=>({id:'vehicle-funds-'+i,type:'study',person:0,minutes:480,note:'旧资金',at:'2026-09-19T10:00:00Z'})),{id:'legacy-coupe',type:'purchase',person:1,item:'car-coupe',config:quote('car-coupe',{paint:'red',wheels:'bronze',cabin:'ivory',roof:'open',trim:'sport'},1).config,amount:3400,at:'2026-09-19T11:00:00Z'},{id:'v2-sofa',type:'purchase',person:1,item:'furniture-sofa',config:{},priceVersion:2,amount:240,at:'2026-09-19T12:00:00Z'}]};
try{
  await mkdir('test-results',{recursive:true});await page.route('**/cloud-config.json*',r=>r.fulfill({json:{apiUrl:''}}));
  await page.addInitScript(s=>{if(!localStorage.getItem('together-home-v1'))localStorage.setItem('together-home-v1',JSON.stringify(s));},historical);
  await page.goto(url,{waitUntil:'domcontentloaded'});await expect(page.locator('#balance')).toHaveText(money(balance(historical)));await page.locator('[data-category=cars]').click();await expect(page.locator('[data-item=car-coupe]')).toHaveCount(0);
  await page.locator('[data-item="'+porsche.id+'"]').click();
  const restricted=porsche.optionGroups.wheels.values.find(v=>v.trims?.length===1&&v.trims[0]===porsche.optionGroups.trim.values[0].id),other=porsche.optionGroups.trim.values.find(v=>!restricted.trims.includes(v.id));
  await page.locator('[data-option=wheels]').selectOption(restricted.id);await expect(page.locator('.checkout-total strong')).toHaveText(money(porsche.price+restricted.price));
  await page.locator('[data-option=trim]').selectOption(other.id);await expect(page.locator('[data-option=wheels]')).toHaveValue('standard');await expect(page.locator('[data-option=wheels] option[value="'+restricted.id+'"]')).toHaveCount(0);await expect(page.locator('.checkout-total strong')).toHaveText(money(other.totalPrice));await expect(page.locator('.product-specs')).toContainText(other.name);await expect(page.locator('#buy-item')).toBeDisabled();
  await page.locator('#item-dialog').screenshot({path:'test-results/vehicles-porsche-config-desktop.png'});await page.locator('#item-close').click();
  await page.locator('[data-item="'+civic.id+'"]').click();let config={...quote(civic.id).config};
  for(const key of ['paint','wheels','floor','cargo']){const value=civic.optionGroups[key].values.find(v=>v.price>0&&(!v.trims||v.trims.includes(config.trim)));config[key]=value.id;await page.locator('[data-option='+key+']').selectOption(value.id);}
  const priced=quote(civic.id,config);await expect(page.locator('.checkout-total strong')).toHaveText(money(priced.amount));await expect(page.locator('#item-preview canvas')).toHaveAttribute('data-config',JSON.stringify(config));
  await page.locator('.option-reference summary').first().click();await page.locator('.option-reference[open] img').evaluate(i=>i.decode());await expect(page.locator('.vehicle-price-breakdown')).toContainText('基础车型 MSRP');
  await page.setViewportSize({width:390,height:844});const dimensions=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth,dialog:document.querySelector('#item-dialog').scrollWidth,client:document.querySelector('#item-dialog').clientWidth}));expect(dimensions.page).toBeLessThanOrEqual(dimensions.width);expect(dimensions.dialog).toBeLessThanOrEqual(dimensions.client);
  await page.locator('#item-dialog').screenshot({path:'test-results/vehicles-honda-config-mobile.png'});
  await page.locator('#buy-item').click();await expect(page.locator('#place-item')).toBeVisible();let state=await localState(page);expect(state.events.slice(0,-1)).toEqual(historical.events);expect(state.events.at(-1)).toMatchObject({item:civic.id,config,amount:priced.amount,priceVersion:3});await page.locator('#place-item').click();await expect(page.locator('#item-dialog')).not.toBeVisible();
  await page.locator('#shop-inventory').click();await page.locator('[data-owned=legacy-coupe]').click();await expect(page.locator('#item-description')).toContainText('当时花费 $3,400');await expect(page.locator('#item-preview canvas')).toHaveAttribute('data-config',JSON.stringify(historical.events[12].config));await page.locator('#item-close').click();
  state=await localState(page);await page.reload({waitUntil:'domcontentloaded'});expect(await localState(page)).toEqual(state);await expect(page.locator('#balance')).toHaveText(money(balance(historical)-priced.amount));expect(errors).toEqual([]);console.log('VEHICLES BROWSER PASSED: actual options/trim dependency reset, official photo, USD breakdown, mobile purchase/placement, v1/v2 history and v3 reload; '+url);
}finally{await browser.close();}
