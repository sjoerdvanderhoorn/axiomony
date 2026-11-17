/**
 * Axiomony · Acme walkthrough
 *
 * Self-contained Canvas 2D animation. Edit STORY to change all conversations,
 * phase timing, table names, example data, and captions. The same source renders
 * in a browser or is exported to MP4/GIF by demo/acme/render.mjs.
 *
 * All timestamps are seconds. Visual layout is built for a 1600×900 logical
 * canvas and scales to the requested output resolution.
 */
export const STORY = {
  duration: 60,
  width: 1600,
  height: 900,
  phases: [
    { id: 'database', start: 0, end: 18, label: '01  SHARED DATABASE', client: 'ChatGPT' },
    { id: 'purchasing', start: 18, end: 31, label: '02  PURCHASING', client: 'Claude' },
    { id: 'sales', start: 31, end: 44, label: '03  SALES', client: 'Gemini' },
    { id: 'finance', start: 44, end: 56, label: '04  FINANCE', client: 'ChatGPT' },
    { id: 'final', start: 56, end: 60, label: '05  ONE FOUNDATION', client: 'Axiomony' },
  ],
  conversations: {
    database: {
      initial: 'For our company Acme, we need a database\nto track invoices, sales and stock.',
      firstReply: 'Of course. Who will be using it, and what\nshould each team be able to do?',
      rules: 'Purchasing enters supplier invoices, Finance\napproves €500+, and Sales creates quotes.',
      lastReply: 'I’ve put together a proposal for the tables\nand access rules. Shall we review it?',
    },
    purchasing: {
      prompt: 'Can you make an app to scan supplier invoices\nand send them for approval from my phone?',
      reply: 'Absolutely. I’ll make a simple scanning app\nthat works with Acme’s existing database.',
    },
    sales: {
      prompt: 'Could you make quoting easier? I’d love to\nturn accepted quotes into orders in one click.',
      reply: 'Sure. I’ll use your existing customers,\nproducts and sales orders.',
    },
    finance: {
      prompt: 'Can you show invoices waiting for\napproval and match bank payments?',
      reply: 'Sure. I’ll put both into one view,\nusing your existing permissions.',
    },
  },
  tables: ['Customers', 'Sales orders', 'Sales invoices', 'Suppliers', 'Purchases', 'Purchase invoices', 'Products', 'Payments'],
  colors: {
    text: '#1D293B', muted: '#63728A', light: '#F5F7FB', border: '#E3E8F0',
    chatgpt: '#087E68', claude: '#B66E50', gemini: '#546CD2', brand: '#4E5E91',
    blue: '#4263B9', green: '#21775F', ink: '#23324D',
  },
};

const C = STORY.colors;
const FONT = 'Inter, "Segoe UI", Arial, sans-serif';
const clamp = (x, a=0, b=1) => Math.min(b, Math.max(a, x));
const ease = x => { x = clamp(x); return x*x*(3-2*x); };
const enter = (t, at, length=.65) => ease((t-at)/length);
const lerp = (a,b,x) => a+(b-a)*x;
const alphaAt = (t,start,end) => enter(t,start,.45)*(1-enter(t,end-.55,.55));
const pad = n => String(Math.floor(n)).padStart(2,'0');

