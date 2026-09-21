const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function referencePhoto(item) {
  const r=item.reference;if(!r?.image)return '';
  return `<img src="${import.meta.env.BASE_URL}${esc(r.image)}" loading="lazy" alt="${esc(r.brand+' '+r.name)} 官方商品参考图" data-reference-photo="${esc(item.id)}">`;
}
export function productDetails(item) {
  const r=item.reference;if(!r)return '';
  const price=r.retailPrice,retail=price&&Number.isFinite(price.amount)?new Intl.NumberFormat('zh-CN',{style:'currency',currency:price.currency||'USD'}).format(price.amount):'';
  return `<section class="product-reference" aria-label="真实商品资料"><span class="eyebrow">实物参考 · ${esc(r.brand)}</span><h3>${esc(r.name)}</h3><dl class="product-specs">${r.specs.map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${retail?`<p class="retail-price">官网参考价 <strong>${retail}</strong>${price.note?' · '+esc(price.note):''}</p>`:''}<p class="reference-note">${esc(r.note||'官方图片和参数用于实物参考；3D 为同类商品的简化示意，外形与尺寸可能不同。')}${item.optionGroups?' 已列出的配置与价格来自官网；3D 仅用于摆放，不能还原每项配置细节。':item.category==='cars'?' 这是以前购买的游戏车型，保留原成交金额和选配。':''}</p><a class="product-source" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">查看 ${esc(r.brand)} 官方商品 ↗</a><p class="reference-date">资料核对：${esc(r.checkedAt)}${item.optionGroups?' · 美国官网价格快照，未扣优惠或节油补贴；官网价格可能变化。':retail?' · 零售价与游戏资金分别显示，活动和选配会影响实价。':''}</p></section>`;
}
