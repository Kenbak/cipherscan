const test=require('node:test'), assert=require('node:assert/strict'), express=require('express');
const {once}=require('node:events'); const createV1Router=require('../../v1');
test('paid routes retain authentication and payment challenges without internal-key bypass or shared caching',async t=>{
 const source=express();const received=[];
 source.get('/api/signals/latest',(req,res)=>{
  received.push(req.headers);
  res.set('Cache-Control','public, max-age=60');
  if(req.headers.authorization==='Bearer test-session')return res.set('X-Session-Balance','2').json({current:{composite:0}});
  if(req.headers['payment-signature']==='test-proof')return res.set('Payment-Response','receipt').json({current:{composite:42}});
  res.set('Payment-Required','challenge').set('WWW-Authenticate','Payment example').status(402).json({x402Version:2,accepts:[]});
 });
 const upstream=source.listen(0,'127.0.0.1');await once(upstream,'listening');
 const router=createV1Router({API_V1_ENABLED:'true',API_V1_LAUNCHED:'true',NEXT_PUBLIC_NETWORK:'mainnet',V1_INTERNAL_SERVICE_KEY:'must-not-bypass',V1_INTERNAL_API_BASE_URL:`http://127.0.0.1:${upstream.address().port}`});
 const app=express();app.locals.chainTip={height:42};app.use('/v1',router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{router.__stopRateLimiters();server.closeAllConnections();upstream.closeAllConnections();server.close();upstream.close();});
 const get=headers=>fetch(`http://127.0.0.1:${server.address().port}/v1/signals/latest`,{headers});
 const missing=await get({Cookie:'must-not-forward'}); assert.equal(missing.status,402);assert.equal(missing.headers.get('payment-required'),'challenge');assert.equal(missing.headers.get('cache-control'),'no-store');assert.equal((await missing.json()).paymentRequired.x402Version,2);
 const session=await get({Authorization:'Bearer test-session'});assert.equal(session.status,200);assert.equal(session.headers.get('x-session-balance'),'2');assert.equal(session.headers.get('cache-control'),'private, no-store');assert.equal((await session.json()).data.current.composite,0);
 const paid=await get({'Payment-Signature':'test-proof'});assert.equal(paid.headers.get('payment-response'),'receipt');assert.equal(paid.status,200);
 assert(received.every(h=>!h['x-service-key']&&!h.cookie));
});