function font(ctx,size=20,weight=400){ctx.font=`${weight} ${size}px ${FONT}`;}
function text(ctx,string,x,y,size=20,color=C.text,weight=400,align='left'){
  ctx.fillStyle=color; ctx.textBaseline='top';ctx.textAlign=align;font(ctx,size,weight);ctx.fillText(String(string),x,y);
  ctx.textAlign='left';
}
function round(ctx,x,y,w,h,r=16,fill='#FFF',stroke=null,line=1){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke();}
}
function stroke(ctx,x1,y1,x2,y2,color=C.border,width=1.5){
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function circle(ctx,x,y,r,fill,strokeColor=null,width=1.5){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(strokeColor){ctx.lineWidth=width;ctx.strokeStyle=strokeColor;ctx.stroke();}}
function pill(ctx,label,x,y,w,{bg='#EDF1F7',color=C.muted,border=null,size=15}={}){
 round(ctx,x,y,w,33,16,bg,border);text(ctx,label,x+w/2,y+7,size,color,600,'center');
}
function shadow(ctx,blur=24,opacity=.11){ctx.shadowColor=`rgba(21,37,64,${opacity})`;ctx.shadowBlur=blur;ctx.shadowOffsetY=10;}
function cursor(ctx,x,y,click=0){
  if(click>0){ctx.save();ctx.globalAlpha=.33*(1-clamp(click));ctx.beginPath();ctx.arc(x+6,y+7,8+click*24,0,Math.PI*2);ctx.strokeStyle=C.blue;ctx.lineWidth=3;ctx.stroke();ctx.restore();}
  ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,29);ctx.lineTo(7,22);ctx.lineTo(15,36);ctx.lineTo(22,32);ctx.lineTo(14,19);ctx.lineTo(25,19);ctx.closePath();ctx.fillStyle='#FFF';ctx.fill();ctx.strokeStyle='#202D40';ctx.lineWidth=2;ctx.stroke();ctx.restore();
}
function typed(ctx,string,x,y,start,now,{size=19,color=C.text,weight=400,speed=35,line=31,showCursor=true}={}){
  const revealed=string.slice(0,Math.floor(clamp((now-start)*speed,0,string.length)));
  const rows=revealed.split('\n');rows.forEach((row,i)=>text(ctx,row,x,y+i*line,size,color,weight));
  if(showCursor&&now>=start&&revealed.length<string.length&&Math.floor(now*3)%2===0){
    font(ctx,size,weight);const lineWidth=ctx.measureText(rows.at(-1)).width;
    round(ctx,x+lineWidth+3,y+(rows.length-1)*line,2,size+3,0,C.blue);
  }
  return revealed.length===string.length;
}
function fadeDraw(ctx,opacity,cb){if(opacity<=0)return;ctx.save();ctx.globalAlpha*=clamp(opacity);cb();ctx.restore();}
function brandMark(ctx,x,y,r=16,color=C.brand){
  ctx.save();ctx.lineWidth=2.3;ctx.strokeStyle=color;for(let a=0;a<4;a++){
    const st=Math.PI*a/2+.11,ed=Math.PI*(a+1)/2-.11;
    ctx.beginPath();ctx.arc(x,y,r,st,ed);ctx.stroke();
  }
  stroke(ctx,x-r+4,y,x+r-4,y,color,2);stroke(ctx,x,y-r+4,x,y+r-4,color,2);ctx.restore();
}
function topBar(ctx,t,phase){
  brandMark(ctx,78,48,20);text(ctx,'AXIOMONY',111,33,20,C.ink,700);
  text(ctx,'ACME  /  AI-BUILT BUSINESS TOOLS',280,36,15,C.muted,600);
  pill(ctx,'CONCEPT DEMO',1214,28,155,{bg:'#E8EEF8',color:C.brand,border:'#D9E2F2',size:13});
  text(ctx,`${pad(t/60)}:${pad(t%60)}  /  01:00`,1450,36,16,C.muted,600);
  const x=74,w=1452,y=84;
  round(ctx,x,y,w,4,2,'#E2E7F0');
  round(ctx,x,y,w*clamp(t/STORY.duration),4,2,C.brand);
}
function backdrop(ctx){
  // Soft lilac/blue ambience makes the scene feel like a designed product film.
  const base=ctx.createLinearGradient(0,0,1600,900);
  base.addColorStop(0,'#EDF1FC');base.addColorStop(.48,'#FAF7F5');base.addColorStop(1,'#E8F1F4');
  ctx.fillStyle=base;ctx.fillRect(0,0,1600,900);
  const glow=(x,y,r,color)=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,color);g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  };
  glow(145,170,660,'rgba(167,180,238,.34)');
  glow(1450,740,650,'rgba(145,215,204,.30)');
  glow(1150,90,510,'rgba(255,215,195,.28)');
  // Lightweight graphic accents add depth without competing with UI content.
  ctx.save();ctx.lineWidth=1;
  for(let i=0;i<7;i++){
    ctx.beginPath();ctx.arc(1415,150,185+i*26,Math.PI*.06,Math.PI*.96);
    ctx.strokeStyle='rgba(90,111,167,.055)';ctx.stroke();
  }
  for(let x=26;x<1600;x+=68)for(let y=26;y<900;y+=68){
    circle(ctx,x,y,1,'rgba(79,102,151,.09)');
  }
  ctx.restore();
}
function chrome(ctx,x,y,w,h,{client='ChatGPT',accent=C.chatgpt,bg='#FFFFFF'}={}){
  ctx.save();shadow(ctx,30,.12);round(ctx,x,y,w,h,20,bg,C.border,1);ctx.restore();
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,20);ctx.clip();
  round(ctx,x,y,w,47,0,'#F9FAFD');stroke(ctx,x,y+47,x+w,y+47,'#E8EDF4');
  for(let k=0;k<3;k++)circle(ctx,x+25+k*22,y+23,6,['#FF6B70','#F6C454','#5FCF8D'][k]);
  round(ctx,x+98,y+8,Math.min(w-220,360),31,11,'#FFFFFF','#E6EBF2');
  circle(ctx,x+119,y+24,5,accent);text(ctx,`${client} · Acme`,x+137,y+14,14,C.muted,550);
  text(ctx,'●  Private workspace',x+w-172,y+15,12,C.muted,500);
  ctx.restore();
}
function chatSidebar(ctx,x,y,w,h,client,accent){
  round(ctx,x,y,w,h,0,'#F7F8FB');stroke(ctx,x+w,y,x+w,y+h,C.border);
  circle(ctx,x+36,y+43,17,accent);text(ctx,client,x+65,y+29,20,C.text,700);
  pill(ctx,'+  New chat',x+22,y+100,w-44,{bg:'#FFFFFF',color:C.ink,border:'#DDE4EF',size:15});
  text(ctx,'Recents',x+24,y+166,13,C.muted,650);
  for(const [i,v] of ['Acme / finance','Purchasing flow','Customer portal'].entries()){
    round(ctx,x+14,y+205+i*55,w-28,44,9,i===0?'#E9EDF6':'#F7F8FB');
    text(ctx,v,x+27,y+218+i*55,14,i===0?C.ink:C.muted,i===0?600:400);
  }
  circle(ctx,x+34,y+h-36,15,'#DDE5EF');text(ctx,'Acme workspace',x+61,y+h-47,14,C.muted,550);
}
function message(ctx,x,y,w,{who='user',lines='',accent=C.chatgpt,opacity=1,typingStart=null,now=0,size=18,bg=null}={}){
  if(opacity<=0)return;
  ctx.save();ctx.globalAlpha*=clamp(opacity);const user=who==='user';const h=(lines.split('\n').length)*31+36;
  round(ctx,x,y,w,h,15,bg||(user?'#EAF0F9':'#F0F7F4'),user?'#D6E2F3':'#D7E9E0');
  if(!user)circle(ctx,x+25,y+27,11,accent);
  const contentX=x+(user?21:47);
  if(typingStart!==null) typed(ctx,lines,contentX,y+18,typingStart,now,{size,line:31,color:C.text,speed:40});
  else lines.split('\n').forEach((row,i)=>text(ctx,row,contentX,y+17+i*31,size,C.text));
  ctx.restore();
}
function erdNode(ctx,x,y,w,h,label,t,at){
 const p=enter(t,at,.7);if(p<=0)return;
 fadeDraw(ctx,p,()=>{const yy=y+(1-p)*17;round(ctx,x,yy,w,h,9,'#FFFFFF','#D8E3EF');round(ctx,x,yy,6,h,[9,0,0,9],C.brand);text(ctx,label,x+16,yy+12,13,C.ink,650);stroke(ctx,x+15,yy+40,x+w-15,yy+40,'#EBEFF5');text(ctx,'id  ·  PK',x+16,yy+47,10,C.muted);});
}
function adminScene(ctx,t){
  const x=112,y=123,h=698;
  const workspaceReveal=enter(t,12.9,1.1);
  // The outer browser itself grows only when the Database Workspace appears.
  const w=lerp(865,1376,workspaceReveal);
  chrome(ctx,x,y,w,h,{client:'ChatGPT',accent:C.chatgpt});
  ctx.save();ctx.beginPath();ctx.roundRect(x+1,y+48,w-2,h-49, [0,0,19,19]);ctx.clip();
  // The familiar chat sidebar is present from the very first frame.
  chatSidebar(ctx,x+1,y+48,228,h-49,'ChatGPT',C.chatgpt);
  const bx=x+246,by=y+65;
  text(ctx,'Design the Acme database',bx+24,by+2,25,C.text,700);
  text(ctx,'Conversation  /  Administration MCP',bx+24,by+40,14,C.muted);
  stroke(ctx,bx+20,by+79,bx+598,by+79,C.border);
  const msgX=bx+28;
  message(ctx,msgX,by+102,540,{who:'user',lines:STORY.conversations.database.initial,now:t,typingStart:1.5,opacity:enter(t,1.3,.4)});
  message(ctx,msgX,by+204,540,{who:'assistant',lines:STORY.conversations.database.firstReply,accent:C.chatgpt,opacity:enter(t,5.1,.7)});
  message(ctx,msgX,by+306,540,{who:'user',lines:STORY.conversations.database.rules,now:t,typingStart:7.7,opacity:enter(t,7.5,.6)});
  message(ctx,msgX,by+408,540,{who:'assistant',lines:STORY.conversations.database.lastReply,accent:C.chatgpt,opacity:enter(t,12.2,.8)});
  const inputY=by+551;
  round(ctx,msgX,inputY,540,56,13,'#FFFFFF','#E2E6EE');text(ctx,'Ask a follow-up…',msgX+20,inputY+18,17,'#9AA6B7');
  circle(ctx,msgX+506,inputY+28,16,'#E8EDF7');text(ctx,'↑',msgX+497,inputY+13,23,C.brand,650);
  const right=x+867;
  // Reveal Database Workspace only AFTER the assistant offers its proposal.
  // Slide in from the right with an eased wipe; nothing is shown during prompts.
  if(workspaceReveal>0){
  ctx.save();
  ctx.globalAlpha*=workspaceReveal;
  ctx.beginPath();
  ctx.rect(right+487*(1-workspaceReveal),by-8,487*workspaceReveal,632);
  ctx.clip();
  round(ctx,right,by-8,487,630,13,'#FCFDFE','#E6EBF3');
  text(ctx,'DATABASE WORKSPACE',right+24,by+17,12,C.muted,750);
  text(ctx,'Acme  /  Accounting model',right+24,by+46,18,C.text,700);
  pill(ctx,t<15.7?'Draft schema':'Applied',right+347,by+13,114,{bg:t<15.7?'#EDF2FA':'#E6F5EE',color:t<15.7?C.brand:C.green,size:12});
  stroke(ctx,right+20,by+92,right+467,by+92,C.border);
  fadeDraw(ctx,enter(t,13.2,.65),()=>{
    text(ctx,'ENTITY RELATIONSHIP DIAGRAM',right+24,by+113,12,C.muted,750);
    const nodes=[
      {label:'Customers',x:0,y:0,at:13.45},{label:'Sales orders',x:1,y:0,at:13.65},
      {label:'Sales invoices',x:1,y:1,at:13.85},{label:'Payments',x:1,y:2,at:14.35},
      {label:'Suppliers',x:0,y:2,at:14.05},{label:'Purchases',x:0,y:3,at:14.25},
      {label:'Purchase invoices',x:1,y:3,at:14.55},{label:'Products',x:0,y:1,at:13.95},
    ];
    // Connection strokes appear before each table card for a build-in effect.
    const coords=(ix,iy)=>({x:right+23+ix*227,y:by+163+iy*92});
    for(const [a,b] of [[0,1],[1,2],[2,3],[4,5],[5,6],[7,1]]){
       const p=enter(t,14.25+(a%3)*.17,.8);if(p<=0)continue;
       const aa=coords(nodes[a].x,nodes[a].y),bb=coords(nodes[b].x,nodes[b].y);
       stroke(ctx,aa.x+96,aa.y+34,lerp(aa.x+96,bb.x+96,p),lerp(aa.y+34,bb.y+34,p),'#C8D4EA',2);
    }
    nodes.forEach(n=>{const p=coords(n.x,n.y);erdNode(ctx,p.x,p.y,206,75,n.label,t,n.at);});
  });
  fadeDraw(ctx,enter(t,15.4,.7),()=>{
    round(ctx,right+23,by+541,441,53,10,t>16?'#E6F5EE':'#EDEFFC');
    text(ctx,t>16?'✓  Database schema applied':'Review migration · 8 tables · 4 access policies',right+43,by+553,14,t>16?C.green:C.brand,650);
  });
  ctx.restore();
  }
  if(t>=14.2&&t<=17.2){
    const p=ease((t-14.2)/1.5);cursor(ctx,lerp(right+420,right+275,p),lerp(by+488,by+563,p),t>15.7&&t<16.7?(t-15.7):0);
  }
  ctx.restore();
  footer(ctx,'Acme administrator · ChatGPT', 'Shared schema and permissions');
}
function footer(ctx,left,right){
  text(ctx,left,116,850,18,C.ink,650);
  text(ctx,right,1480,850,17,C.muted,450,'right');
}
function phone(ctx,x,y,w,h){
  ctx.save();shadow(ctx,36,.17);round(ctx,x,y,w,h,43,'#1D2738','#111A29',3);ctx.restore();
  round(ctx,x+9,y+9,w-18,h-18,35,'#FFFFFF');
  round(ctx,x+w/2-62,y+11,124,19,10,'#1D2738');
}
function purchasingScreen(ctx,t){
 const x=560,y=118,w=454,h=699;phone(ctx,x,y,w,h);
 const sx=x+15,sy=y+39,sw=w-30,sh=h-57;
 ctx.save();ctx.beginPath();ctx.roundRect(sx,sy,sw,sh,23);ctx.clip();
 round(ctx,sx,sy,sw,sh,0,'#FFFCFA');
 text(ctx,'9:41',sx+23,sy+3,14,C.ink,700);text(ctx,'●●●',sx+347,sy+4,10,C.ink);
 const local=t-18;
 // Chat and generated app slide horizontally within the phone.
 const m=enter(local,5.6,1.3),offset=m*sw;
 ctx.save();ctx.translate(-offset,0);
 round(ctx,sx+0,sy+36,sw,58,0,'#FFF8F4');
 circle(ctx,sx+32,sy+66,14,C.claude);text(ctx,'Claude',sx+58,sy+50,20,C.text,700);
 text(ctx,'Acme workspace',sx+25,sy+118,16,C.muted,600);
 message(ctx,sx+20,sy+158,sw-40,{lines:STORY.conversations.purchasing.prompt,who:'user',now:local,typingStart:0.65,size:16,opacity:enter(local,.5,.3)});
 message(ctx,sx+20,sy+279,sw-40,{lines:STORY.conversations.purchasing.reply,accent:C.claude,bg:'#FFF0E8',size:16,opacity:enter(local,3.3,.6)});
 round(ctx,sx+20,sy+550,sw-40,58,16,'#FFF','#E8DED9');text(ctx,'Message Claude…',sx+35,sy+569,16,C.muted);
 ctx.restore();
 ctx.save();ctx.translate(sw-offset,0);
 drawPurchaseApp(ctx,sx,sy,sw,sh,local);
 ctx.restore();
 ctx.restore();
 // Right timeline mirrors app-building steps in a software demo editor.
 fadeDraw(ctx,enter(local,7.2,1.0),()=>{
  infoPanel(ctx,1045,164,410,550,C.claude,{
   label:'CLAUDE · MOBILE WORKFLOW',title:'Invoice capture',steps:[
     ['01','Read supplier invoice'],['02','Extract amount and VAT'],['03','Send for approval']
   ],local:local,offsets:[7.7,8.5,10.4],footer:'No custom backend required'});
 });
 const p=ease((local-8.8)/1.9);
 if(local>8.5){cursor(ctx,lerp(1075,800,p),lerp(562,690,p),local>10.7&&local<11.6?local-10.7:0);}
 footer(ctx,'Purchasing · Claude on mobile','User-built app · Same database rules');
}
function drawPurchaseApp(ctx,x,y,w,h,local){
  round(ctx,x,y,w,h,0,'#FFFFFF');
  round(ctx,x,y+36,w,64,0,'#F6FAF8');
  text(ctx,'‹',x+23,y+45,27,C.green,500);
  text(ctx,'New supplier invoice',x+57,y+52,20,C.text,700);
  pill(ctx,'Acme',x+w-95,y+52,73,{bg:'#E2F2EA',color:C.green,size:13});
  text(ctx,'Capture invoice',x+25,y+119,22,C.text,750);
  text(ctx,'Use your camera or upload a file.',x+25,y+153,15,C.muted);
  const build=enter(local,6.2,2);
  fadeDraw(ctx,build,()=>{
   round(ctx,x+24,y+198,w-48,140,16,'#F5F8FB','#D9E4EF',1.5);
   // camera focus corners
   const sx=x+w/2,sy=y+263;stroke(ctx,sx-25,sy-21,sx-10,sy-21,'#8295AC',3);stroke(ctx,sx-25,sy-21,sx-25,sy-8,'#8295AC',3);
   stroke(ctx,sx+25,sy+21,sx+10,sy+21,'#8295AC',3);stroke(ctx,sx+25,sy+21,sx+25,sy+8,'#8295AC',3);
   round(ctx,sx-13,sy-13,26,26,7,'#D9E5F0');circle(ctx,sx,sy,5,'#8FA5B9');
   text(ctx,'Scan supplier invoice',sx,y+310,14,C.muted,550,'center');
   if(local>8.2&&local<10.1){const cy=lerp(y+202,y+335,(local-8.2)/1.9);stroke(ctx,x+37,cy,x+w-37,cy,'#5EA88E',2);}
  });
  fadeDraw(ctx,enter(local,7.1,1.4),()=>{
   const fields=[['Supplier','Acme Office Supplies'],['Invoice amount','€428.50'],['VAT','21%']];
   fields.forEach(([label,v],i)=>{
      const at=7.2+i*.35;const o=enter(local,at,.65);fadeDraw(ctx,o,()=>{
       const fy=y+355+i*71;round(ctx,x+24,fy,w-48,64,10,'#FFFFFF','#E0E6EE');
       text(ctx,label,x+39,fy+9,12,C.muted,500);text(ctx,v,x+39,fy+28,17,C.ink,650);
      });
   });
   round(ctx,x+24,y+587,w-48,48,12,local>11.2?'#E4F4EA':C.green);
   text(ctx,local>11.2?'✓  Sent for approval':'Send for approval',x+w/2,y+598,16,local>11.2?C.green:'#FFFFFF',700,'center');
  });
}
function infoPanel(ctx,x,y,w,h,accent,{label,title,steps,local,offsets,footer:foot}){
 round(ctx,x,y,w,h,18,'#FFFFFF','#E0E6EE');
 pill(ctx,label,x+25,y+26,w-50,{bg:'#F4F6FA',color:accent,size:13});
 text(ctx,title,x+28,y+89,28,C.text,750);
 text(ctx,'BUILD PROGRESS',x+29,y+153,12,C.muted,700);
 steps.forEach(([n,name],i)=>{
   const done=enter(local,offsets[i],.8), yy=y+196+i*85;
   circle(ctx,x+42,yy+18,20,done>.9?'#E4F3EA':'#EDF1F6');
   text(ctx,done>.9?'✓':n,x+42,yy+7,15,done>.9?C.green:C.muted,700,'center');
   text(ctx,name,x+78,yy+6,17,C.ink,550);
   stroke(ctx,x+78,yy+35,x+w-30,yy+35,C.border,1.4);
 });
 round(ctx,x+28,y+h-82,w-56,49,12,'#F4F7FC');
 text(ctx,foot,x+45,y+h-68,15,C.brand,600);
}
function laptopFrame(ctx,x,y,w,h,client,accent){
  chrome(ctx,x,y,w,h,{client,accent});
  ctx.save();shadow(ctx,26,.10);round(ctx,x-25,y+h-4,w+50,27,[5,5,20,20],'#C8D1DE');round(ctx,x+w/2-78,y+h-2,156,10,[0,0,10,10],'#9CAABD');ctx.restore();
}
function quotePreview(ctx,x,y,w,h,local){
 round(ctx,x,y,w,h,0,'#FFFFFF');
 text(ctx,'Sales  /  New quote',x+28,y+26,21,C.ink,700);
 pill(ctx,local>11.2?'Order created':'Draft',x+w-145,y+23,115,{bg:local>11.2?'#E5F5EB':'#EFF2FB',color:local>11.2?C.green:C.brand,size:13});
 stroke(ctx,x+20,y+78,x+w-20,y+78,C.border);
 text(ctx,'Customer',x+35,y+110,13,C.muted,650);
 round(ctx,x+30,y+136,w-60,55,10,'#FAFBFD','#E3E8F0');text(ctx,'Northstar Retail',x+49,y+153,18,C.ink,650);
 text(ctx,'Products and quantities',x+35,y+230,16,C.ink,700);
 const rows=[['Oak desk chair','4','€196.00'],['LED task lamp','2','€88.00'],['Shipping','1','€24.00']];
 rows.forEach(([a,b,c],i)=>{fadeDraw(ctx,enter(local,5.5+i*.6,.7),()=>{
  const yy=y+270+i*72;round(ctx,x+30,yy,w-60,64,10,i%2?'#FFFFFF':'#F8FAFD','#E9EDF4');
  text(ctx,a,x+49,yy+19,17,C.ink,600);text(ctx,b,x+w-204,yy+19,17,C.muted,600);text(ctx,c,x+w-130,yy+19,17,C.ink,650);
 });});
 fadeDraw(ctx,enter(local,8.0,.7),()=>{
  stroke(ctx,x+30,y+507,x+w-30,y+507,C.border);
  text(ctx,'Total',x+35,y+528,16,C.muted,550);text(ctx,'€896.00',x+w-35,y+521,28,C.ink,750,'right');
  round(ctx,x+w-245,y+592,215,50,11,local>11.2?'#E7F4EB':'#4D68B2');
  text(ctx,local>11.2?'✓  Order created':'Convert to sales order',x+w-136,y+605,15,local>11.2?C.green:'#FFFFFF',700,'center');
 });
}
function appNavigation(ctx,x,y,w,h,local,items,accent){
 const progress=enter(local,4.25,1.1);
 if(progress<=0)return 0;
 const visibleWidth=168*progress;
 ctx.save();ctx.beginPath();ctx.rect(x,y,visibleWidth,h);ctx.clip();
 ctx.globalAlpha*=progress;
 round(ctx,x,y,168,h,0,'#F3F5FA');
 stroke(ctx,x+167,y,x+167,y+h,'#DDE4EF');
 text(ctx,'ACME',x+20,y+25,15,C.ink,750);
 text(ctx,'Workspace',x+20,y+53,12,C.muted,500);
 items.forEach((item,i)=>{
   const yy=y+109+i*52;
   if(i===0)round(ctx,x+11,yy-8,146,40,10,'#E2E9F7');
   circle(ctx,x+28,yy+11,4,i===0?accent:'#A9B5C7');
   text(ctx,item,x+43,yy,14,i===0?C.ink:C.muted,i===0?700:500);
 });
 ctx.restore();
 return visibleWidth;
}
function salesScene(ctx,t){
 const local=t-31,x=108,y=138,h=670;
 const split=enter(local,4.4,1.15);
 const w=lerp(650,1384,split);
 laptopFrame(ctx,x,y,w,h,'Gemini',C.gemini);
 ctx.save();ctx.beginPath();ctx.roundRect(x+1,y+47,w-2,h-49,[0,0,19,19]);ctx.clip();
 const ly=y+47,rh=h-49;
 const leftWidth=lerp(648,466,split);
 // Construct the right panel under the moving chat panel, revealing it
 // only as the agent expands the workspace.
 if(split>0){
   const appX=x+leftWidth+2,appW=w-leftWidth-3;
   ctx.save();ctx.beginPath();ctx.rect(x+leftWidth,ly,w-leftWidth,rh);ctx.clip();
   fadeDraw(ctx,split,()=>{
     if(appW>200){
       const nav=appNavigation(ctx,appX,ly,appW,rh,local,['Quotes','Customers','Orders','Products'],C.gemini);
       quotePreview(ctx,appX+nav,ly,appW-nav,rh,local);
     }
   });
   ctx.restore();
 }
 ctx.save();ctx.beginPath();ctx.rect(x,ly,leftWidth,rh);ctx.clip();
 round(ctx,x,ly,leftWidth,rh,0,'#F9FAFF');
 stroke(ctx,x+leftWidth,ly,x+leftWidth,ly+rh,C.border);
 circle(ctx,x+42,ly+42,16,C.gemini);text(ctx,'Gemini',x+70,ly+27,21,C.text,700);
 text(ctx,'Acme · Sales',x+29,ly+91,15,C.muted,600);
 const msgWidth=lerp(560,416,split);
 message(ctx,x+24,ly+137,msgWidth,{lines:STORY.conversations.sales.prompt,who:'user',now:local,typingStart:.75,size:16,opacity:enter(local,.5,.45)});
 message(ctx,x+24,ly+258,msgWidth,{lines:STORY.conversations.sales.reply,accent:C.gemini,bg:'#ECEEFF',size:16,opacity:enter(local,3.1,.6)});
 round(ctx,x+24,ly+509,msgWidth,56,11,'#FFFFFF','#E2E7EE');text(ctx,'Ask Gemini…',x+47,ly+529,17,C.muted);
 ctx.restore();
 ctx.restore();
 if(local>9.0&&local<12.3){const p=ease((local-9.0)/1.8);cursor(ctx,lerp(1040,1334,p),lerp(572,736,p),local>11.05&&local<11.9?local-11.05:0);}
 footer(ctx,'Sales · Gemini on laptop','From quotation to sales order');
}
function financePreview(ctx,x,y,w,h,local){
  round(ctx,x,y,w,h,0,'#FFFFFF');
  text(ctx,'Finance overview',x+30,y+25,26,C.ink,730);
  text(ctx,'Acme · Finance',x+31,y+61,14,C.muted);
  const cards=[['Invoices pending','12'],['Auto-approved','28'],['To reconcile','€4,860']];
  cards.forEach(([label,value],i)=>fadeDraw(ctx,enter(local,3.8+i*.3,.8),()=>{
   const ww=(w-88)/3, xx=x+26+i*(ww+18);
   round(ctx,xx,y+103,ww,108,13,'#FBFCFE','#E0E7F0');
   text(ctx,label,xx+17,y+123,13,C.muted,550);text(ctx,value,xx+17,y+155,29,C.ink,760);
  }));
  fadeDraw(ctx,enter(local,5.2,.8),()=>{
    text(ctx,'Approval queue',x+31,y+244,19,C.ink,700);
    const entries=[['PI-1042','Blue Harbor Supplies','€740.00'],['PI-1041','Acme Office Supplies','€428.50'],['PI-1040','North Dock Logistics','€1,240.00']];
    entries.forEach(([code,label,value],i)=>fadeDraw(ctx,enter(local,5.5+i*.3,.6),()=>{
       const yy=y+280+i*68;round(ctx,x+27,yy,w-54,60,9,i%2?'#FFFFFF':'#F9FAFD','#EBEFF5');
       text(ctx,code,x+42,yy+17,14,C.muted,700);text(ctx,label,x+145,yy+15,16,C.ink,570);
       text(ctx,value,x+w-262,yy+15,16,C.ink,650);
       pill(ctx,i===1?'Auto-approved':(local>9.2&&i===0?'Approved':'Review'),x+w-145,yy+12,115,{bg:i===1||local>9.2&&i===0?'#E8F5ED':'#EFF2FB',color:i===1||local>9.2&&i===0?C.green:C.brand,size:12});
    }));
    text(ctx,'Bank reconciliation',x+31,y+516,19,C.ink,700);
    round(ctx,x+28,y+551,w-56,58,9,'#F5F7FB','#E7EBF2');
    text(ctx,'Bank transfer · Northstar Retail',x+44,y+569,15,C.ink,600);
    pill(ctx,local>10.7?'Matched':'Match',x+w-155,y+563,122,{bg:local>10.7?'#E5F5EC':'#E9EFFB',color:local>10.7?C.green:C.blue,size:12});
  });
}
function financeScene(ctx,t){
 const local=t-44,x=108,y=125,h=682;
 const split=enter(local,3.9,1.1);
 const w=lerp(650,1383,split);
 chrome(ctx,x,y,w,h,{client:'ChatGPT',accent:C.chatgpt});
 ctx.save();ctx.beginPath();ctx.roundRect(x+1,y+48,w-2,h-49,[0,0,19,19]);ctx.clip();
 const ly=y+48,rh=h-49;
 const leftWidth=lerp(648,390,split);
 if(split>0){
   const appX=x+leftWidth+1,appW=w-leftWidth-3;
   ctx.save();ctx.beginPath();ctx.rect(x+leftWidth,ly,w-leftWidth,rh);ctx.clip();
   fadeDraw(ctx,split,()=>{
     if(appW>200){
       const nav=appNavigation(ctx,appX,ly,appW,rh,local,['Overview','Approvals','Payments','Reports'],C.chatgpt);
       financePreview(ctx,appX+nav,ly,appW-nav,rh,local);
     }
   });
   ctx.restore();
 }
 ctx.save();ctx.beginPath();ctx.rect(x,ly,leftWidth,rh);ctx.clip();
 round(ctx,x,ly,leftWidth,rh,0,'#F8FAFC');
 stroke(ctx,x+leftWidth,ly,x+leftWidth,ly+rh,C.border);
 circle(ctx,x+39,ly+44,16,C.chatgpt);text(ctx,'ChatGPT',x+70,ly+31,21,C.ink,700);
 text(ctx,'Finance · Acme workspace',x+27,ly+96,15,C.muted,600);
 const msgWidth=lerp(560,342,split);
 message(ctx,x+24,ly+150,msgWidth,{who:'user',lines:STORY.conversations.finance.prompt,now:local,typingStart:.7,size:16,opacity:enter(local,.5,.35)});
 message(ctx,x+24,ly+273,msgWidth,{who:'assistant',lines:STORY.conversations.finance.reply,accent:C.chatgpt,bg:'#E6F5ED',size:16,opacity:enter(local,2.5,.7)});
 ctx.restore();
 ctx.restore();
 if(local>8.2&&local<11.2){const p=ease((local-8.2)/1.8);cursor(ctx,lerp(1195,1390,p),lerp(485,501,p),local>9.1&&local<10.0?local-9.1:0);}
 footer(ctx,'Finance · ChatGPT on desktop','Approve invoices · Reconcile payments');
}
function finalScene(ctx,t){
  const local=t-56;
  text(ctx,'ONE DATABASE. YOUR WAY OF WORKING.',800,137,31,C.ink,800,'center');
  text(ctx,'Different applications, same data and security rules.',800,188,21,C.muted,400,'center');
  // Draw an overview of devices, each using its own custom interface.
  const cards=[
   {x:134,y:284,w:375,h:295,title:'Purchasing',accent:C.claude,sub:'Mobile invoice capture'},
   {x:612,y:283,w:375,h:295,title:'Sales',accent:C.gemini,sub:'Quotation → order'},
   {x:1090,y:284,w:375,h:295,title:'Finance',accent:C.chatgpt,sub:'Approval + reconciliation'}
  ];
  cards.forEach((card,i)=>fadeDraw(ctx,enter(local,.1+i*.3,.7),()=>{
    ctx.save();shadow(ctx,14,.06);round(ctx,card.x,card.y,card.w,card.h,17,'#FFFFFF','#DEE6EF');ctx.restore();
    round(ctx,card.x,card.y,card.w,63,[17,17,0,0],'#F8F9FC');circle(ctx,card.x+37,card.y+32,12,card.accent);
    text(ctx,card.title,card.x+62,card.y+18,21,C.ink,750);
    text(ctx,card.sub,card.x+24,card.y+91,16,C.muted);
    const xx=card.x+25,yy=card.y+141;
    for(let r=0;r<3;r++){round(ctx,xx,yy+r*37,card.w-50,27,6,r%2?'#F3F6FA':'#EAF0F7');round(ctx,xx+13,yy+r*37+9,112+r*22,8,4,r===0?card.accent:'#C8D4E3');}
  }));
  const dbX=560,dbY=650;
  fadeDraw(ctx,enter(local,1.3,.7),()=>{
   for(const [xx] of [[324],[800],[1277]]){stroke(ctx,xx,580,xx,622,'#B9C7DF',2);stroke(ctx,xx,622,800,622,'#B9C7DF',2);}
   stroke(ctx,800,622,800,643,'#B9C7DF',2);
   round(ctx,dbX,dbY,480,97,17,'#E9EFF8','#CBD7E9');
   brandMark(ctx,dbX+48,dbY+47,23,C.brand);
   text(ctx,'ACME · PostgreSQL',dbX+88,dbY+24,24,C.ink,750);
   text(ctx,'Shared records  ·  Permissions  ·  Rules',dbX+88,dbY+59,16,C.muted,550);
  });
  text(ctx,'AXIOMONY',800,796,17,C.brand,750,'center');
  footer(ctx,'Acme · Three teams, three experiences','One shared database');
}
const paint={database:adminScene,purchasing:purchasingScreen,sales:salesScene,finance:financeScene,final:finalScene};
/** Render a frame for absolute time `seconds` (0 .. 60). Can be called at any FPS. */
export function renderFrame(ctx,seconds,{width=1920,height=1080}={}){
 const t=clamp(seconds,0,STORY.duration-.0001);
 ctx.save();ctx.setTransform(width/STORY.width,0,0,height/STORY.height,0,0);
 backdrop(ctx);
 const current=STORY.phases.findIndex(p=>t>=p.start&&t<p.end);
 const index=current<0?STORY.phases.length-1:current;
 const phase=STORY.phases[index];
 // At each chapter boundary, crossfade from the previous scene. All animation
 // remains deterministic for frame-perfect regeneration and story edits.
 if(index>0&&t-phase.start<.6){
   const k=ease((t-phase.start)/.6);
   ctx.save();ctx.globalAlpha=1-k;paint[STORY.phases[index-1].id](ctx,STORY.phases[index-1].end-.01);ctx.restore();
   ctx.save();ctx.globalAlpha=k;paint[phase.id](ctx,t);ctx.restore();
 } else paint[phase.id](ctx,t);
 topBar(ctx,t,phase);
 ctx.restore();
}