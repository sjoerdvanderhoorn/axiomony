/**
 * Rebuild the Acme demonstration from the same JavaScript scenes as the
 * interactive GitHub Pages preview.
 *
 * Run from the repository root:
 *   npm --prefix demo/acme install
 *   npm --prefix demo/acme run render
 *
 * Dependencies: Node.js 22+, skia-canvas, and FFmpeg available in PATH.
 * Optional: --fps 30 --width 1920 --height 1080 --preview-only
 *
 * Outputs:
 *   docs/assets/acme-software-demo.mp4  (1920×1080 / 30fps / 60s)
 *   docs/assets/acme-walkthrough.gif    (small animated README preview)
 *   docs/assets/acme-poster.webp       (thumbnail for the website)
 */
import {Canvas} from 'skia-canvas';
import {renderFrame,STORY} from '../../docs/demo/acme.js';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

const base=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const outDir=resolve(base,'docs/assets');
const arg=(key,def)=>{const i=process.argv.indexOf(key);return i<0?def:Number(process.argv[i+1]);};
const fps=arg('--fps',30),width=arg('--width',1920),height=arg('--height',1080);
const previewOnly=process.argv.includes('--preview-only');
if(!Number.isInteger(fps)||fps<10||fps>60||!Number.isInteger(width)||width<640||!Number.isInteger(height)||height<360||width/height!==16/9)throw Error('Use an integer FPS 10–60 and a 16:9 resolution.');
if(spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0)throw Error('FFmpeg is required on PATH.');
await mkdir(outDir,{recursive:true});
const video=resolve(outDir,'acme-software-demo.mp4');
const gif=resolve(outDir,'acme-walkthrough.gif');
const poster=resolve(outDir,'acme-poster.webp');
const canvas=new Canvas(width,height),ctx=canvas.getContext('2d');
renderFrame(ctx,15.5,{width,height});
await writeFile(poster,await canvas.toBuffer('webp',{quality:0.88}));
if(!previewOnly){
  const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0',
    '-an','-c:v','libx264','-preset','veryfast','-crf','21',
    '-pix_fmt','yuv420p','-movflags','+faststart',video],{stdio:['pipe','inherit','inherit']});
  ff.stdin.on('error',err=>{if(err.code!=='EPIPE')console.error(err);});
  const total=Math.round(STORY.duration*fps);
  console.log(`Rendering ${total} frames at ${width}×${height}, ${fps} fps ...`);
  for(let n=0;n<total;n++){
    renderFrame(ctx,n/fps,{width,height});
    const bytes=await canvas.toBuffer('jpg',{quality:.86});
    if(!ff.stdin.write(bytes))await once(ff.stdin,'drain');
    if((n+1)%Math.max(1,Math.round(fps*5))===0)console.log(`Rendered ${Math.round((n+1)/fps)} / ${STORY.duration} seconds`);
  }
  ff.stdin.end();
  const [code]=await once(ff,'close');
  if(code!==0)throw Error(`FFmpeg video encoding exited ${code}`);
}
if(!previewOnly){
  console.log('Creating a compact animated GIF for GitHub README ...');
  const filter='fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',video,'-filter_complex',filter,'-loop','0',gif],{encoding:'utf8'});
  if(r.status!==0)throw Error(`GIF export failed: ${r.stderr}`);
}
console.log(`Assets saved to ${outDir}`);