/* Lagos Racer showroom: vehicle list, selection UI, camera and render loop. */
(function(){
const VEHICLES = [
  {id:'okada', name:'Red Okada', dot:'#c8102e',
   tag:"Factory race build of the red street bike: gold upside-down forks, angry LED eyes, winglets, ankara seat and handlebar tassels. Leaves danfos wondering if they were ever moving at all.",
   stats:{Speed:9,Handling:9,Toughness:2,Seats:1},
   crew:'Rider in a numbered union vest and backwards cap. Madam rides side-saddle in her gele, Ghana Must Go bag strapped to the rack.'},
  {id:'okada-blue', name:'Blue Okada', dot:'#0b55c4',
   tag:"Same factory race build in blue: gold forks, angry LED eyes, ankara seat, handlebar tassels. Twins on the grid, rivals on the road.",
   stats:{Speed:9,Handling:9,Toughness:2,Seats:1},
   crew:'Rider in a numbered union vest and race helmet. Madam rides side-saddle in her gele, Ghana Must Go bag strapped to the rack.'},
  {id:'keke', name:'Keke Marwa', dot:'#f5b400',
   tag:"The yellow three-wheeler gone full rally: twin stripes, flared arches, a roof wing and green underglow under the tasselled black canopy. Still corners on two wheels, just faster now.",
   stats:{Speed:5,Handling:6,Toughness:4,Seats:4},
   crew:'Driver plus three at the back, and one extra squeezed in beside the driver because why not.'},
  {id:'danfo', name:'Danfo', dot:'#f5b400',
   tag:"The old yellow bus with the two black stripes, slammed on fat wheels with a wing behind the roof rack and the sliding door still jammed open. The conductor throws the power-ups.",
   stats:{Speed:6,Handling:5,Toughness:7,Seats:14},
   crew:"Driver's elbow out the window. Conductor in a singlet on the step, waving change. One passenger on the extra wooden chair in the doorway."},
  {id:'brt-blue', name:'Blue BRT', dot:'#1a9be0',
   tag:"The white-and-blue boss bus, slammed on gold alloys with a roof wing and quad pipes, swoosh and destination board intact. Has its own lane. Will use yours too.",
   stats:{Speed:4,Handling:3,Toughness:10,Seats:40},
   crew:'Conductor leaning out of the front door shouting the next stop.'},
  {id:'brt-red', name:'Red BRT', dot:'#d0021b',
   tag:"Same race-prepped tank in red with orange underglow. A bit quicker off the line, still impossible to push around.",
   stats:{Speed:5,Handling:3,Toughness:9,Seats:40},
   crew:'Conductor leaning out of the front door shouting the next stop.'}
];

const BUILDERS={ 'okada':()=>buildOkada(), 'okada-blue':()=>buildOkada('#0b55c4'), 'keke':buildKeke, 'danfo':buildDanfo,
  'brt-blue':()=>buildBRT('#0f86cf','01'), 'brt-red':()=>buildBRT('#d4141c','02') };
const built={};

/* ---------- roundabout platform ---------- */
let platform=null;
function buildPlatform(R){
  const g=new THREE.Group();
  const asphalt=mesh(new THREE.CylinderGeometry(R,R,.08,72),mat('#4a4744',{roughness:.95}),0,-.04,0); g.add(asphalt);
  const N=Math.max(24,Math.round(R*9)), Rk=R+.12, len=2*Math.PI*Rk/N*.97;
  for(let i=0;i<N;i++){
    const a=i/N*Math.PI*2, k=rbox(len,.16,.22,.04,paint(i%2?'#f2c200':'#1d1d1d'),Math.cos(a)*Rk,.02,Math.sin(a)*Rk);
    k.rotation.y=-(a+Math.PI/2); g.add(k);
  }
  for(let i=0;i<9;i++){ const d=mesh(new THREE.BoxGeometry(R*.11,.01,R*.025),mat('#f2efe6'),-R*.88+i*R*.22,.002,0); d.receiveShadow=true; g.add(d); }
  return g;
}

/* ---------- view ---------- */
let current=null, idx=0, radius=3, center=V(0,0,0);
// URL params for screenshots and quick links: ?v=danfo&az=0.7&el=0.26&zoom=1.15&spin=0&ui=0
const Q=new URLSearchParams(location.search), num=(k,d)=>Q.has(k)&&isFinite(+Q.get(k))?+Q.get(k):d;
const DEFAULT={az:num('az',.7), el:num('el',.26), zoom:num('zoom',1.15)};
if(Q.get('ui')==='0') document.body.classList.add('bare');
const view=Object.assign({},DEFAULT);
let spinning=Q.get('spin')!=='0' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function select(i){
  idx=(i+VEHICLES.length)%VEHICLES.length;
  const v=VEHICLES[idx];
  if(current) scene.remove(current);
  if(!built[v.id]){ const m=BUILDERS[v.id](); m.scale.z=-1; m.traverse(o=>{ if(o.userData.decal) o.scale.x*=-1; }); built[v.id]=m; }
  current = built[v.id];
  scene.add(current);
  current.position.y=0; current.rotation.x=0;
  const bb=new THREE.Box3().setFromObject(current), size=bb.getSize(V(0,0,0));
  bb.getCenter(center);
  radius=Math.max(size.x,size.z,size.y*1.3)*.5;
  if(platform) scene.remove(platform);
  const R=Math.hypot(size.x,size.z)*.55+.25;
  platform=buildPlatform(R); scene.add(platform);
  const S=Math.max(size.x,size.y,size.z);
  sun.position.set(center.x+S*.9, S*1.8, center.z+S*.7); sun.target.position.copy(center);
  const c=sun.shadow.camera; c.left=-R-.5; c.right=R+.5; c.top=R+.5; c.bottom=-R-.5; c.near=.1; c.far=S*6; c.updateProjectionMatrix();
  document.getElementById('vname').textContent=v.name;
  document.getElementById('vtag').textContent=v.tag;
  document.getElementById('vcrew').textContent=v.crew;
  const st=document.getElementById('vstats'); st.innerHTML='';
  Object.entries(v.stats).forEach(([k,val])=>{
    const l=document.createElement('span'); l.textContent=k;
    const bar=document.createElement('div'); bar.className='bar'; bar.innerHTML='<i style="width:0"></i>';
    bar.setAttribute('role','img'); bar.setAttribute('aria-label',k+': '+val+(k==='Seats'?'':' out of 10'));
    const pct=k==='Seats'?Math.round(Math.log2(val+1)/Math.log2(41)*100):val*10;
    st.append(l,bar); requestAnimationFrame(()=>{ bar.firstChild.style.width=pct+'%'; });
  });
  document.querySelectorAll('.stops button').forEach((b,j)=>b.setAttribute('aria-selected',j===idx));
}

const stops=document.getElementById('stops');
VEHICLES.forEach((v,i)=>{ const b=document.createElement('button'); b.setAttribute('role','tab');
  b.innerHTML='<span class="dot" style="background:'+v.dot+'"></span>'+v.name; b.addEventListener('click',()=>select(i)); stops.appendChild(b); });
const spinBtn=document.getElementById('spin'); spinBtn.setAttribute('aria-pressed',spinning);
spinBtn.addEventListener('click',()=>{ spinning=!spinning; spinBtn.setAttribute('aria-pressed',spinning); });
document.getElementById('reset').addEventListener('click',()=>Object.assign(view,DEFAULT));
window.addEventListener('keydown',e=>{ if(e.key==='ArrowRight') select(idx+1); if(e.key==='ArrowLeft') select(idx-1); });

const pointers=new Map(); let pinch0=0, zoom0=1;
const hint=document.getElementById('hint'); const hideHint=()=>hint.classList.add('gone'); setTimeout(hideHint,4500);
stage.addEventListener('pointerdown',e=>{ stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); hideHint();
  if(pointers.size===2){ const [a,b]=[...pointers.values()]; pinch0=Math.hypot(a.x-b.x,a.y-b.y); zoom0=view.zoom; } });
stage.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)) return;
  const p=pointers.get(e.pointerId), dx=e.clientX-p.x, dy=e.clientY-p.y; pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1){ view.az+=dx*.008; view.el=Math.min(1.25,Math.max(.03,view.el+dy*.006)); }
  else if(pointers.size===2){ const [a,b]=[...pointers.values()], d=Math.hypot(a.x-b.x,a.y-b.y); if(pinch0>0) view.zoom=Math.min(1.8,Math.max(.4,zoom0*pinch0/d)); }
});
['pointerup','pointercancel'].forEach(t=>stage.addEventListener(t,e=>{ pointers.delete(e.pointerId); if(pointers.size<2) pinch0=0; }));
stage.addEventListener('wheel',e=>{ e.preventDefault(); view.zoom=Math.min(1.8,Math.max(.4,view.zoom*(1+e.deltaY*.001))); hideHint(); },{passive:false});

