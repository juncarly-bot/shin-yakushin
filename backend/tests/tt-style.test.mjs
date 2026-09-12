import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIReaction,DEFAULT_MODEL} from '../backend/openai-client.mjs';

function okResponse(text='承知しました。'){
 return {
  ok:true,
  status:200,
  headers:{get:name=>name.toLowerCase()==='content-type'?'application/json':null},
  async json(){return {status:'completed',model:DEFAULT_MODEL,output_text:JSON.stringify({text,emotion:'calm',event:'conversation'}),output:[],usage:{output_tokens:8,output_tokens_details:{reasoning_tokens:0}}}}
 };
}

test('TT remote prompt requires natural desu-masu speech',async()=>{
 let requestBody=null;
 const fetchImpl=async(_url,init)=>{requestBody=JSON.parse(init.body);return okResponse()};
 const result=await createOpenAIReaction({speaker:'NurseT',userMessage:'明日はグリフィスをやります',context:{}},{apiKey:'test-key',fetchImpl,model:DEFAULT_MODEL});
 assert.equal(result.text,'承知しました。');
 assert.match(requestBody.instructions,/です・ます/);
 assert.match(requestBody.instructions,/〜しますか？/);
 assert.match(requestBody.instructions,/〜でよいですか？/);
 assert.match(requestBody.instructions,/過剰に堅い敬語にはせず/);
});

test('SAYO remote prompt stays casual and distinct from TT',async()=>{
 let requestBody=null;
 const fetchImpl=async(_url,init)=>{requestBody=JSON.parse(init.body);return okResponse('いいね。')};
 await createOpenAIReaction({speaker:'SAYO',userMessage:'明日は勉強したい',context:{}},{apiKey:'test-key',fetchImpl,model:DEFAULT_MODEL});
 assert.match(requestBody.instructions,/小夜\/SAYO/);
 assert.match(requestBody.instructions,/親しみ/);
 assert.doesNotMatch(requestBody.instructions,/必ず「です・ます」調/);
});
