// In-game prices only. Official products below are visual/spec references.
export const furnitureExpansion = [
  ['recliner','单人躺椅',55,'#ada897','living','椅背后仰、脚托抬起来，给客厅留个躺着的位置。'],
  ['tv','电视与矮柜组合',65,'#313638','living','游戏里把电视和矮柜放在一起；官方图片与参数仅对应电视本体。'],
  ['consolecabinet','窄边收纳柜',30,'#b49878','entry','进门顺手放钥匙，也能补一点收纳。'],
  ['singlebed','单人床',40,'#c7b493','bedroom','小一点的卧室或客房，用一张单人床就够。'],
  ['clothesrack','开放挂衣架',10,'#d4d3c6','bedroom','常穿的衣服直接挂出来，下面留点放鞋的空间。'],
  ['makeupstool','梳妆小凳',8,'#c7b898','bedroom','矮一点的小坐凳，可以搭配梳妆台。'],
  ['arclamp','弧形落地灯',8,'#b8c3b4','living','弧形灯臂伸到座位上方，放在沙发旁边。'],
  ['plantstand','多层花架',5,'#7c9078','living','错开高度的小平台，给几盆绿植找个位置。'],
  ['displaycase','玻璃展示柜',30,'#899e91','living','给喜欢的收藏留一个带玻璃门的柜子。'],
  ['pantry','厨房高柜',35,'#d7d2c4','kitchen','高一点的柜子，锅碗和储备食材可以分层收纳。'],
  ['fridge','双门冰箱',65,'#aab1b1','kitchen','冷藏和冷冻分开，厨房的大件先安排上。'],
  ['microwave','微波炉与小台组合',18,'#9aa4a5','kitchen','游戏里附一张操作小台；官方图片与参数仅对应微波炉本体。'],
  ['oven','烤箱灶台',50,'#a2aaaa','kitchen','上面做饭，下面烤东西。游戏里作为静态家电摆放。'],
  ['dishwasher','嵌入式洗碗机',45,'#b1b7b4','kitchen','给厨房多一台洗碗机，餐具收拾起来省点事。'],
  ['washingmachine','滚筒洗衣机',60,'#c8cdca','bathroom','前开门滚筒，给洗衣区留一个位置。'],
  ['dryer','滚筒烘干机',55,'#b7bfbb','bathroom','可以和洗衣机并排放，凑成洗衣区。'],
  ['toilet','坐便器',25,'#ecece3','bathroom','水箱、坐圈和底座分得清楚的简化卫浴模型。'],
  ['shower','淋浴组件',40,'#adb9b8','bathroom','顶喷和控制阀的卫浴组合，游戏里用独立支架展示。'],
  ['patiochaise','户外躺椅',20,'#b59c79','outdoor','放在露台或院子里，留个晒太阳的位置。'],
  ['patiosofa','户外双人沙发',40,'#b6a184','outdoor','木框加坐垫，户外也可以安排两个人坐。']
].map(([shape,name,price,color,roomGroup,description])=>({id:`furniture-${shape}`,category:'furniture',shape,name,price,color,roomGroup,description}));
