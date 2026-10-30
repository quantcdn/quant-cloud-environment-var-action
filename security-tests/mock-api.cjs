// Isolated contract fixture: never reads real credentials or contacts Cloud APIs.
const http = require('node:http');
const variables = Object.create(null);
const prefix = '/api/v3/organizations/ci-fixture/applications/actions/environments/staging/variables';
http.createServer(async (req, res) => {
  res.setHeader('Content-Type','application/json');
  const reply = (status, data) => { res.writeHead(status);res.end(JSON.stringify(data)); };
  if (req.url === '/health') return reply(200,{ready:true});
  if (req.headers.authorization !== 'Bearer fixture-api-key-not-real') return reply(401,{message:'Fixture authentication required'});
  if (req.url !== prefix && !req.url.startsWith(prefix + '/')) return reply(404,{message:'Unknown fixture route'});
  let text='';for await (const chunk of req) text+=chunk;
  let body;try { body=text?JSON.parse(text):{}; }catch { return reply(400,{message:'Invalid JSON'}); }
  if(req.url===prefix){
    if(req.method==='GET')return reply(200,variables);
    if(req.method==='PUT'){
      if(!Array.isArray(body.environment))return reply(400,{message:'environment array required'});
      for(const k of Object.keys(variables))delete variables[k];
      for(const entry of body.environment){if(typeof entry.name!=='string'||typeof entry.value!=='string')return reply(400,{message:'name/value strings required'});variables[entry.name]=entry.value;}
      return reply(200,variables);
    }
  }else{
    const key=decodeURIComponent(req.url.slice(prefix.length+1));
    if(req.method==='PUT'){if(typeof body.value!=='string')return reply(400,{message:'value string required'});variables[key]=body.value;return reply(200,{value:body.value});}
    if(req.method==='DELETE'){if(!(key in variables))return reply(404,{message:'Not found'});delete variables[key];return reply(200,{});}
  }
  return reply(405,{message:'Method not allowed'});
}).listen(18765,'127.0.0.1');
