(()=>{
const params=new URLSearchParams(location.search);
const room=(params.get('room')||'rmmla2026').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'rmmla2026';
const isPresenter=location.pathname.toLowerCase().includes('presenter')||params.get('mode')==='present';
document.body.classList.add(isPresenter?'presenter':'view');

const screens=[...document.querySelectorAll('.screen')];
let current=0,loopTimer=null,looping=false,contributions=[];
const note=document.getElementById('presenter-note');

function setCurrent(i){current=Math.max(0,Math.min(screens.length-1,i));if(note)note.textContent=screens[current]?.dataset.note||''}
function go(i,behavior='smooth'){i=Math.max(0,Math.min(screens.length-1,i));screens[i].scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':behavior});setCurrent(i)}
const obs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&e.intersectionRatio>.55)setCurrent(screens.indexOf(e.target))}),{threshold:[.55]});
screens.forEach(s=>obs.observe(s));
document.getElementById('prev')?.addEventListener('click',()=>go(current-1));
document.getElementById('next')?.addEventListener('click',()=>go(current+1));
document.getElementById('notes')?.addEventListener('click',()=>document.body.classList.toggle('notes'));
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();stopLoop();go(current+1)}if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();stopLoop();go(current-1)}if(e.key.toLowerCase()==='p'&&isPresenter)document.body.classList.toggle('notes');if(e.key.toLowerCase()==='l'&&isPresenter){looping?stopLoop():startLoop()}});
function stopLoop(){looping=false;if(loopTimer)clearTimeout(loopTimer);loopTimer=null}
function startLoop(){looping=true;let idx=current;const tick=()=>{if(!looping)return;idx=(idx+1)%screens.length;go(idx);if(screens[idx].id==='poem')setPoemMode('loop');loopTimer=setTimeout(tick,screens[idx].id==='poem'?18000:9500)};tick()}
document.getElementById('loop')?.addEventListener('click',()=>looping?stopLoop():startLoop());

const leads={
 between:'I have been between',asked:'Graduate school asked me to be',also:'But I was also',
 interrupted:'Something interrupted my route:',called:'Something kept calling me back:',
 notyet:'I do not know yet',made:'Someone made room for me by',
 little:'A little movement that mattered was',possible:'What would make this possible:',
 becoming:'I am still becoming',carry:'Something that carries over is',
 grad_thoughts:'Graduate school brings to mind',grad_shape:'Graduate education shaped me',
 imagined:'Graduate students are imagined',daemon_return:'What keeps returning:',conduct_form:'What helps something take form:'
};
const lineFor=c=>((leads[c.type]||'')+' '+c.text).replace(/\s+/g,' ').trim();

async function load(){try{const r=await fetch('/api/contributions?room='+encodeURIComponent(room),{cache:'no-store'});if(r.ok){contributions=await r.json();renderRoute();renderPoem()}}catch{}}
function stream(){if(!window.EventSource)return;const es=new EventSource('/api/stream?room='+encodeURIComponent(room));es.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='snapshot')contributions=m.items;else if(m.type==='add'){if(!contributions.some(x=>x.id===m.item.id))contributions.push(m.item)}else if(m.type==='remove')contributions=contributions.filter(x=>x.id!==m.id);renderRoute();renderPoem()}catch{}}}

function makeDraggable(el,container){
 let drag=null;
 el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture?.(e.pointerId);const er=el.getBoundingClientRect(),cr=container.getBoundingClientRect();drag={dx:e.clientX-er.left,dy:e.clientY-er.top,cr};el.classList.add('dragging');el.style.zIndex=99});
 el.addEventListener('pointermove',e=>{if(!drag)return;const cr=drag.cr;let x=e.clientX-cr.left-drag.dx,y=e.clientY-cr.top-drag.dy;x=Math.max(0,Math.min(cr.width-el.offsetWidth,x));y=Math.max(0,Math.min(cr.height-el.offsetHeight,y));el.style.left=x+'px';el.style.top=y+'px';el.style.transform='none'});
 const end=()=>{drag=null;el.classList.remove('dragging')};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('click',()=>{el.style.zIndex=100});
}
function renderRoute(){
 const z=document.querySelector('[data-live="route"]');if(!z)return;z.innerHTML='';
 const slots=[[6,14],[19,67],[34,12],[49,69],[63,19],[76,64],[82,34],[26,38],[56,45],[8,48]];
 contributions.slice(-10).forEach((c,i)=>{const d=document.createElement('div');d.className='frag';d.textContent=c.text;d.style.left=slots[i%slots.length][0]+'%';d.style.top=slots[i%slots.length][1]+'%';d.style.setProperty('--r',(-5+(i*7)%10)+'deg');d.style.borderLeftColor=['var(--skin2)','var(--skin3)','var(--skin4)','var(--teal)','var(--graphite)'][i%5];z.appendChild(d);makeDraggable(d,z)});
}
document.querySelectorAll('.carry-token').forEach((el)=>makeDraggable(el,document.getElementById('carry-playground')));

