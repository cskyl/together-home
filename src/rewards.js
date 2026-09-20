export const DEFAULT_FOCUS = 50;
const rewardFields = ['rewardVersion', 'focus', 'efficiency', 'reward'];

function validInputs(minutes, focus) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) throw Error('请输入 1–480 分钟的学习时长。');
  if (!Number.isInteger(focus) || focus < 0 || focus > 100) throw Error('学习投入状态需要在 0–100 之间。');
}

// Version 1 is fixed for saved records: focus changes the mean from 85% to
// 115%, with an equally likely jitter of -500..500 basis points (±5%).
const centerV1 = focus => 8500 + 30 * focus;
const amountV1 = (minutes, efficiency) => Math.round(minutes * 10 * efficiency / 10000);

export function focusLabel(focus) {
  if (focus < 20) return '有点分心';
  if (focus < 40) return '慢慢进入状态';
  if (focus < 60) return '正常发挥';
  if (focus < 80) return '挺专注';
  return '很投入';
}

export function rewardRange(minutes, focus = DEFAULT_FOCUS) {
  validInputs(minutes, focus);
  const center = centerV1(focus);
  return {min: amountV1(minutes, center - 500), max: amountV1(minutes, center + 500), average: amountV1(minutes, center)};
}

export function makeReward(minutes, focus = DEFAULT_FOCUS, roll) {
  validInputs(minutes, focus);
  const draw = roll(1001);
  if (!Number.isInteger(draw) || draw < 0 || draw > 1000) throw Error('学习奖励随机结果无效。');
  const efficiency = centerV1(focus) + draw - 500;
  return {rewardVersion: 1, focus, efficiency, reward: amountV1(minutes, efficiency)};
}

export function studyReward(event) {
  return event.rewardVersion === 1 ? event.reward : event.minutes * 10;
}

export function validateStudyReward(event) {
  // Old studies have none of these fields and keep their original $10/min.
  if (!rewardFields.some(field => Object.hasOwn(event, field))) return;
  if (!rewardFields.every(field => Object.hasOwn(event, field)) || event.rewardVersion !== 1) throw Error('学习奖励记录无效。');
  validInputs(event.minutes, event.focus);
  const center = centerV1(event.focus);
  if (!Number.isInteger(event.efficiency) || event.efficiency < center - 500 || event.efficiency > center + 500 || !Number.isInteger(event.reward) || event.reward !== amountV1(event.minutes, event.efficiency)) throw Error('学习奖励记录无效。');
}
