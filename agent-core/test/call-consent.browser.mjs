// Local-only smoke: actual three entry pages, stub providers, synthetic camera.
// Never calls production services or consumes an avatar session.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {execSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const headerText=await readFile(resolve(root,'_headers'),'utf8');
const policy=headerText.match(/  Permissions-Policy: (.+)/)[1].trim();
const csp=headerText.match(/  Content-Security-Policy: (.+)/)[1].trim();
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root.replace(/\/$/,'')+sep))throw Error('path');const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream','Permissions-Policy':policy,'Content-Security-Policy':csp});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||execSync('command -v chromium').toString().trim(),headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const checks=[];const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name);};
const fakeConfig=`export const AGENT_PROVIDER_CONFIG={avatarProvider:'test-only'};
export async function createProviders(overrides={}){
 const c=window.__testCalls;c.providers++;const handlers={};
 return {config:{avatarProvider:'test-only'},avatar:{init:async()=>{},on:(name,fn)=>{handlers[name]=fn;},connect:async()=>{if(window.__connectDelay)await new Promise(r=>setTimeout(r,window.__connectDelay));},disconnect:async()=>{c.disconnect++;},stopSpeaking(){},setEmotion(){},setListening(){},speak:async h=>{await h?.done;}},stt:{isSupported:()=>true,start:()=>{c.stt++;},stop(){}},tts:{speak:()=>({done:Promise.resolve(),stop(){}})},llm:{greet:async()=>({replyText:'Synthetic test greeting'}),respond:async()=>({replyText:'Synthetic test reply'})}};
}`;
try{
 for(const width of [1440,390])for(const entry of ['index.html','admin.html','portal.html']){
  const label=`${entry} ${width}`;
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(()=>{window.__testCalls={providers:0,stt:0,disconnect:0};window.__streams=[];window.__mediaConstraints=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{window.__mediaConstraints.push(c);const s=await original(c);window.__streams.push(s);return s;};});
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/agent-core/config.js')return route.fulfill({status:200,contentType:'text/javascript',body:fakeConfig});return route.continue();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
  await page.goto(`${origin}/${entry}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.veraliq-call-consent',{state:'attached'});
  check(`${label}: no initial provider/media`,await page.evaluate(()=>__testCalls.providers===0&&__mediaConstraints.length===0));
  if(entry!=='index.html')await page.locator('#agentBubble').click();
  await page.locator('#agentStartBtn').click();
  await page.waitForSelector('dialog[open]');
  check(`${label}: consent required`,await page.locator('[data-confirm]').isDisabled());
  check(`${label}: consent fits screen`,await page.locator('dialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}));
  if(entry==='index.html')await page.screenshot({path:`/data/veraliq-consent-${width}.png`});
  await page.keyboard.press('Escape');
  check(`${label}: cancel starts nothing`,await page.evaluate(()=>__testCalls.providers===0&&__mediaConstraints.length===0));
  await page.locator('#agentStartBtn').click();
  await page.locator('[data-accept]').check();
  await page.locator('[data-camera]').check();
  await page.locator('[data-confirm]').click();
  await page.waitForFunction(()=>document.querySelector('.veraliq-camera-tray video').srcObject!==null&&document.querySelector('#agentStatusDot').classList.contains('live'));
  check(`${label}: local video only`,await page.evaluate(()=>__mediaConstraints.length===1&&__mediaConstraints[0].audio===false&&__testCalls.stt===0));
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('veraliq:langchange',{detail:{lang:'en'}})));
  check(`${label}: language cannot open microphone`,await page.evaluate(()=>__testCalls.stt===0));
  await page.locator('#agentJoinBtn').click();
  check(`${label}: explicit join starts STT`,await page.evaluate(()=>__testCalls.stt===1));
  await page.locator('.veraliq-camera-tray button').click();
  check(`${label}: camera off releases tracks`,await page.evaluate(()=>__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
  await page.locator('.veraliq-camera-tray button').click();
  await page.waitForFunction(()=>document.querySelector('.veraliq-camera-tray video').srcObject!==null);
  await page.locator('#agentCloseBtn').click();
  check(`${label}: close releases camera`,await page.evaluate(()=>__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
  await page.locator('#agentReopenBtn').click();
  await page.locator('#agentStartBtn').click();
  check(`${label}: reopen requires fresh consent`,await page.locator('[data-confirm]').isDisabled());
  await page.keyboard.press('Escape');
  check(`${label}: no JavaScript exceptions`,errors.length===0);
  await context.close();
 }
 // Native mobile app is not in this archive: mobile web above, not iOS/Android native.
 await writeFile(resolve(root,'agent-core/test/call-consent-browser-results.json'),JSON.stringify({passed:checks.length,checks,scope:'Local pages with actual CSP/Permissions-Policy; provider stubs and synthetic camera; all external network blocked'},null,2));
 console.log(`${checks.length} browser checks passed.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
