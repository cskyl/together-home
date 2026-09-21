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
      bookcase:()=>rect(61,35,101,115,c)+rect(68,41,87,102,'#e0c9a5',1)+stroke('M68 72h86m-86 34h86m-86 36h86',wood,5)+stroke('M80 65V48m12 17V45m12 20V49m22 15-5-17M82 99V80m13 19V79m14 20V84m24 14V78m-51 57v-20m14 20v-22m37 22-6-19','#7f9b8a',7)+stroke('M74 149v7m75-7v7',wood,6),
      sectional:()=>stroke('M41 138v13m87-15v15m63-8v8',wood,6)+rect(33,59,154,67,c,10)+rect(38,70,65,40,'#b1c0b6',7)+rect(108,70,70,40,'#b1c0b6',7)+rect(35,112,98,27,c,5)+rect(131,102,63,45,c,6)+rect(134,102,57,28,'#b1c0b6',6)+rect(26,91,17,43,c,5)+rect(179,90,17,45,c,5)+rect(50,86,24,26,cream,4),
      ottoman:()=>stroke('M63 135h93M68 134l8-37m68 37-9-34M75 101l61 3',wood,7)+`<path d="m55 94 76-10 38 20-80 13Z" fill="${c}"/>`+`<path d="m55 94v14l34 21 80-14v-11l-80 13Z" fill="#b9b7a5"/>`,
      coffeetable:()=>stroke('M55 99v52m113-52v52M77 79v49m71-49v49',wood,6)+`<path d="m47 89 94-21 40 23-97 25Z" fill="${c}"/>`+`<path d="m52 128 93-15 25 13-93 19Z" fill="${wood}"/>`+rect(78,122,38,5,cream,1)+rect(80,117,35,5,'#a2b09c',1)+ellipse(133,87,10,5,cream),
      sidetable:()=>stroke('M91 96 69 148m64-52 21 52m-44-48v52',line,4)+ellipse(111,96,60,20,c)+ellipse(111,91,60,20,c)+ellipse(111,91,52,15,'#ccd0bc')+stroke('M59 90c12 13 87 22 105 0',c,4),
      chaise:()=>stroke('M41 129v18m123-18v18',line,5)+`<path d="m35 80 53 7 99 30-37 25-118-22Z" fill="${c}"/>`+`<path d="m47 98 123 18-27 16-103-25Z" fill="#c1d0cd"/>`+`<path d="m35 81 3-35 46 12 4 30Z" fill="${c}"/>`+rect(47,67,24,27,cream,6)+`<path d="m108 114 42 6-18 13-42-7Z" fill="${cream}"/>`,
      daybed:()=>rect(33,62,154,82,c,3)+rect(42,72,137,43,cream,2)+rect(37,113,146,31,c,2)+rect(42,119,42,20,'#eee9dc',2)+rect(91,119,42,20,'#eee9dc',2)+rect(140,119,38,20,'#eee9dc',2)+ellipse(63,127,3,3,line)+ellipse(112,127,3,3,line)+ellipse(159,127,3,3,line)+rect(31,86,10,44,c,2)+rect(180,86,10,44,c,2)+rect(57,91,30,23,'#b2c1b3',7)+rect(139,91,27,23,'#b2c1b3',7)+stroke('M40 143v10m140-10v10',wood,5),
      bunkbed:()=>stroke('M43 32v124m133-124v124M43 42h133M43 91h133',line,5)+rect(47,62,126,13,cream,2)+rect(47,119,126,14,cream,2)+rect(48,73,126,6,c,1)+rect(48,132,126,6,c,1)+stroke('M62 43v17m23-17v17m23-17v17m23-17v17m23-17v17',line,3)+stroke('M62 73v79m24-79v79m-24-14h24m-24-19h24m-24-19h24m-24-19h24',line,4)+rect(119,61,42,6,'#adc0b1',1)+rect(119,118,42,7,'#adc0b1',1),
      vanity:()=>rect(35,80,150,8,c,2)+rect(43,88,134,25,c,1)+rect(44,112,8,43,c,1)+rect(167,112,8,43,c,1)+stroke('M93 98h34',line,2)+rect(37,77,145,3,'#dce6df',1)+rect(144,60,10,17,'#c5b3bb',2)+ellipse(160,74,7,3,cream),
      standingdesk:()=>rect(32,61,157,10,c,3)+stroke('M60 73v66m100-66v66M44 145h40m55 0h41',line,7)+stroke('M60 100V75m100 25V75','#c2cac2',6)+stroke('M61 119h98',line,4)+rect(153,72,20,7,line,2)+rect(160,73,7,3,'#b8d1c2',1),
      filingcabinet:()=>rect(73,39,75,106,c,3)+Array.from({length:6},(_,i)=>rect(78,44+i*16,65,13,'#d1d8cb',1)+rect(104,48+i*16,15,5,line,1)).join('')+ellipse(83,152,6,5,line)+ellipse(139,152,6,5,line)+rect(71,35,80,6,c,2),
      bookshelfwide:()=>rect(32,68,155,79,c,2)+rect(39,75,141,65,'#eee5d0',1)+stroke('M74 74v66m36-66v66m36-66v66M38 106h143',wood,4)+stroke('M47 98V82m9 16V79m9 19V85m51 13V81m10 17V79m9 19V87m-17 45v-18m9 18v-15','#90a58d',5)+rect(80,113,25,23,'#a1b19b',1)+rect(150,78,26,23,'#bdaa8b',1)+rect(42,111,25,25,'#b8a993',1),
      stool:()=>stroke('M76 99 64 151m79-52 13 52m-63-45-7 33m42-33 7 33',line,5)+ellipse(110,96,51,18,c)+ellipse(99,94,4,3,line)+ellipse(121,94,4,3,line)+ellipse(99,101,4,3,line)+ellipse(121,101,4,3,line),
      barstool:()=>ellipse(111,148,39,11,line)+stroke('M111 146V72',line,7)+ellipse(111,119,28,10,line)+ellipse(111,117,23,7,'#e6e8da')+stroke('M110 101v43',line,6)+ellipse(111,69,40,14,c)+ellipse(111,65,40,13,c)+stroke('M134 78h16',line,4),
      sideboard:()=>rect(40,62,139,80,c,2)+rect(35,55,149,8,c,2)+rect(48,69,58,64,'#cbb69a',1)+rect(113,69,58,64,'#cbb69a',1)+rect(55,76,45,50,c,1)+rect(120,76,45,50,c,1)+ellipse(99,93,3,3,line)+ellipse(120,93,3,3,line)+rect(45,141,129,10,wood,1),
      kitchenisland:()=>rect(32,60,157,13,c,2)+stroke('M46 74v78m128-78v78M65 73v67m89-67v67',wood,6)+rect(44,130,131,7,c,1)+rect(44,99,131,7,c,1)+stroke('M51 99v7m15-7v7m15-7v7m15-7v7m15-7v7m15-7v7m15-7v7m15-7v7',wood,3)+rect(121,118,36,10,cream,2)+rect(124,111,31,7,'#a6b8a2',2)+ellipse(80,57,17,7,cream),
      kitchencart:()=>stroke('M72 46v102m76-102v102',line,4)+[53,87,121].map(y=>rect(64,y,93,21,c,7)+rect(68,y+4,85,5,'#c4d0bf',3)).join('')+ellipse(77,152,6,5,line)+ellipse(144,152,6,5,line)+rect(88,35,11,18,cream,3)+rect(121,40,16,13,'#cbb997',2),
      wallcabinet:()=>rect(61,142,100,11,wood,1)+rect(55,46,111,98,c,2)+rect(52,41,117,7,cream,1)+rect(61,52,46,85,'#eeeadd',1)+rect(113,52,46,85,'#eeeadd',1)+stroke('M99 66v13m21-13v13',line,3),
      bathvanity:()=>stroke('M66 142v11m89-11v11',line,5)+rect(59,84,104,59,c,3)+rect(64,91,94,20,'#eeeadd',2)+rect(64,117,94,20,'#eeeadd',2)+stroke('M99 96h25m-25 27h25',line,3)+rect(54,76,114,11,cream,3)+ellipse(111,69,49,16,cream)+ellipse(111,64,36,11,'#c3d4d1')+stroke('M111 58V40q0-13 13-13t11 13',line,5),
      bathshelf:()=>stroke('M77 27v127m68-127v127',wood,5)+[37,63,89,115,141].map(y=>rect(73,y,76,5,c,1)).join('')+rect(87,123,46,15,cream,3)+stroke('M89 129h43','#b4c4af',3)+rect(85,95,49,15,'#b5c5b2',3)+rect(89,49,11,12,cream,2)+rect(118,42,10,19,'#91aaa1',2),
      mirror:()=>stroke('M142 108 163 151m-38-30 33 19',wood,5)+rect(70,27,77,127,c,4)+rect(78,35,61,111,'#b6cdcf',1)+stroke('M85 96 129 48m-44 64 44-48','#dbe8e3',3)+stroke('M78 150v7m62-7v7',wood,4),
      laundrybasket:()=>rect(65,62,91,89,c,4)+rect(60,54,101,10,'#cbbb9c',3)+Array.from({length:8},(_,i)=>stroke(`M68 ${72+i*9}h85`,'#d4c3a4',3)).join('')+Array.from({length:7},(_,i)=>stroke(`M${73+i*12} 68v79`,wood,2)).join('')+rect(99,54,25,6,line,2),
      shoecabinet:()=>rect(68,40,88,109,c,2)+[46,78,110].map(y=>rect(74,y,76,28,'#eee8d6',1)+stroke(`M100 ${y+7}h22`,line,3)).join('')+stroke('M77 150v6m70-6v6',wood,5)+rect(65,35,94,7,c,2),
      coatstand:()=>stroke('M108 43 88 150m24-107 29 107m-27-109 2 111',c,6)+stroke('M108 48 74 29m36 17 42-20m-41 34 11-25m-15 54-28-16m33 19 28-14',c,7)+ellipse(73,28,5,5,c)+ellipse(154,25,5,5,c)+ellipse(122,33,5,5,c),
      entrybench:()=>stroke('M47 113v39m130-39v39m-108-40v31m87-31v31',wood,5)+rect(38,102,150,10,c,2)+rect(132,113,44,28,c,2)+stroke('M145 120h16',line,3)+rect(46,138,84,6,c,1)+stroke('M52 140h70',wood,2)+stroke('M85 104v6m54-6v6',wood,2),
      outdoorchair:()=>stroke('M75 111 65 151m72-40 15 40M82 113 68 49m65 66 12-65',wood,5)+[52,65,78,91].map(y=>stroke(`M73 ${y}h66`,c,7)).join('')+`<path d="m68 109 69-3 22 20-81 5Z" fill="${c}"/>`+stroke('M74 116h66m-61 7h68',wood,2)+stroke('M62 93 82 97m47-2 28-2M80 99v24m68-24v23',wood,5),
      outdoortable:()=>stroke('M48 91v60m127-54v54M88 78v59m54-65v65',wood,6)+`<path d="m43 78 105-10 36 28-109 15Z" fill="${c}"/>`+stroke('M59 81 91 105m-16-25 32 23m-15-25 33 23m-16-25 32 23m-15-25 32 23',wood,3)+stroke('M47 91 76 113l100-13',wood,6)
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
