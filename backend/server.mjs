import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore,ApiError } from './store.mjs';

export function createApi(store,{origins=['https://cskyl.github.io','http://localhost:4178','http://127.0.0.1:4178'],rateLimit=true}={}) {
  const limits=new Map();
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Vary','Origin');
    const reply=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    const origin=req.headers.origin;if(origin&&!origins.includes(origin)){reply(403,{error:'这个网页地址不在允许的访问范围。'});return;}
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Max-Age','600');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/health'&&req.method==='GET'){reply(200,{ok:true,service:'together-home',version:1});return;}
    if(!['/v1/create','/v1/join','/v1/snapshot','/v1/action','/v1/invite'].includes(path)||req.method!=='POST'){reply(404,{error:'未找到这个接口。'});return;}
    try{
      if(rateLimit){const identity=String(req.headers['cf-connecting-ip']||req.socket.remoteAddress),now=Date.now(),entry=limits.get(identity)||{since:now,count:0};if(now-entry.since>60000){entry.since=now;entry.count=0;}entry.count++;if(limits.size>5000)limits.clear();limits.set(identity,entry);if(entry.count>180)throw new ApiError('操作太频繁，请稍后再试。',429);}
      if(!req.headers['content-type']?.startsWith('application/json'))throw new ApiError('请求需要 JSON 格式。',415);
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768)throw new ApiError('请求内容过大。',413);chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{throw new ApiError('请求格式不正确。');}
      const token=req.headers.authorization?.replace(/^Bearer /,'');
      const method=path.slice(4);const result=store[method](token,body);reply(200,result);
    }catch(e){const status=e instanceof ApiError?e.status:e.message?.match(/学习|分钟|存档|资金|全部建成|先记录/)?400:500;reply(status,{error:status===500?'服务器暂时无法处理，请稍后重试。':e.message});if(status===500)console.error('API error:',e.code||e.name);}
  });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dbPath=resolve(process.env.HOME_DB_PATH||'data/home.sqlite');mkdirSync(dirname(dbPath),{recursive:true});
  const store=createStore(dbPath),server=createApi(store),port=Number(process.env.HOME_API_PORT||4180);
  server.listen(port,'127.0.0.1',()=>console.log(`Together Home API listening on http://127.0.0.1:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
}
