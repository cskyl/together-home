const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Small original illustrations mirror the silhouette and color of each 3D item.
// Keeping them as vectors makes catalog cards crisp at mobile and desktop sizes.
export function furnitureThumbnail(item){
  if(!['furniture','cats'].includes(item.category))return '';
  const c=item.color,wood='#937a5b',cream='#ede4d1',line='#7b806d';
  const rect=(x,y,w,h,fill=c,rx=3)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
  const ellipse=(x,y,rx,ry,fill=c)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
  const stroke=(d,color=wood,width=5)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  let drawing='';
  if(item.category==='furniture'){
    const drawings={
      sofa:()=>stroke('M53 132v18m113-18v18',wood,7)+rect(43,63,132,63,c,15)+rect(51,75,55,36,'#b7c6af',9)+rect(112,75,55,36,'#b7c6af',9)+rect(39,110,141,29,c,9)+rect(33,92,21,40,'#899e89',8)+rect(166,92,21,40,'#899e89',8)+stroke('M111 114v18','#81997e',2),
      armchair:()=>stroke('M75 129v20m69-20v20',wood,7)+rect(69,53,84,66,c,16)+rect(77,66,68,44,'#d6c3aa',12)+rect(65,111,92,27,c,9)+rect(58,88,20,46,'#ae9476',9)+rect(146,88,20,46,'#ae9476',9),
      bed:()=>rect(47,56,113,68,wood,5)+rect(55,62,97,46,c,5)+`<path d="m50 93 108 0 27 46H31Z" fill="${cream}"/>`+`<path d="M31 131h154v14H31Z" fill="${c}"/>`+stroke('M43 144v12m130-12v12',wood,7)+rect(59,87,39,20,'#fcf8e9',6)+rect(108,87,39,20,'#fcf8e9',6)+`<path d="m45 112 120 0 11 21H38Z" fill="#aab69f"/>`+stroke('M48 119h116','#c2ccb7',2),
      wardrobe:()=>rect(60,34,100,112,c,4)+rect(68,42,38,96,'#d8c7a9',1)+rect(114,42,38,96,'#d8c7a9',1)+stroke('M100 86v13m21-13v13',wood,3)+stroke('M69 147v8m82-8v8',wood,7),
      dresser:()=>rect(52,60,116,86,c,4)+rect(58,66,104,22,'#cbaa8a')+rect(58,94,104,22,'#cbaa8a')+rect(58,122,104,18,'#cbaa8a')+stroke('M98 77h24m-24 28h24m-24 26h24',wood,3)+stroke('M64 146v9m92-9v9',wood,7),
      nightstand:()=>rect(72,76,78,65,c,4)+rect(78,83,66,24,'#e1cfac')+rect(78,112,66,22,'#e1cfac')+stroke('M105 95h13m-13 28h13',wood,3)+stroke('M80 142v11m62-11v11',wood,6)+rect(68,69,86,10,wood,3)+rect(84,63,43,5,'#9ea88e',1)+rect(81,58,40,5,cream,1),
      desk:()=>rect(39,79,144,13,c,4)+stroke('M49 92v62m123-62v62',wood,8)+rect(132,94,39,34,'#d4b692')+stroke('M143 108h16',wood,3)+rect(58,69,48,7,cream,1)+rect(66,62,40,6,'#8fa7a7',1),
      officechair:()=>rect(77,40,68,65,c,13)+rect(72,105,79,20,'#7c9293',8)+stroke('M77 111V93H61m89 18V93h14',line,5)+stroke('M111 125v18m-31 9 31-9 31 9m-31-9v14',line,6)+ellipse(78,152,6,4,line)+ellipse(144,152,6,4,line)+ellipse(111,157,5,4,line)+stroke('M94 57v28m15-28v28m15-28v28','#a1b3b3',3),
      diningtable:()=>stroke('M64 109 55 149m103-40 9 40m-26-45v33m-60-33v33',wood,7)+ellipse(110,99,78,31,wood)+ellipse(110,93,78,30,c)+stroke('M52 91h116','#caa883',2),
      diningchair:()=>stroke('M80 131 76 153m63-22 5 22M81 110V49m58 61V49',wood,7)+rect(81,50,58,16,c)+stroke('M95 68v33m29-33v33',c,7)+rect(72,109,76,21,'#d9cfb8',6)+rect(73,127,75,7,wood,2),
      tvstand:()=>stroke('M48 139v13m124-13v13',wood,6)+rect(37,89,146,48,c,4)+rect(42,95,42,36,'#c2a98c')+rect(91,95,38,36,'#806d59')+rect(136,95,42,36,'#c2a98c')+stroke('M75 109v9m70-9v9',wood,3)+rect(96,116,27,5,cream,1)+rect(97,108,25,6,'#819b94',1)+rect(35,83,150,9,wood,2),
      bookcase:()=>rect(61,35,101,115,c)+rect(68,41,87,102,'#e0c9a5',1)+stroke('M68 72h86m-86 34h86m-86 36h86',wood,5)+stroke('M80 65V48m12 17V45m12 20V49m22 15-5-17M82 99V80m13 19V79m14 20V84m24 14V78m-51 57v-20m14 20v-22m37 22-6-19','#7f9b8a',7)+stroke('M74 149v7m75-7v7',wood,6)
    };
    drawing=drawings[item.shape]?.()||'';
  }else{
    const drawings={
      tree:()=>rect(52,143,121,11,c,4)+stroke('M83 143V65m60 78V44',wood,10)+rect(42,75,72,10,c,4)+rect(111,38,65,10,c,4)+rect(110,111,59,10,c,4)+rect(61,94,49,41,'#d2c0a1',4)+ellipse(86,114,13,16,'#827663')+stroke('M78 57h37v-8',cream,5)+stroke('M136 65h14m-14 7h14m-14 7h14m-67 42h13m-13 7h13',cream,2),
      condo:()=>rect(66,43,88,101,c,7)+`<path d="m58 45 52-24 52 24Z" fill="${wood}"/>`+rect(61,91,98,7,wood,2)+ellipse(109,70,20,19,'#897c63')+ellipse(109,121,20,19,'#897c63')+ellipse(109,133,14,5,cream)+ellipse(109,81,14,5,cream)+rect(57,145,107,10,wood,3),
      bed:()=>ellipse(111,123,71,29,c)+ellipse(111,109,71,29,'#d8c8bf')+ellipse(111,105,55,20,'#a98f84')+ellipse(111,111,47,16,cream)+stroke('M47 114c2 19 28 26 62 26s62-9 65-25',c,7),
      litter:()=>rect(49,111,126,39,c,9)+`<path d="M52 112V77c0-26 116-26 120 0v35Z" fill="#c4d0c4"/>`+rect(87,91,56,57,'#73847d',18)+rect(92,114,46,31,'#8e9990',4)+stroke('M79 69h46',cream,4)+stroke('M60 109h22m62 0h21','#95a99c',4),
      feeder:()=>rect(42,115,138,20,c,5)+stroke('M51 136v13m121-13v13',wood,6)+ellipse(78,111,26,14,'#dddace')+ellipse(144,111,26,14,'#dddace')+ellipse(78,108,20,9,'#978467')+ellipse(144,108,20,9,'#94bcc0')+ellipse(70,108,4,3,wood)+ellipse(80,104,4,3,wood)+ellipse(86,110,4,3,wood),
      fountain:()=>rect(63,102,96,42,c,16)+ellipse(111,106,48,21,'#bed0cd')+ellipse(111,103,36,14,'#8cb9c2')+rect(102,65,18,40,'#dde3d8',8)+ellipse(111,65,19,8,'#dae4db')+stroke('M110 61c-10-19-20-1-21 15m23-15c12-21 22-1 20 16','#89b9c6',4)+ellipse(111,94,6,4,'#c0e0e2'),
      scratcher:()=>ellipse(110,145,55,12,wood)+rect(99,52,24,89,c,7)+ellipse(111,51,13,5,cream)+stroke('M99 65h24m-24 9h24m-24 9h24m-24 9h24m-24 9h24m-24 9h24m-24 9h24m-24 9h24',cream,3)+stroke('M122 55q39 7 24 38',wood,2)+ellipse(145,97,10,11,'#a9b69a'),
      tunnel:()=>`<path d="M59 124 108 94 163 123M109 95V59" fill="none" stroke="${c}" stroke-width="40" stroke-linecap="round"/>`+ellipse(54,125,19,24,'#889a81')+ellipse(54,125,12,17,'#64795f')+ellipse(170,124,19,24,'#889a81')+ellipse(170,124,12,17,'#64795f')+ellipse(109,51,23,17,'#bbc6b1')+ellipse(109,51,16,10,'#708166')+stroke('M84 91 100 116m17-26 15 27m-36-46h29','#d8dfd0',2),
      perch:()=>stroke('M62 73v72m94-72v72','#acbaa4',5)+stroke('M63 141 88 104m67 37-25-37',wood,5)+rect(45,95,128,16,c,7)+ellipse(109,95,57,14,'#e3d6bb')+ellipse(109,91,45,10,'#cec0a5')+ellipse(62,64,8,8,'#c5d0be')+ellipse(156,64,8,8,'#c5d0be'),
      toys:()=>`<path d="m60 106 10 46h81l12-46Z" fill="${c}"/>`+ellipse(111,107,52,13,'#968269')+stroke('M85 121v20m19-20v20m20-20v20m18-20v20','#d8c6a5',3)+ellipse(90,104,15,15,'#98b5aa')+ellipse(124,107,14,14,'#d9b181')+stroke('M129 101 143 49',wood,4)+`<path d="m141 52-13-17 2 25m13-9 16-17-4 26" fill="#a1b9b9"/>`+ellipse(108,94,11,11,'#c1a0ad')
    };
    drawing=drawings[item.shape]?.()||'';
  }
  return `<svg viewBox="0 0 220 180" role="img" aria-label="${esc(item.name)} 示意"><ellipse cx="111" cy="158" rx="73" ry="8" fill="#788a6a" opacity=".1"/>${drawing}</svg>`;
}
