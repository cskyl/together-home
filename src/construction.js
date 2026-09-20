export const DEFAULT_CUSTOM_BUDGET = 450000;

// These fixed shares split the selected home's total into game milestones.
// They are not a contractor's estimate or a breakdown of the listing price.
const milestones = [
  ['survey-permits','测量与手续','测量','确认边界、标出位置，把开工手续准备好。',2,'foundation'],
  ['clear-grade','清场与整地','整地','清理场地，把地面整理到可以施工。',3,'foundation'],
  ['excavation','开挖与排水','开挖','挖出基础位置，安排地下排水。',5,'foundation'],
  ['foundation','基础浇筑','基础','绑好钢筋，浇筑基础并养护。',8,'foundation'],
  ['slab-utilities','地坪与预埋管线','地坪','铺设地下管线，再完成地坪。',5,'foundation'],
  ['frame','主体木框架','框架','把房间的框架和承重结构搭起来。',14,'frame'],
  ['sheathing','结构板与防水层','结构板','封上结构板，铺好外侧防水层。',5,'walls'],
  ['roof-structure','屋顶结构','屋架','安装屋架，搭出屋顶的形状。',6,'roof'],
  ['roof-cover','屋面与雨水槽','屋面','铺上屋面，把雨水槽接好。',4,'roof'],
  ['windows-doors','门窗安装','门窗','装好外门和窗户，让房子封闭起来。',6,'walls'],
  ['exterior','外墙饰面','外墙','完成外墙的饰面和收边。',5,'walls'],
  ['plumbing','室内给排水','水管','把厨房、浴室和洗衣区的水管接好。',5,'walls'],
  ['electrical','布线与配电','电路','铺设电线，装上配电和插座底盒。',5,'walls'],
  ['hvac','暖通与风管','暖通','布好风管，安装供暖和制冷设备。',5,'walls'],
  ['insulation','保温与隔音','保温','填好保温材料，处理房间之间的隔音。',3,'walls'],
  ['drywall-paint','内墙与刷漆','内墙','封好内墙板，找平，再刷上选好的颜色。',6,'walls'],
  ['flooring','地板与踢脚线','地板','铺设各个房间的地板，装好踢脚线。',4,'finish'],
  ['kitchen-bath','厨卫与基础配置','厨卫','安装橱柜、洁具和基础配置。',7,'finish'],
  ['landscaping','院子与室外收尾','院子','整理院子，补好绿化和室外细节。',1,'finish'],
  ['inspection-clean','检查与清理','完工','检查各项设备，清理现场，完成房子。',1,'finish']
].map(([id,name,short,detail,weight,visualGroup])=>Object.freeze({id,name,short,detail,weight,visualGroup}));

export function constructionTotal(plan) {
  const total = plan?.price?.amount ?? plan?.budget ?? DEFAULT_CUSTOM_BUDGET;
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('房屋总预算需要是正整数。');
  return total;
}

export function constructionPhases(plan) {
  const total = constructionTotal(plan);
  let weight = 0, end = 0;
  return milestones.map(phase=>{
    const start = end;
    weight += phase.weight;
    end = Math.round(total * (weight / 100));
    return {...phase,cost:end-start,start,end};
  });
}

export function constructionProgress(amount, plan) {
  const funded = Math.max(0, Math.min(constructionTotal(plan), Number(amount) || 0));
  return constructionPhases(plan).map(phase=>{
    const paid = Math.max(0, Math.min(phase.cost, funded-phase.start));
    return {...phase,paid,ratio:phase.cost ? paid/phase.cost : Number(funded>=phase.end)};
  });
}

export function constructionVisualProgress(amount, plan) {
  const phases = constructionProgress(amount, plan);
  return ['foundation','frame','walls','roof','finish'].map(id=>{
    const matching = phases.filter(phase=>phase.visualGroup===id);
    const cost = matching.reduce((sum,phase)=>sum+phase.cost,0);
    const paid = matching.reduce((sum,phase)=>sum+phase.paid,0);
    return {id,cost,paid,ratio:cost ? paid/cost : Number(matching.every(phase=>phase.ratio===1))};
  });
}

export function progressLabel(amount, total) {
  if (!(amount>0) || !(total>0)) return '0%';
  if (amount>=total) return '100%';
  const tenths = Math.min(999, Math.floor(amount*1000/total));
  return tenths ? `${tenths/10}%` : '<0.1%';
}
