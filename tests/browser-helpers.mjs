import {getPlan} from '../src/plans.js';
import {constructionTotal,progressLabel} from '../src/construction.js';
// Browser assertions use the amount recorded in the ledger, including pre-slider saves.
export const money = value => '$'+value.toLocaleString('en-US');
export const studyCredit = state => state.events.filter(event=>event.type==='study').reduce((total,event)=>total+(event.reward??event.minutes*10),0);
export const localState = page => page.evaluate(()=>JSON.parse(localStorage.getItem('together-home-v1')));
export const cloudState = page => page.evaluate(()=>JSON.parse(localStorage.getItem('together-home-session-v1')).cached);
export async function setFocus(page,value){const slider=page.locator('#study-focus');await slider.focus();await slider.press(value<=50?'Home':'End');for(let i=0;i<(value<=50?value:100-value);i++)await slider.press(value<=50?'ArrowRight':'ArrowLeft');}

export const buildPercent=(amount,plan='riverside',state={})=>progressLabel(amount,constructionTotal(getPlan(plan,state)));
export const buildSpent=state=>state.events.filter(event=>event.type==='build').reduce((total,event)=>total+event.amount,0);
