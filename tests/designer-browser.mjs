import { money,studyCredit,setFocus } from './browser-helpers.mjs';
import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const url=process.env.TEST_URL||'http://localhost:4178/';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const draft=()=>page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.startsWith('together-home-design-draft:'))?.[1]||'null')?.draft);
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('together-home-v1')));
async function point(x,z){return page.locator('#design-board').evaluate((el,p)=>{const r=new DOMPoint(p[0],p[1]).matrixTransform(el.getScreenCTM());return {x:r.x,y:r.y};},[x,z]);}
async function drag(from,to){const a=await point(...from),b=await point(...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();}
async function clickAt(x,z){const p=await point(x,z);await page.mouse.click(p.x,p.y);}
async function study(minutes){await page.locator('#study-open').click();await page.locator('#minutes').fill(String(minutes));await setFocus(page,100);await page.locator('#study-form button[type=submit]').click();await expect(page.locator('#study-dialog')).not.toBeVisible();}
try{
  await mkdir('test-results',{recursive:true});await page.route('**/cloud-config.json*',r=>r.fulfill({contentType:'application/json',body:'{"apiUrl":""}'}));await page.goto(url);
  await study(100);await page.locator('#invest').click();await expect(page.locator('#balance')).toHaveText(money(studyCredit(await state())-500));
  await page.locator('#design-open').click();await expect(page.locator('#designer-dialog')).toBeVisible();await expect(page.locator('#design-save')).toBeDisabled();
  await page.locator('[data-design-tool=draw]').click();await drag([4,4],[12,12]);await expect(page.locator('[data-design-room]')).toHaveCount(1);
  await drag([12,4],[20,12]);await expect(page.locator('[data-design-room]')).toHaveCount(2);
  const ids=(await draft()).rooms.map(r=>r.id);await page.locator('[data-design-tool=select]').click();await drag([16,8],[16,18]);expect((await draft()).rooms[1].z).toBe(14);await drag([16,18],[16,8]);expect((await draft()).rooms[1].z).toBe(4);
  await drag([20,12],[22,14]);expect((await draft()).rooms[1].w).toBe(10);expect((await draft()).rooms[1].d).toBe(10);
  await page.locator('#design-room-name').fill('游戏书房');await page.locator('#design-room-name').press('Tab');await page.locator('#design-edit-type').selectOption('study');await page.locator('#design-floor').selectOption('walnut');await page.locator('#design-paint').selectOption('clay');await page.locator('#design-furnished').uncheck();
  await page.locator('#room-x').fill('2');await page.locator('#room-x').press('Tab');await expect(page.locator('#design-message')).toContainText('重叠');expect((await draft()).rooms[1].x).toBe(12);
  await page.locator('#design-undo').click();expect((await draft()).rooms[1].furnished).toBe(true);await page.locator('#design-redo').click();expect((await draft()).rooms[1].furnished).toBe(false);
  await page.locator('[data-design-tool=window]').click();await clickAt(8,4);expect((await draft()).openings).toHaveLength(1);
  await page.locator('[data-design-tool=door]').click();await clickAt(8,4);await expect(page.locator('#design-message')).toContainText('重叠');await clickAt(12,8);expect((await draft()).openings).toHaveLength(2);
  await page.locator('[data-design-tool=opening]').click();await clickAt(17,4);expect((await draft()).openings).toHaveLength(3);
  await page.locator('#design-name').fill('自己画的小屋');await page.locator('#design-name').press('Tab');
  await page.locator('#design-zoom-in').click();await page.locator('[data-design-tool=pan]').click();await drag([8,8],[8,3]);expect(await page.locator('#design-board-wrap').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);await page.locator('#design-zoom-reset').click();
  await page.locator('#designer-dialog').screenshot({path:'test-results/designer-plan.png'});
  await page.locator('[data-design-view="3d"]').click();await expect(page.locator('#design-preview canvas')).toHaveAttribute('data-plan',/^custom-/);await page.locator('#design-preview .room-label').filter({hasText:'游戏书房'}).click();await expect(page.locator('#design-preview .room-label.selected')).toHaveText('游戏书房');await expect(page.locator('#design-room-name')).toHaveValue('游戏书房');await page.locator('#design-preview').screenshot({path:'test-results/designer-preview.png'});await page.locator('#design-roof').check();await page.locator('#design-roof').uncheck();
  const pending=await draft();await page.locator('#design-close').click();await expect(page.locator('#design-preview canvas')).toHaveCount(0);await page.reload();await page.locator('#design-open').click();expect(await draft()).toEqual(pending);await expect(page.locator('#design-name')).toHaveValue('自己画的小屋');
  await page.locator('#design-save').click();await expect(page.locator('#designer-dialog')).not.toBeVisible();await expect(page.locator('#plan-title')).toHaveText('自己画的小屋');await expect(page.locator('.market-price')).not.toBeVisible();await expect(page.locator('#source-link')).not.toBeVisible();await expect(page.locator('.custom-plan-card')).toHaveCount(1);
  const custom=(await state()).customPlans[0];expect(custom.id).toBe(pending.id);await expect(page.locator('#scene canvas')).toHaveAttribute('data-plan',custom.id);await page.locator('[data-flat=true]').click();await page.locator('#floor-image').evaluate(i=>i.decode());await page.locator('[data-flat=false]').click();
  await page.locator('#invest').click();await expect(page.locator('#build-percent')).toHaveText('9%');await study(50);
  await page.locator('[data-category=decor]').click();await page.locator('[data-item=decor-plant]').click();await page.locator('#buy-item').click();await page.locator('#placement-room').selectOption(ids[1]);await expect(page.locator('#free-placement')).toBeVisible();await expect(page.locator('#placement-slots')).not.toBeVisible();await page.locator('#free-position-u').fill('70');await page.locator('#free-position-v').fill('65');await page.locator('#rotate-item').click();await page.locator('#place-item').click();await expect(page.locator('#item-dialog')).not.toBeVisible();await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','1');
  const placed=(await state()).placements[0];expect(placed.u).toBe(70);expect(placed.v).toBe(65);expect(placed.rotation).toBe(1);await page.locator('.model-panel').screenshot({path:'test-results/designer-decorated.png'});
  console.log('PASS: drawing, dragging, resizing, dimensions, finishes, openings, undo, draft recovery, 3D, custom construction and free furniture placement');
  await page.locator('#edit-design').click();await page.locator(`[data-design-pick="${ids[1]}"]`).click();await page.locator('#design-remove-room').click();await page.locator('#design-save').click();await expect(page.locator('#scene canvas')).toHaveAttribute('data-placed','0');await expect(page.locator('#owned-count')).toHaveText('1');await expect(page.locator('#build-percent')).toHaveText('9%');await expect(page.locator('#balance')).toHaveText(money(studyCredit(await state())-1100));
  await page.locator('.plan-select[data-plan=riverside]').click();await expect(page.locator('#build-percent')).toHaveText('9%');await expect(page.locator('#market-price')).toHaveText('$456,900 起');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-custom-edit]').click();await page.locator('[data-design-template=cozy]').click();await expect(page.locator('#design-summary')).toContainText('9 / 20');await page.locator('[data-design-view="3d"]').click();await expect(page.locator('#design-preview canvas')).toBeVisible();await page.locator('#designer-dialog').screenshot({path:'test-results/designer-mobile.png'});
  const width=await page.evaluate(()=>({scroll:document.querySelector('#designer-dialog').scrollWidth,client:document.querySelector('#designer-dialog').clientWidth}));expect(width.scroll).toBeLessThanOrEqual(width.client);
  await page.locator('#design-save').click();await expect(page.locator('#designer-dialog')).not.toBeVisible();await page.reload();await expect(page.locator('#plan-title')).toHaveText('自己画的小屋');expect((await state()).customPlans[0].rooms).toHaveLength(9);await expect(page.locator('#build-percent')).toHaveText('9%');
  expect(errors).toEqual([]);console.log('DESIGNER BROWSER PASSED: '+url);
}finally{await browser.close();}
