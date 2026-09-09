import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIReaction,RemoteAIError,sanitizeRequest} from '../backend/openai-client.mjs';
import {createServer} from '../backend/server.mjs';
import worker from '../backend/cloudflare-worker.mjs';

const request={speaker:'SAYO',userMessage:'昨日の続きやる',context:{conversation:{currentTopic:'グリフィス'},selectedMemory:[]}};

test('backend sends Responses request with server secret and store false',async()=>{
 let captured;
 const result=await createOpenAIReaction(request,{apiKey:'server-test-secret',model:'test-model',fetchImpl:async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({output:[{content:[{text:JSON.stringify({text:'昨日のグリフィスだね。','emotion':'focused','event':'conversation'})}]}]})}}});
 assert.equal(captured.url,'https://api.openai.com/v1/responses');
 assert.equal(captured.options.headers.Authorization,'Bearer server-test-secret');
 const body=JSON.parse(captured.options.body);
 assert.equal(body.store,false);assert.equal(body.model,'test-model');
 assert.equal(result.text,'昨日のグリフィスだね。');
});

test('backend is unavailable without OPENAI_API_KEY',async()=>{
 await assert.rejects(()=>createOpenAIReaction(request,{apiKey:'',fetchImpl:async()=>assert.fail()}),error=>error instanceof RemoteAIError&&error.code==='remote_not_configured');
});

test('backend validates bounded speaker and request',()=>{
 assert.throws(()=>sanitizeRequest({...request,speaker:'USER'}));
 assert.throws(()=>sanitizeRequest({...request,context:{oversized:'x'.repeat(70_000)}}));
});

test('HTTP backend health does not reveal the secret and reaction errors are safe',async()=>{
 const server=createServer({apiKey:'server-only',fetchImpl:async()=>({ok:false,status:401,json:async()=>({secret:'never return'})})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const health=await (await fetch(base+'/healthz')).json();assert.deepEqual(health,{ok:true,remoteAvailable:true});
  const response=await fetch(base+'/v1/reactions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
  const body=await response.text();assert.equal(response.status,503);assert.equal(body.includes('server-only'),false);assert.equal(body.includes('never return'),false);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('Cloudflare Worker uses only its secret binding and returns the same contract',async()=>{
 const original=globalThis.fetch;let captured;
 globalThis.fetch=async(url,options)=>{captured={url,options};return new Response(JSON.stringify({output:[{content:[{text:JSON.stringify({text:'続きをやろう。',emotion:'focused',event:'conversation'})}]}]}),{status:200,headers:{'content-type':'application/json'}})};
 try{
  const response=await worker.fetch(new Request('https://worker.example/v1/reactions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)}),{OPENAI_API_KEY:'worker-secret',OPENAI_MODEL:'test-model'});
  assert.equal(response.status,200);assert.equal((await response.json()).reaction.text,'続きをやろう。');
  assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.options.headers.authorization,'Bearer worker-secret');assert.equal(JSON.parse(captured.options.body).store,false);
 }finally{globalThis.fetch=original}
});

test('Cloudflare Worker missing secret is a safe LocalRules-triggering 503',async()=>{
 const response=await worker.fetch(new Request('https://worker.example/v1/reactions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)}),{});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,error:'remote_not_configured'});
});
