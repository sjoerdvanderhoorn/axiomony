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
  for(const label of labels)assert.doesNotMatch(label,/AI-BUILT BUSINESS TOOLS|CONCEPT DEMO|One shared database|Acme workspace|Acme · Sales|Finance · Acme workspace|PostgreSQL|AXIOMONY/i);
});
