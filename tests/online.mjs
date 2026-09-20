import { chromium,expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const url=process.env.TEST_URL||'http://localhost:4178/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const aContext=await browser.newContext({viewport:{width:1440,height:1000}}),bContext=await browser.newContext({viewport:{width:390,height:844}}),cContext=await browser.newContext();
const a=await aContext.newPage(),b=await bContext.newPage(),c=await cContext.newPage();
for(const page of [a,b,c])page.setDefaultTimeout(20000);
const errors=[];for(const page of [a,b,c])page.on('pageerror',e=>errors.push(e.message));
async function study(page,minutes,note){await page.locator('#study-open').click();await page.locator('#minutes').fill(String(minutes));await page.locator('#study-note').fill(note);await page.locator('#study-form button[type=submit]').click();await expect(page.locator('#study-dialog')).not.toBeVisible();}
try{
  await a.goto(url);await expect(a.locator('#cloud-dialog')).toBeVisible();await a.locator('#connect-name').fill('联机测试甲');await a.locator('#create-room').click();await expect(a.locator('#cloud-connected')).toBeVisible();await a.locator('#make-invite').click();await expect(a.locator('#invite-output')).toBeVisible();const invite=await a.locator('#invite-link').inputValue();await a.locator('#close-cloud').click();
  await b.goto(invite);await b.locator('#connect-name').fill('联机测试乙');await b.locator('#join-room').click();await expect(b.locator('#connected-summary')).toContainText('两个人都加入了');await b.locator('#close-cloud').click();await expect(a.locator('#together-names')).toContainText('联机测试乙',{timeout:25000});
  console.log('PASS: two independent browser identities joined via a single-use invite');
  await Promise.all([study(a,25,'并发学习甲'),study(b,50,'并发学习乙')]);
  await expect(a.locator('#balance')).toHaveText('$750',{timeout:25000});await expect(b.locator('#balance')).toHaveText('$750',{timeout:25000});
  await Promise.all([a.locator('#invest').click(),b.locator('#invest').click()]);await expect(a.locator('#balance')).toHaveText('$0',{timeout:25000});await expect(b.locator('#balance')).toHaveText('$0',{timeout:25000});await expect(a.locator('#build-percent')).toHaveText('14%');await expect(b.locator('#build-percent')).toHaveText('14%');
  console.log('PASS: concurrent study and construction share one consistent wallet');
  await a.locator('.plan-select[data-plan=anthem]').click();await expect(b.locator('#plan-title')).toHaveText('Anthem',{timeout:25000});await b.reload();await expect(b.locator('#sync-open')).toContainText('已联机',{timeout:25000});await expect(b.locator('#plan-title')).toHaveText('Anthem');await expect(b.locator('#cloud-dialog')).not.toBeVisible();
  await b.locator('#study-open').click();await expect(b.locator('[data-person="0"]')).toBeDisabled();await b.locator('#study-dialog .close-dialog').click();
  await a.locator('#undo').click();await expect(a.locator('#toast')).toContainText('已投入');
  console.log('PASS: shared selection, refresh persistence, identity restrictions and undo guards');
  await c.goto(invite);await c.locator('#connect-name').fill('不能加入的第三人');await c.locator('#join-room').click();await expect(c.locator('#cloud-error')).toContainText('邀请已使用');
  const ownerRecovery=await a.evaluate(()=>JSON.parse(localStorage.getItem('together-home-session-v1')).token);
  await c.locator('.restore-details summary').click();await c.locator('#recovery-input').fill('TH1-'+ownerRecovery);await c.locator('#restore-form button').click();await expect(c.locator('#connected-summary')).toContainText('两个人都加入了');await c.locator('#close-cloud').click();await expect(c.locator('#sync-open')).toContainText('联机测试甲');
  console.log('PASS: a third member is rejected; the original member can recover on a new device');
  let dropped=false;await aContext.route('**/v1/action',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await a.locator('#study-open').click();await a.locator('#minutes').fill('25');await a.locator('#study-note').fill('响应丢失后安全重试');await a.locator('#study-form button[type=submit]').click();await expect(a.locator('#toast')).toContainText('未确认');await a.locator('#study-dialog .close-dialog').click();await a.locator('#sync-open').click();await a.locator('#retry-sync').click();await expect(a.locator('#balance')).toHaveText('$250',{timeout:25000});await expect(b.locator('#balance')).toHaveText('$250',{timeout:25000});await a.locator('#close-cloud').click();await expect(a.locator('.journal-entry').filter({hasText:'响应丢失后安全重试'})).toHaveCount(1);
  await b.locator('#invest').click();await expect(a.locator('#balance')).toHaveText('$0',{timeout:25000});await expect(b.locator('#build-percent')).toHaveText('5%');
  await a.locator('.plan-select[data-plan=riverside]').click();await expect(b.locator('#plan-title')).toHaveText('Riverside',{timeout:25000});await expect(b.locator('#build-percent')).toHaveText('14%');
  console.log('PASS: new Anthem construction syncs while prior Riverside progress remains intact');
  const width=await b.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));expect(width.scroll).toBeLessThanOrEqual(width.width);expect(errors).toEqual([]);
  await mkdir('test-results',{recursive:true});await a.screenshot({path:'test-results/online-desktop.png',fullPage:true});await b.screenshot({path:'test-results/online-mobile.png',fullPage:true});
  console.log('PASS: a committed operation with a lost response retries exactly once; mobile layout and browser errors checked');
  console.log('ONLINE E2E PASSED: '+url);
}finally{await browser.close();}
