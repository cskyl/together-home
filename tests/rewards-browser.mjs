import { chromium,expect as playwrightExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createStore } from '../backend/store.mjs';
import { createApi } from '../backend/server.mjs';
import { money,localState,cloudState,setFocus } from './browser-helpers.mjs';

const url=process.env.TEST_URL||'http://localhost:4178/';
const live=process.env.REWARDS_LIVE_API==='1',store=live?null:createStore(),server=live?null:createApi(store,{rateLimit:false});
const expect=playwrightExpect.configure({timeout:live?30000:10000});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const local=await browser.newPage({viewport:{width:1440,height:1100}});
const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:1100}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
const [a,b]=await Promise.all(contexts.map(context=>context.newPage()));
const errors=[];
for(const page of [local,a,b]){page.setDefaultTimeout(live?30000:20000);page.on('pageerror',error=>errors.push(error.message));}
if(server)for(const page of [a,b])await page.route('**/cloud-config.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({apiUrl:`http://127.0.0.1:${server.address().port}`})}));
const initial={version:1,selected:'riverside',names:['原来的我','原来的你'],events:[{id:randomUUID(),type:'study',person:0,minutes:100,note:'旧记录',at:'2026-09-01T12:00:00.000Z'},{id:randomUUID(),type:'build',plan:'riverside',amount:500,at:'2026-09-01T12:01:00.000Z'}]};
async function submit(page,minutes,focus,note){await page.locator('#study-open').click();await page.locator('#minutes').fill(String(minutes));await setFocus(page,focus);await page.locator('#study-note').fill(note);await page.locator('#study-form button[type=submit]').click();await expect(page.locator('#study-dialog')).not.toBeVisible();}
function checkReward(event){expect(event.rewardVersion).toBe(1);expect(event.efficiency).toBeGreaterThanOrEqual(8000+30*event.focus);expect(event.efficiency).toBeLessThanOrEqual(9000+30*event.focus);expect(event.reward).toBe(Math.round(event.minutes*10*event.efficiency/10000));}
try{
  await mkdir('test-results',{recursive:true});
  await local.route('**/cloud-config.json*',route=>route.fulfill({contentType:'application/json',body:'{"apiUrl":""}'}));
  await local.addInitScript(state=>{if(!localStorage.getItem('together-home-v1'))localStorage.setItem('together-home-v1',JSON.stringify(state));},initial);
  await local.goto(url,{waitUntil:'domcontentloaded'});await expect(local.locator('#balance')).toHaveText('$500');await expect(local.locator('#build-percent')).toHaveText('9%');expect(await localState(local)).toEqual(initial);
  await local.locator('#study-open').click();await expect(local.locator('#study-focus')).toHaveValue('50');await expect(local.locator('#reward-amount')).toContainText('$238');await expect(local.locator('#reward-amount')).toContainText('$263');
  await setFocus(local,0);await expect(local.locator('#reward-amount')).toContainText('$200');await expect(local.locator('#reward-amount')).toContainText('$225');
  await setFocus(local,100);await expect(local.locator('#reward-amount')).toContainText('$275');await expect(local.locator('#reward-amount')).toContainText('$300');
  await local.locator('#study-focus').press('ArrowLeft');await expect(local.locator('#study-focus')).toHaveValue('99');await expect(local.locator('#reward-amount')).toContainText('$274');await expect(local.locator('#reward-amount')).toContainText('$299');
  await local.locator('#minutes').fill('50');await expect(local.locator('#reward-amount')).toContainText('$549');await expect(local.locator('#reward-amount')).toContainText('$599');
  await local.locator('#minutes').fill('25');await setFocus(local,0);await local.locator('#study-note').fill('低投入也记一下');await local.locator('#study-dialog').screenshot({path:'test-results/reward-desktop-slider.png'});await local.locator('#study-form button[type=submit]').click();await expect(local.locator('#study-dialog')).not.toBeVisible();
  const saved=await localState(local),reward=saved.events.at(-1);checkReward(reward);expect(reward.focus).toBe(0);await expect(local.locator('#balance')).toHaveText(money(500+reward.reward));await expect(local.locator('.journal-entry').first()).toContainText(money(reward.reward));await expect(local.locator('.journal-entry').first().locator('.study-details')).toContainText('%');expect(saved.events.slice(0,2)).toEqual(initial.events);
  await local.reload({waitUntil:'domcontentloaded'});expect(await localState(local)).toEqual(saved);await expect(local.locator('#balance')).toHaveText(money(500+reward.reward));await local.locator('#undo').click();await expect(local.locator('#balance')).toHaveText('$500');expect(await localState(local)).toEqual(initial);await expect(local.locator('#build-percent')).toHaveText('9%');
  console.log('PASS: keyboard slider, live range, recorded credit, reload, actual-amount undo and unmodified legacy progress');

  await a.goto(url,{waitUntil:'domcontentloaded'});await a.locator('#connect-name').fill('投入测试甲');await a.locator('#create-room').click();await expect(a.locator('#cloud-connected')).toBeVisible();await a.locator('#make-invite').click();await expect(a.locator('#invite-output')).toBeVisible();const invite=await a.locator('#invite-link').inputValue();await a.locator('#close-cloud').click();
  await b.goto(invite,{waitUntil:'domcontentloaded'});await b.locator('#connect-name').fill('投入测试乙');await b.locator('#join-room').click();await expect(b.locator('#connected-summary')).toContainText('两个人都加入了');await b.locator('#close-cloud').click();
  await b.locator('#study-open').tap();const slider=await b.locator('#study-focus').boundingBox();await b.touchscreen.tap(slider.x+slider.width*.25,slider.y+slider.height/2);const touched=Number(await b.locator('#study-focus').inputValue());expect(touched).toBeGreaterThanOrEqual(15);expect(touched).toBeLessThanOrEqual(35);await b.locator('#study-dialog').screenshot({path:'test-results/reward-mobile-slider.png'});
  const overflow=await b.locator('#study-dialog').evaluate(dialog=>({scroll:dialog.scrollWidth,client:dialog.clientWidth}));expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);await b.locator('#study-dialog .close-dialog').tap();
  await Promise.all([submit(a,25,0,'这次有点分心'),submit(b,25,100,'这次很投入')]);
  await expect.poll(async()=>(await cloudState(a)).events.filter(event=>event.type==='study').length).toBe(2);await expect.poll(async()=>(await cloudState(b)).events.filter(event=>event.type==='study').length).toBe(2);
  const paired=await cloudState(a);expect(await cloudState(b)).toEqual(paired);paired.events.forEach(checkReward);const low=paired.events.find(event=>event.focus===0),high=paired.events.find(event=>event.focus===100),total=low.reward+high.reward;expect(high.reward).toBeGreaterThan(low.reward);await expect(a.locator('#balance')).toHaveText(money(total));await expect(b.locator('#balance')).toHaveText(money(total));
  await b.reload({waitUntil:'domcontentloaded'});await expect(b.locator('#sync-open')).toContainText('已联机');expect(await cloudState(b)).toEqual(paired);await b.locator('#undo').click();await expect(a.locator('#balance')).toHaveText(money(low.reward));await expect(b.locator('#balance')).toHaveText(money(low.reward));
  console.log('PASS: touch slider, independent focus choices, identical shared rewards, reload and shared actual-amount undo');

  let dropped=false,committed;
  await contexts[0].route('**/v1/action',async route=>{if(!dropped&&route.request().postDataJSON()?.action?.type==='study'){dropped=true;const response=await route.fetch();committed=(await response.json()).state.events.at(-1);await route.abort('failed');}else await route.continue();});
  await a.locator('#study-open').click();await a.locator('#minutes').fill('50');await setFocus(a,75);await a.locator('#study-note').fill('网络重试不重抽');await a.locator('#study-form button[type=submit]').click();await expect(a.locator('#toast')).toContainText('未确认');checkReward(committed);
  await expect(a.locator('#study-focus')).toBeDisabled();await expect(a.locator('#minutes')).toBeDisabled();await expect(b.locator('#balance')).toHaveText(money(low.reward+committed.reward));expect((await cloudState(b)).events.at(-1)).toEqual(committed);
  await a.locator('#study-dialog .close-dialog').click();await a.reload({waitUntil:'domcontentloaded'});await expect(a.locator('#sync-open')).toContainText('已联机');await a.locator('#study-open').click();await expect(a.locator('#study-focus')).toHaveValue('75');await expect(a.locator('#study-focus')).toBeDisabled();await expect(a.locator('#minutes')).toHaveValue('50');await a.locator('#study-form button[type=submit]').click();await expect(a.locator('#study-dialog')).not.toBeVisible();
  await expect(a.locator('#balance')).toHaveText(money(low.reward+committed.reward));const retried=await cloudState(a);expect(retried.events.filter(event=>event.note==='网络重试不重抽')).toEqual([committed]);expect((await a.evaluate(()=>JSON.parse(localStorage.getItem('together-home-session-v1')))).pending).toBeNull();await expect(a.locator('.journal-entry').first()).toContainText(money(committed.reward));
  await a.locator('#undo').click();await expect(b.locator('#balance')).toHaveText(money(low.reward));await expect(a.locator('#balance')).toHaveText(money(low.reward));expect(errors).toEqual([]);
  console.log('PASS: lost response and reload keep the pending focus and one immutable random draw; retry credits once and undo removes exactly that reward');
  console.log(`REWARDS BROWSER PASSED (local saves + ${live?'public':'isolated'} paired API): `+url);
}finally{await browser.close();if(server){await new Promise(resolve=>server.close(resolve));store.close();}}