function resize(){ const w=stage.clientWidth, h=stage.clientHeight; renderer.setSize(w,h,false);
  renderer.domElement.style.width=w+'px'; renderer.domElement.style.height=h+'px'; camera.aspect=w/h; camera.updateProjectionMatrix(); }
window.addEventListener('resize',resize); resize();

const clock=new THREE.Clock();
function frame(){
  const dt=Math.min(clock.getDelta(),.05), t=clock.elapsedTime;
  if(spinning && pointers.size===0) view.az-=dt*.3;
  if(current){ if(current.userData.anim) current.userData.anim(t); current.traverse(o=>{ if(o.userData.wheel) o.rotation.z-=dt*2.2; }); }
  const fov=camera.fov*Math.PI/180, tanH=Math.tan(fov/2);
  const dist=Math.max((radius*1.2)/tanH,(radius*1.2)/(tanH*Math.min(1,camera.aspect)))*view.zoom;
  const target=center.clone(); target.y=center.y*.8-radius*.14*(camera.aspect<1?1.7:.6);
  camera.position.set(target.x+dist*Math.cos(view.el)*Math.cos(view.az), target.y+dist*Math.sin(view.el), target.z+dist*Math.cos(view.el)*Math.sin(view.az));
  camera.lookAt(target);
  renderer.render(scene,camera);
  if(!window.__lr.ready && current) window.__lr.ready=true;
  requestAnimationFrame(frame);
}
// hooks for the screenshot script (shot.mjs)
window.__lr={ ready:false,
  setView:v=>Object.assign(view,v),
  stats:()=>{ let meshes=0; current.traverse(o=>{ if(o.isMesh) meshes++; }); const r=renderer.info.render;
    return {vehicle:VEHICLES[idx].id, meshes, drawCalls:r.calls, triangles:r.triangles, geometries:renderer.info.memory.geometries, textures:renderer.info.memory.textures}; } };
const startIdx=Math.max(0,VEHICLES.findIndex(v=>v.id===Q.get('v')));
const start=()=>{ select(startIdx); frame(); };
if(document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
