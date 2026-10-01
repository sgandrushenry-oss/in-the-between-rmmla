#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(DATA_DIR, 'poems.json');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_PER_ROOM = 600;
const MAX_TEXT = 220;
const VALID_TYPES = new Set(['between','asked','also','interrupted','called','notyet','made','little','possible','becoming']);
const clients = new Map();

fs.mkdirSync(DATA_DIR, {recursive:true});
let db = {};
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { db = {}; }

function safeRoom(raw='between') {
  const room = String(raw).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);
  return room || 'between';
}
function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});
  res.end(body);
}
function readBody(req, limit=8192) {
  return new Promise((resolve,reject)=>{
    let data='';
    req.on('data',chunk=>{ data += chunk; if(data.length>limit){ reject(new Error('too large')); req.destroy(); }});
    req.on('end',()=>resolve(data)); req.on('error',reject);
  });
}
function broadcast(room, payload) {
  const set = clients.get(room); if(!set) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) { try { res.write(msg); } catch {} }
}
function mime(file) {
  const ext=path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.svg':'image/svg+xml'})[ext] || 'application/octet-stream';
}
function serveFile(req,res,pathname) {
  let rel = pathname === '/' ? 'index_v11.html' : pathname.replace(/^\/+/, '');
  if (rel === 'index.html') rel = 'index_v11.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT,'index_v11.html')) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file,(err,st)=>{
    if(err || !st.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}
    res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':extCache(file)});
    fs.createReadStream(file).pipe(res);
  });
}
function extCache(file){ return path.extname(file)==='.html' ? 'no-cache' : 'public, max-age=3600'; }

const server = http.createServer(async (req,res)=>{
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = u.pathname;

  if (p === '/api/status' && req.method === 'GET') return json(res,200,{ok:true,version:11,storage:'server',moderation:!!ADMIN_TOKEN,premoderation:true});

  if (p === '/api/contributions' && req.method === 'GET') {
    const room=safeRoom(u.searchParams.get('room'));
    return json(res,200,(db[room] || []).filter(item=>!item.hidden));
  }

  if (p === '/api/contributions' && req.method === 'POST') {
    try {
      const room=safeRoom(u.searchParams.get('room'));
      const raw=await readBody(req); const body=JSON.parse(raw||'{}');
      const type=VALID_TYPES.has(body.type)?body.type:'between';
      const text=String(body.text||'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
      if(!text) return json(res,400,{error:'empty fragment'});
      const item={id:crypto.randomUUID(),type,text,createdAt:Date.now(),hidden:true,pending:true};
      if(!db[room]) db[room]=[];
      db[room].push(item); if(db[room].length>MAX_PER_ROOM) db[room]=db[room].slice(-MAX_PER_ROOM);
      save(); return json(res,201,{...item,status:'pending'});
    } catch(e) { return json(res,400,{error:'invalid request'}); }
  }

  if (p === '/api/stream' && req.method === 'GET') {
    const room=safeRoom(u.searchParams.get('room'));
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(`data: ${JSON.stringify({type:'snapshot',items:(db[room]||[]).filter(item=>!item.hidden)})}\n\n`);
    if(!clients.has(room)) clients.set(room,new Set()); clients.get(room).add(res);
    const ping=setInterval(()=>{try{res.write(': keepalive\n\n')}catch{}},25000);
    req.on('close',()=>{clearInterval(ping);clients.get(room)?.delete(res);if(clients.get(room)?.size===0)clients.delete(room)});
    return;
  }

  if (p === '/api/moderation' && req.method === 'GET') {
    if(!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return json(res,403,{error:'admin token required'});
    const room=safeRoom(u.searchParams.get('room'));
    return json(res,200,db[room] || []);
  }

  if (p === '/api/moderate' && req.method === 'POST') {
    if(!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return json(res,403,{error:'admin token required'});
    try {
      const room=safeRoom(u.searchParams.get('room'));
      const raw=await readBody(req); const body=JSON.parse(raw||'{}');
      const id=String(body.id||''); const hidden=!!body.hidden; const pending=body.pending===undefined?false:!!body.pending;
      const list=db[room] || []; const item=list.find(x=>x.id===id);
      if(!item) return json(res,404,{error:'fragment not found'});
      item.hidden=hidden; item.pending=pending; save();
      if(hidden) broadcast(room,{type:'remove',id:item.id});
      else broadcast(room,{type:'add',item});
      return json(res,200,{ok:true,id:item.id,hidden:item.hidden});
    } catch(e) { return json(res,400,{error:'invalid request'}); }
  }

  if (p === '/api/clear' && req.method === 'POST') {
    if(!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return json(res,403,{error:'admin token required'});
    const room=safeRoom(u.searchParams.get('room')); db[room]=[]; save(); broadcast(room,{type:'snapshot',items:[]}); return json(res,200,{ok:true,room});
  }

  serveFile(req,res,p);
});

server.listen(PORT,HOST,()=>{
  console.log(`In the Between v11 running at http://localhost:${PORT}/?room=rmmla2026`);
  console.log('Audience devices must be able to reach this host. No names/accounts are collected by the app.');
});