async function submitMicro(type,text,statusEl){
 statusEl.textContent='Sending for review…';
 try{const r=await fetch('/api/contributions?room='+encodeURIComponent(room),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,text})});if(!r.ok)throw 0;statusEl.textContent='Submitted for review. If approved, it will enter the collective poem.';return true}catch{statusEl.textContent='Could not submit. Please try again.';return false}
}
document.querySelectorAll('[data-micro]').forEach(panel=>{
 const type=panel.dataset.micro,status=panel.querySelector('.micro-status'),other=panel.querySelector('.other-box'),input=other?.querySelector('input');
 panel.querySelectorAll('[data-choice]').forEach(btn=>btn.addEventListener('click',async()=>{
   if(btn.dataset.choice==='other'){other?.classList.add('open');input?.focus();return}
   panel.querySelectorAll('[data-choice]').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');
   await submitMicro(type,btn.dataset.choice,status);
 }));
 other?.querySelector('button')?.addEventListener('click',async()=>{const val=input.value.replace(/\s+/g,' ').trim();if(!val){status.textContent='Add a word or short phrase first.';return}if(await submitMicro(type,val,status)){input.value='';other.classList.remove('open')}})
});

let poemMode='pantoum',poemPage=0,poemTimer=null,accumIndex=0;
function clearPoemTimer(){if(poemTimer)clearTimeout(poemTimer);poemTimer=null}
function setPoemMode(m){clearPoemTimer();poemMode=m;poemPage=0;if(m==='accumulate')accumIndex=0;document.querySelectorAll('[data-poem]').forEach(b=>b.classList.toggle('active',b.dataset.poem===m));renderPoem();if(m==='accumulate')scheduleAccum();if(m==='loop')scheduleLoop()}
document.querySelectorAll('[data-poem]').forEach(b=>b.addEventListener('click',()=>setPoemMode(b.dataset.poem)));

function poemLines(){return contributions.map(lineFor).filter(Boolean)}
function pantoumStanzas(lines){
 if(lines.length<6)return [];
 const stanzas=[];let idx=0;
 stanzas.push([{t:lines[0],r:false},{t:lines[1],r:false},{t:lines[2],r:false},{t:lines[3],r:false}]);idx=4;
 while(idx<lines.length){
   const prev=stanzas[stanzas.length-1];
   const b=lines[idx++]||lines[0],d=lines[idx++]||lines[2];
   stanzas.push([{t:prev[1].t,r:true},{t:b,r:false},{t:prev[3].t,r:true},{t:d,r:false}]);
 }
 return stanzas;
}
function addLine(out,text,cls=''){const d=document.createElement('div');d.className='poem-line show '+cls;d.textContent=text;out.appendChild(d)}
function renderPoem(){
 const out=document.getElementById('poem-lines'),prog=document.getElementById('poem-progress'),modeLabel=document.getElementById('poem-mode-label');if(!out)return;
 const lines=poemLines();out.innerHTML='';
 modeLabel.textContent=poemMode==='loop'?'PANTOUM LOOP':poemMode.toUpperCase();
 if(!lines.length){out.innerHTML='<div class="poem-empty">Waiting for approved audience fragments…</div>';prog.textContent='';return}
 if(poemMode==='accumulate'){
   const arr=lines.slice(0,Math.max(1,accumIndex)).slice(-6);arr.forEach(x=>addLine(out,x));prog.textContent=Math.min(accumIndex,lines.length)+' / '+lines.length;return
 }
 if(poemMode==='cento'){
   const size=7,pages=Math.max(1,Math.ceil(lines.length/size));poemPage%=pages;lines.slice(poemPage*size,poemPage*size+size).forEach(x=>addLine(out,x));prog.textContent=pages>1?'cento · movement '+(poemPage+1)+' of '+pages:'cento · '+lines.length+' approved lines';return
 }
 const st=pantoumStanzas(lines);
 if(!st.length){lines.slice(0,7).forEach(x=>addLine(out,x));prog.textContent='cento until at least 6 approved lines are available';return}
 poemPage%=st.length;const box=document.createElement('div');box.className='poem-stanza';st[poemPage].forEach(x=>addLine(box,x.t,x.r?'repeat':''));out.appendChild(box);prog.textContent='pantoum · stanza '+(poemPage+1)+' of '+st.length+' · repeated lines carry forward';
}
function scheduleAccum(){if(poemMode!=='accumulate')return;if(accumIndex<contributions.length){accumIndex++;renderPoem();poemTimer=setTimeout(scheduleAccum,2200)}else poemTimer=setTimeout(()=>setPoemMode('pantoum'),3000)}
function scheduleLoop(){if(poemMode!=='loop')return;const st=pantoumStanzas(poemLines());const pages=st.length||Math.max(1,Math.ceil(poemLines().length/7));poemPage=(poemPage+1)%pages;renderPoem();poemTimer=setTimeout(scheduleLoop,15000)}
function startPoemAutocycle(){setInterval(()=>{if(poemMode==='pantoum'||poemMode==='cento'){const lines=poemLines();const pages=poemMode==='pantoum'?Math.max(1,pantoumStanzas(lines).length):Math.max(1,Math.ceil(lines.length/7));if(pages>1){poemPage=(poemPage+1)%pages;renderPoem()}}},14000)}
load();stream();setCurrent(0);setPoemMode('pantoum');startPoemAutocycle();
})();