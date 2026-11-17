import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Canvas,loadImage} from 'skia-canvas';
import {fileURLToPath} from 'node:url';
import {prepareAssets,renderFrame,WORDMARK_URL} from '../../docs/demo/acme.js';

test('all scenes omit removed labels and render the original SVG wordmark',async()=>{
  assert.ok(WORDMARK_URL.pathname.endsWith('/docs/assets/axiomony-wordmark.svg'));
  const image=await loadImage(fileURLToPath(WORDMARK_URL));
  await prepareAssets(async url=>{assert.equal(url,WORDMARK_URL);return image;});
  const canvas=new Canvas(640,360),real=canvas.getContext('2d');
  const labels=[],images=[];
  const ctx=new Proxy(real,{
    get(target,key){
      if(key==='fillText')return (label,...args)=>{labels.push(label);return target.fillText(label,...args);};
      if(key==='drawImage')return (asset,...args)=>{images.push(asset);return target.drawImage(asset,...args);};
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    },
    set(target,key,value){target[key]=value;return true;}
  });
  for(let t=0;t<60;t+=.5){
    const before=images.length;
    renderFrame(ctx,t,{width:640,height:360});
    assert.ok(images.length>before,`Missing header SVG at ${t}s`);
    if(t>=57)assert.ok(images.length-before>=2,'Final scene also needs SVG');
  }
  assert.ok(images.every(asset=>asset===image),'Only the original loaded SVG is drawn');
  for(const label of labels)assert.doesNotMatch(label,/AI-BUILT BUSINESS TOOLS|CONCEPT DEMO|One shared database|Acme workspace|Acme · Sales|Finance · Acme workspace|PostgreSQL|AXIOMONY|Three teams, three experiences|^\d{2}:\d{2}\s+\/\s+01:00$/i);
});


test('cursor tip lands at the visible button center for every action',async()=>{
  await prepareAssets(url=>loadImage(fileURLToPath(url)));
  for(const [seconds,label] of [[16.2,'Database schema applied'],[29.4,'Sent for approval'],[42.4,'Order created'],[53.35,'Approved'],[54.85,'Matched']]){
    const real=new Canvas(1600,900).getContext('2d');
    let lastRect,target,tip;
    const ctx=new Proxy(real,{
      get(object,key){
        if(key==='roundRect')return (x,y,w,h,...args)=>{
          const m=object.getTransform();
          lastRect={x:m.a*x+m.e,y:m.d*y+m.f,w:m.a*w,h:m.d*h};
          return object.roundRect(x,y,w,h,...args);
        };
        if(key==='fillText')return (value,...args)=>{
          if(String(value).includes(label))target=lastRect;
          return object.fillText(value,...args);
        };
        if(key==='moveTo')return (x,y)=>{
          if(x===0&&y===0){const m=object.getTransform();tip={x:m.e,y:m.f};}
          return object.moveTo(x,y);
        };
        const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;
      },
      set(object,key,value){object[key]=value;return true;}
    });
    renderFrame(ctx,seconds,{width:1600,height:900});
    assert.ok(target,`Missing ${label} button at ${seconds}s`);
    assert.ok(tip,`Missing cursor at ${seconds}s`);
    assert.ok(Math.abs(tip.x-target.x-target.w/2)<.001,`${label}: cursor x must match button center`);
    assert.ok(Math.abs(tip.y-target.y-target.h/2)<.001,`${label}: cursor y must match button center`);
    assert.ok(target.y+target.h<820,`${label}: button must fit inside its window`);
  }
});
