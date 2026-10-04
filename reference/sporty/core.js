/* Lagos Racer showroom: shared renderer, materials, textures, geometry helpers, sporty kit and characters.
   Loaded as a classic script so the vehicle files and main.js can use these top-level names directly. */
if(!window.THREE){ document.getElementById('err').style.display='flex'; throw new Error('three.js failed to load'); }

/* ---------- renderer ---------- */
const stage = document.getElementById('stage');
let renderer;
try{ renderer = new THREE.WebGLRenderer({antialias:true, alpha:true}); }
catch(e){ document.getElementById('err').style.display='flex'; throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);

/* sunny environment for glossy reflections */
(function(){
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(50,32,16), cols=[], P=skyGeo.attributes.position;
  const top=new THREE.Color(.22,.42,.8), hor=new THREE.Color(.75,.68,.58), gr=new THREE.Color(.16,.14,.12), c=new THREE.Color();
  for(let i=0;i<P.count;i++){ const h=P.getY(i)/50; if(h>=0) c.copy(hor).lerp(top,Math.pow(h,.55)); else c.copy(hor).lerp(gr,Math.pow(-h,.35)); cols.push(c.r,c.g,c.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols,3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide}));
  env.add(sky);
  const panel = (w,h,x,y,z,k)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:new THREE.Color(k,k,k*.95), side:THREE.DoubleSide})); m.position.set(x,y,z); m.lookAt(0,0,0); env.add(m); };
  panel(30,12,10,30,12,1.8); panel(20,6,-25,10,-10,.9); panel(14,6,0,8,-30,.7);
  scene.environment = pm.fromScene(env, .03).texture;
})();
scene.add(new THREE.HemisphereLight(0xdfefff, 0x8a7258, .2));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -0.0004; sun.shadow.radius = 4;
scene.add(sun); scene.add(sun.target);

/* ---------- materials ---------- */
const mcache = {};
function mat(c, o){ const k='s'+c+JSON.stringify(o||{}); return mcache[k]||(mcache[k]=new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:.6, metalness:0}, o||{}))); }
function paint(c){ const k='p'+c; return mcache[k]||(mcache[k]=new THREE.MeshPhysicalMaterial({color:c, roughness:.3, metalness:.1, clearcoat:1, clearcoatRoughness:.1})); }
function asMat(m){ return typeof m==='string' ? mat(m) : m; }
const DS = THREE.DoubleSide;
const MAT = {
  tire:mat('#1c1b1a',{roughness:.85, side:DS}), black:mat('#1d1c1b',{roughness:.45}), blackGloss:paint('#151515'),
  blackDS:mat('#1d1c1b',{roughness:.5, side:DS}), alu:mat('#b8b6b2',{metalness:.7,roughness:.35}),
  chrome:mat('#e6e6e6',{metalness:1,roughness:.12}), chromeDS:mat('#e6e6e6',{metalness:1,roughness:.12,side:DS}),
  glass:new THREE.MeshPhysicalMaterial({color:'#1e3640',roughness:.05,metalness:.3,clearcoat:1}),
  glassDk:new THREE.MeshPhysicalMaterial({color:'#121a1f',roughness:.05,metalness:.3,clearcoat:1}),
  lamp:mat('#fffbe6',{emissive:'#fff1b0',emissiveIntensity:.9,roughness:.1}),
  amber:mat('#ff9a1a',{emissive:'#c45a00',emissiveIntensity:.6,roughness:.2}),
  tail:mat('#e0201b',{emissive:'#8c0a0a',emissiveIntensity:.6,roughness:.2}),
  white:paint('#f6f6f2'), eyeW:mat('#ffffff',{roughness:.25}), pupil:mat('#120d0a',{roughness:.2}),
  mouth:mat('#4a1a14'), hair:mat('#1a1411',{roughness:.9}), shoe:mat('#2a2420',{roughness:.7}),
  skin1:mat('#6a3a1e',{roughness:.65,envMapIntensity:.5}), skin2:mat('#43240f',{roughness:.65,envMapIntensity:.5}),
  naira:mat('#5aa36a'), spring:paint('#d0141a'), wood:mat('#8a5a33',{roughness:.8}),
  reflect:mat('#d9e0e2',{metalness:.6,roughness:.25,side:DS}), canvas:mat('#0c0c0c',{roughness:1,envMapIntensity:.3})
};

/* ---------- textures ---------- */
let seed = 11; const rnd = ()=> (seed = seed*16807 % 2147483647) / 2147483647;
function ctex(w,h,draw,repeat){
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); draw(x,w,h);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.anisotropy=8;
  if(repeat){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repeat,repeat); }
  return t;
}
function rr(x,X,Y,W,H,R){ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); }
function textTex(text,{fg='#111',bg=null,font='900 64px Archivo, Arial',w=512,h=110,glow=null,radius=0,stroke=null}={}){
  return ctex(w,h,(x)=>{
    if(bg){ x.fillStyle=bg; rr(x,2,2,w-4,h-4,radius); x.fill(); }
    x.font=font; x.textAlign='center'; x.textBaseline='middle';
    if(glow){ x.shadowColor=glow; x.shadowBlur=16; }
    if(stroke){ x.lineWidth=8; x.strokeStyle=stroke; x.strokeText(text,w/2,h/2+3); }
    x.fillStyle=fg; x.fillText(text,w/2,h/2+3);
  });
}
function plateTex(num){
  return ctex(320,150,(x,w,h)=>{
    x.fillStyle='#f5f6f1'; rr(x,3,3,w-6,h-6,14); x.fill(); x.lineWidth=5; x.strokeStyle='#2a2a2a'; x.stroke();
    x.fillStyle='#1f8a4c'; x.fillRect(16,14,14,26); x.fillRect(44,14,14,26); x.fillStyle='#fff'; x.fillRect(30,14,14,26); x.strokeStyle='#999'; x.lineWidth=1; x.strokeRect(16,14,42,26);
    x.textAlign='center'; x.textBaseline='middle';
    x.fillStyle='#1f8a4c'; x.font='800 28px Archivo, Arial'; x.fillText('LAGOS',w/2+20,28);
    x.fillStyle='#c62828'; let fs=64; do{ x.font='900 '+fs+'px Archivo, Arial'; fs-=2; }while(x.measureText(num).width>w-30 && fs>20); x.fillText(num,w/2,82);
    x.fillStyle='#1f8a4c'; x.font='700 17px Archivo, Arial'; x.fillText('CENTRE OF EXCELLENCE',w/2,128);
  });
}
const ANKARA = new THREE.MeshStandardMaterial({roughness:.7, map:ctex(128,128,(x)=>{
  x.fillStyle='#e8701a'; x.fillRect(0,0,128,128);
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){
    const cx=32+i*64, cy=32+j*64;
    x.fillStyle='#1d4e89'; x.beginPath(); x.arc(cx,cy,24,0,7); x.fill();
    x.fillStyle='#ffd23f'; x.beginPath(); x.arc(cx,cy,14,0,7); x.fill();
    x.fillStyle='#7b2d8b'; x.beginPath(); x.arc(cx,cy,6,0,7); x.fill();
    x.fillStyle='#1f8a4c'; x.save(); x.translate(cx+32,cy+32); x.rotate(Math.PI/4); x.fillRect(-7,-7,14,14); x.restore();
  }
},3)});
const ANKARA2 = new THREE.MeshStandardMaterial({roughness:.7, map:ctex(128,128,(x)=>{
  x.fillStyle='#0f6e5c'; x.fillRect(0,0,128,128);
  for(let i=0;i<4;i++){ x.fillStyle=i%2?'#f2c200':'#d6336c'; x.beginPath(); x.moveTo(0,i*32); x.lineTo(64,i*32+16); x.lineTo(128,i*32); x.lineTo(128,i*32+10); x.lineTo(64,i*32+26); x.lineTo(0,i*32+10); x.fill(); }
},2)});
const GELE = paint('#d4a017');
const PLAID = new THREE.MeshStandardMaterial({roughness:.8, map:ctex(128,128,(x)=>{
  x.fillStyle='#efe9dc'; x.fillRect(0,0,128,128);
  for(let i=0;i<128;i+=32){ x.fillStyle='rgba(190,30,45,.75)'; x.fillRect(i,0,12,128); x.fillRect(0,i,128,12);
    x.fillStyle='rgba(30,70,170,.65)'; x.fillRect(i+18,0,6,128); x.fillRect(0,i+18,128,6); }
},2)});
const rustTex = ctex(128,96,(x,w,h)=>{
  for(let i=0;i<40;i++){ x.fillStyle=`rgba(${120+rnd()*40|0},${55+rnd()*25|0},${20+rnd()*15|0},${.35+rnd()*.5})`;
    x.beginPath(); x.ellipse(w/2+(rnd()-.5)*w*.6, h/2+(rnd()-.5)*h*.55, 6+rnd()*18, 4+rnd()*12, rnd()*3, 0, 7); x.fill(); }
});

/* ---------- geometry helpers ---------- */
const V=(x,y,z)=>new THREE.Vector3(x,y,z), V2=(x,y)=>new THREE.Vector2(x,y), UP=V(0,1,0);
function smoothNormals(geo, maxAngle=Math.PI/3.2){
  if(geo.index) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p=geo.attributes.position, n=geo.attributes.normal, cnt=p.count, map=new Map();
  const key=i=>Math.round(p.getX(i)*1e4)+'_'+Math.round(p.getY(i)*1e4)+'_'+Math.round(p.getZ(i)*1e4);
  for(let i=0;i<cnt;i++){ const k=key(i); (map.get(k)||map.set(k,[]).get(k)).push(i); }
  const out=new Float32Array(cnt*3), cos=Math.cos(maxAngle), a=V(0,0,0), b=V(0,0,0), s=V(0,0,0);
  for(let i=0;i<cnt;i++){
    a.fromBufferAttribute(n,i); s.set(0,0,0);
    for(const j of map.get(key(i))){ b.fromBufferAttribute(n,j); if(a.dot(b)>=cos) s.add(b); }
    s.normalize(); out[i*3]=s.x; out[i*3+1]=s.y; out[i*3+2]=s.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out,3));
  return geo;
}
function rrectShape(w,h,r){
  const s=new THREE.Shape(), x=-w/2, y=-h/2; r=Math.max(.0005, Math.min(r,w/2-.0001,h/2-.0001));
  s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.absarc(x+w-r,y+r,r,-Math.PI/2,0);
  s.lineTo(x+w,y+h-r); s.absarc(x+w-r,y+h-r,r,0,Math.PI/2);
  s.lineTo(x+r,y+h); s.absarc(x+r,y+h-r,r,Math.PI/2,Math.PI);
  s.lineTo(x,y+r); s.absarc(x+r,y+r,r,Math.PI,Math.PI*1.5);
  return s;
}
const gcache={};
function rbGeo(w,h,d,r){
  const k=[w,h,d,r].join(',');
  if(gcache[k]) return gcache[k];
  const b=Math.max(.002, Math.min(r, d/2-.001, w/2-.001, h/2-.001));
  const depth=Math.max(.001, d-2*b);
  const shape=rrectShape(w-2*b, h-2*b, Math.max(.0006, r*.6));
  let g=new THREE.ExtrudeGeometry(shape,{depth, bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:3, curveSegments:5});
  g.translate(0,0,-depth/2);
  return gcache[k]=smoothNormals(g);
}
function profileGeo(shape, width, bevel){
  const depth=width-2*bevel;
  let g=new THREE.ExtrudeGeometry(shape,{depth, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel, bevelSegments:4, curveSegments:10});
  g.translate(0,0,-depth/2);
  return smoothNormals(g);
}
function capsuleGeo(r,len){
  const k='cap'+r+','+len; if(gcache[k]) return gcache[k];
  const pts=[]; const seg=6;
  for(let i=0;i<=seg;i++){ const a=-Math.PI/2+i/seg*Math.PI/2; pts.push(V2(Math.max(0.0001,Math.cos(a)*r), -len/2+Math.sin(a)*r)); }
  for(let i=0;i<=seg;i++){ const a=i/seg*Math.PI/2; pts.push(V2(Math.max(0.0001,Math.cos(a)*r), len/2+Math.sin(a)*r)); }
  return gcache[k]=new THREE.LatheGeometry(pts,14);
}
function mesh(geo, m, x=0,y=0,z=0){ const o=new THREE.Mesh(geo,m); o.position.set(x,y,z); o.castShadow=true; o.receiveShadow=true; return o; }
function rbox(w,h,d,r,m,x,y,z){ return mesh(rbGeo(w,h,d,r),m,x,y,z); }
function sph(r,m,x,y,z,seg=18){ return mesh(new THREE.SphereGeometry(r,seg,Math.max(8,seg*.6|0)),m,x,y,z); }
function cylm(rt,rb,h,m,seg=20){ return mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m); }
function orient(o,a,b){ const d=b.clone().sub(a); o.position.copy(a).add(b).multiplyScalar(.5); o.quaternion.setFromUnitVectors(UP,d.normalize()); }
function rod(a,b,r,m,seg=10){ a=V(...a); b=V(...b); const o=mesh(new THREE.CylinderGeometry(r,r,a.distanceTo(b),seg),m); orient(o,a,b); return o; }
function limb(a,b,r,m){ a=V(...a); b=V(...b); const o=mesh(capsuleGeo(r,Math.max(.001,a.distanceTo(b))),m); orient(o,a,b); return o; }
function fender(r,w,ts,tl,m,x,y,z){ const o=mesh(new THREE.CylinderGeometry(r,r,w,28,1,true,ts,tl),m); o.rotation.x=Math.PI/2; o.position.set(x,y,z); return o; }
function decal(w,h,tex,x,y,z,ry=0,rz=0,emissive=false){
  const m=new THREE.MeshStandardMaterial({map:tex,transparent:true,roughness:.4,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  if(emissive){ m.emissive=new THREE.Color(1,1,1); m.emissiveMap=tex; m.emissiveIntensity=.8; }
  const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m); o.position.set(x,y,z); o.rotation.set(0,ry,rz); o.receiveShadow=true; o.userData.decal=true; return o;
}
const FACE={px:Math.PI/2, nx:-Math.PI/2, pz:0, nz:Math.PI};

function spokedWheel(r){
  const g=new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(r-.045,.047,14,40),MAT.tire));
  g.add(mesh(new THREE.TorusGeometry(r-.088,.013,8,40),MAT.chrome));
  const hub=cylm(.05,.05,.11,MAT.alu,16); hub.rotation.x=Math.PI/2; g.add(hub);
  for(let i=0;i<18;i++){ const a=i/18*Math.PI*2, s=i%2?1:-1;
    g.add(rod([0,0,.04*s],[Math.cos(a)*(r-.09),Math.sin(a)*(r-.09),.006*s],.0035,MAT.chrome,4)); }
  g.userData.wheel=true; return g;
}
function carWheel(r,w,rimColor){
  const g=new THREE.Group(), ri=r*.6, c=Math.min(.07,w*.32), pts=[V2(ri,-w/2)];
  for(let i=0;i<=5;i++){ const a=-Math.PI/2+i/5*Math.PI/2; pts.push(V2(r-c+Math.cos(a)*c, -w/2+c+Math.sin(a)*c)); }
  for(let i=0;i<=5;i++){ const a=i/5*Math.PI/2; pts.push(V2(r-c+Math.cos(a)*c, w/2-c+Math.sin(a)*c)); }
  pts.push(V2(ri,w/2));
  const tire=mesh(new THREE.LatheGeometry(pts,36),MAT.tire); tire.rotation.x=Math.PI/2; g.add(tire);
  const rim=cylm(ri,ri,w*.82,paint(rimColor),28); rim.rotation.x=Math.PI/2; g.add(rim);
  [-1,1].forEach(s=>{
    const cap=sph(ri*.62,MAT.chrome,0,0,s*w*.41,24); cap.scale.set(1,1,.28); g.add(cap);
    const ring=mesh(new THREE.TorusGeometry(ri*.86,ri*.07,8,32),MAT.chrome); ring.position.z=s*w*.41; g.add(ring);
  });
  g.userData.wheel=true; return g;
}

/* ---------- sporty kit (shared by every vehicle) ---------- */
// Glowing material for underglow strips, light bars and neon accents.
function glow(c, k=1.4){ const key='g'+c+k; return mcache[key]||(mcache[key]=new THREE.MeshStandardMaterial({color:c, emissive:c, emissiveIntensity:k, roughness:.3})); }
// Twill weave carbon fibre for splitters, diffusers, wings and mirror caps.
MAT.carbon = new THREE.MeshPhysicalMaterial({color:'#2a2c30', roughness:.35, metalness:.2, clearcoat:1, clearcoatRoughness:.08, map:ctex(64,64,(x)=>{
  for(let i=0;i<8;i++)for(let j=0;j<8;j++){ const on=(i+j)%2; const gr=x.createLinearGradient(i*8,j*8,i*8+(on?8:0),j*8+(on?0:8));
    gr.addColorStop(0,on?'#3c3f45':'#15161a'); gr.addColorStop(1,on?'#1c1d21':'#33363b'); x.fillStyle=gr; x.fillRect(i*8,j*8,8,8); }
},6)});
MAT.carbonDS = MAT.carbon.clone(); MAT.carbonDS.side = DS;
MAT.rubber = mat('#141414',{roughness:.9});
MAT.brake = mat('#9a9ca0',{metalness:.8, roughness:.4});

// Round race-number roundel, e.g. decal(.3,.3,raceNumberTex('07'),...).
function raceNumberTex(num,{bg='#ffffff',fg='#111111',ring='#111111'}={}){
  return ctex(256,256,(x,w,h)=>{
    x.fillStyle=ring; x.beginPath(); x.arc(w/2,h/2,124,0,7); x.fill();
    x.fillStyle=bg; x.beginPath(); x.arc(w/2,h/2,108,0,7); x.fill();
    x.fillStyle=fg; x.textAlign='center'; x.textBaseline='middle';
    let fs=150; do{ x.font='400 '+fs+'px Bungee, Impact, Arial Black'; fs-=4; }while(x.measureText(num).width>170 && fs>40);
    x.fillText(num,w/2,h/2+8);
  });
}
// Chequered flag strip, e.g. decal(.6,.08,checkerTex(16,2),...).
function checkerTex(cols=8,rows=2,a='#111111',b='#ffffff'){
  return ctex(cols*16,rows*16,(x)=>{ for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){ x.fillStyle=(i+j)%2?a:b; x.fillRect(i*16,j*16,16,16); } });
}
// Sponsor-style sticker with a slanted "speed" box. Invented names only (OGA, KABIYESI, ...).
function speedTex(text,{fg='#ffffff',bg='#111111',accent='#f5b400',w=512,h=128}={}){
  return ctex(w,h,(x)=>{
    x.fillStyle=bg; x.beginPath(); x.moveTo(h*.4,4); x.lineTo(w-4,4); x.lineTo(w-h*.4,h-4); x.lineTo(4,h-4); x.closePath(); x.fill();
    x.fillStyle=accent; x.beginPath(); x.moveTo(w-h*.55,4); x.lineTo(w-4,4); x.lineTo(w-h*.4,h-4); x.lineTo(w-h*.95,h-4); x.closePath(); x.fill();
    x.fillStyle=fg; x.textAlign='center'; x.textBaseline='middle';
    let fs=h*.62; do{ x.font='italic 900 '+fs+'px Archivo, Arial'; fs-=2; }while(x.measureText(text).width>w-h*1.4 && fs>12);
    x.fillText(text,(w-h*.5)/2+h*.1,h/2+3);
  });
}

// Low-profile tyre on a multi-spoke alloy, with brake disc and caliper visible through the spokes.
// Axle runs along z like carWheel(). The returned group stays still; only its inner group spins,
// so the caliper doesn't rotate. Options: spokes (count), lip ('chrome' or a colour), caliper colour.
function sportWheel(r, w, rimColor='#d9dce0', o={}){
  const g=new THREE.Group(), spin=new THREE.Group(); g.add(spin);
  const ri=r*(o.rimRatio||.74), c=Math.min(.05,w*.25), n=o.spokes||6, RIM=paint(rimColor);
  const pts=[V2(ri,-w/2)];
  for(let i=0;i<=4;i++){ const a=-Math.PI/2+i/4*Math.PI/2; pts.push(V2(r-c+Math.cos(a)*c, -w/2+c+Math.sin(a)*c)); }
  for(let i=0;i<=4;i++){ const a=i/4*Math.PI/2; pts.push(V2(r-c+Math.cos(a)*c, w/2-c+Math.sin(a)*c)); }
  pts.push(V2(ri,w/2));
  const tyre=mesh(new THREE.LatheGeometry(pts,32),MAT.tire); tyre.rotation.x=Math.PI/2; spin.add(tyre);
  const barrel=mesh(new THREE.CylinderGeometry(ri*.98,ri*.98,w*.86,24,1,true),MAT.blackDS); barrel.rotation.x=Math.PI/2; spin.add(barrel);
  const disc=cylm(ri*.74,ri*.74,Math.max(.012,w*.08),MAT.brake,24); disc.rotation.x=Math.PI/2; spin.add(disc);
  const LIP=o.lip==='chrome'?MAT.chrome:(o.lip?paint(o.lip):RIM);
  const sg=new THREE.BoxGeometry(ri*.74,ri*.13,Math.max(.012,w*.07));
  [-1,1].forEach(s=>{
    const z=s*w*.4;
    const lip=mesh(new THREE.TorusGeometry(ri*.95,ri*.055,8,32),LIP,0,0,z); spin.add(lip);
    for(let i=0;i<n;i++){ const a=i/n*Math.PI*2;
      [-.13,.13].forEach(d=>{ const sp=mesh(sg,RIM,Math.cos(a+d*.6)*ri*.52,Math.sin(a+d*.6)*ri*.52,z); sp.rotation.z=a+d; spin.add(sp); }); }
    const cap=sph(ri*.2,RIM,0,0,z,16); cap.scale.set(1,1,.45); spin.add(cap);
    const nut=sph(ri*.08,MAT.chrome,0,0,z+s*ri*.07,10); spin.add(nut);
  });
  const ca=Math.PI*.78, cal=rbox(ri*.36,ri*.2,w*.42,ri*.06,paint(o.caliper||'#e0201b'),Math.cos(ca)*ri*.66,Math.sin(ca)*ri*.66,0);
  cal.rotation.z=ca+Math.PI/2; g.add(cal);
  spin.userData.wheel=true; return g;
}

/* ---------- characters (big-head cartoon) ---------- */
function person(o={}){
  const g=new THREE.Group(), standing=o.pose==='stand';
  const shirt=asMat(o.shirt||'#2e7d32'), pants=asMat(o.pants||'#37322c'), skin=o.skin||MAT.skin1;
  const torsoMat=o.vest?asMat(o.vest):shirt;
  const shoeMat=o.shoe?mat(o.shoe,{roughness:.6}):MAT.shoe;
  const torso=mesh(capsuleGeo(.15,.16),torsoMat,0,.28,0); torso.scale.set(.9,1,1.05); g.add(torso);
  const pelvis=sph(.15,pants,0,.12,0); pelvis.scale.set(.9,.6,1.05); g.add(pelvis);
  if(o.vest){
    [.22,.34].forEach(y=>{ const b=mesh(new THREE.CylinderGeometry(.153,.153,.03,24,1,true),MAT.reflect,0,y,0); b.scale.set(.9,1,1.05); g.add(b); });
    if(o.vestText) g.add(decal(.17,.1,textTex(o.vestText,{fg:'#111',font:'900 84px Archivo, Arial',w:220,h:130}),-.142,.29,0,FACE.nx));
  }
  const head=new THREE.Group(); head.position.set(.03,.67,0); g.add(head);
  head.add(sph(.2,skin,0,0,0,28));
  g.userData.head=head;
  /* angry: 0 = friendly, 1 = scowl, 2 = shouting. Slanted brows, heavy skin-coloured lids, small pupils, a frown */
  const ang=o.angry===true?1:(o.angry||0);
  [-1,1].forEach(s=>{
    const w=sph(.06,MAT.eyeW,.162,.035,.077*s,18); w.scale.set(.6,1,.85); head.add(w);
    head.add(sph(ang?.024:.028,MAT.pupil,.19,ang?.022:.03,.077*s,12));
    if(ang){
      const bg=new THREE.Group(); bg.position.set(.178,.1,.078*s); bg.rotation.x=-s*(.35+.2*ang);
      const br=mesh(capsuleGeo(.019,.07),MAT.hair); br.rotation.x=Math.PI/2; bg.add(br); head.add(bg);
      const lid=new THREE.Group(); lid.position.set(.162,.023,.077*s); lid.rotation.x=-s*(.3+.15*ang);
      const cap=mesh(new THREE.SphereGeometry(.0645,18,8,0,Math.PI*2,0,Math.PI*.5),skin); cap.scale.set(.6,1,.85); lid.add(cap); head.add(lid);
    }else{
      const br=mesh(capsuleGeo(.013,.055),MAT.hair,.163,.115,.078*s); br.rotation.x=Math.PI/2; br.rotation.y=s*.25; head.add(br);
    }
    head.add(sph(.045,skin,-.01,0,.196*s,12));
  });
  head.add(sph(.036,skin,.2,-.02,0,12));
  const mouth=mesh(new THREE.TorusGeometry(.05,.012,6,14,Math.PI),MAT.mouth,.184,ang?-.12:-.085,0); mouth.rotation.set(0,Math.PI/2,ang?0:Math.PI); head.add(mouth);
  if(ang>=2){
    const om=sph(.04,mat('#2a0d0a'),.176,-.098,0,14); om.scale.set(.3,.8,1.15); head.add(om);
    head.add(rbox(.012,.014,.06,.005,MAT.eyeW,.186,-.076,0));
  }
  if(o.mustache){ const m=mesh(capsuleGeo(.012,.085),MAT.hair,.2,-.052,0); m.rotation.x=Math.PI/2; head.add(m); }
  if(o.hat==='helmet'){
    // open-face race helmet: dome + back/side skirt, centre stripe, short peak
    const H=paint(o.hatColor||'#f5f6f1'), hg=new THREE.Group(); hg.position.y=.025; head.add(hg);
    hg.add(mesh(new THREE.SphereGeometry(.232,28,10,0,Math.PI*2,0,Math.PI*.33),H));
    hg.add(mesh(new THREE.SphereGeometry(.232,24,8,Math.PI+1.0,Math.PI*2-2.0,Math.PI*.33,Math.PI*.37),H));
    if(o.helmetStripe) { const st=mesh(new THREE.TorusGeometry(.234,.022,6,24,Math.PI*.83),paint(o.helmetStripe)); st.rotation.z=Math.PI*.17; hg.add(st); }
    const peak=cylm(.1,.1,.014,MAT.blackGloss,20); peak.scale.set(1.2,1,1.5); peak.position.set(.19,.115,0); peak.rotation.z=-.22; hg.add(peak);
  }else if(o.hat==='capBack'||o.hat==='cap'){
    const H=mat(o.hatColor||'#c62828',{roughness:.8});
    const dome=mesh(new THREE.SphereGeometry(.214,28,12,0,Math.PI*2,0,Math.PI*.44),H,0,.03,0); head.add(dome);
    const brim=cylm(.11,.11,.016,H,24); brim.scale.set(1.35,1,1); brim.position.set(o.hat==='cap'?.2:-.2,.085,0); brim.rotation.z=o.hat==='cap'?-.15:.15; head.add(brim);
  }else if(o.gele){
    head.add(mesh(new THREE.SphereGeometry(.215,28,12,0,Math.PI*2,0,Math.PI*.5),o.gele,0,.01,0));
    [-1,0,1].forEach(i=>{ const f=sph(.18,o.gele,-.03+i*.03,.2,i*.05,20); f.scale.set(.32,.75,1.05); f.rotation.set(i*.45,0,-.25); head.add(f); });
  }else{
    const hair=mesh(new THREE.SphereGeometry(.207,28,12,0,Math.PI*2,0,Math.PI*.42),MAT.hair); hair.rotation.z=.35; head.add(hair);
  }
  const upper=o.arms==='bare'?skin:shirt, lower=o.arms==='long'?shirt:skin, hands=o.hands||{};
  [['L',1],['R',-1]].forEach(([k,s])=>{
    const sh=[0,.4,.19*s];
    if(o.wave===k){
      const piv=new THREE.Group(); piv.position.set(...sh); g.add(piv);
      const el=[.05,.19,.1*s], hd=[.1,.38,.14*s];
      piv.add(limb([0,0,0],el,.055,upper)); piv.add(limb(el,hd,.05,lower)); piv.add(sph(.065,skin,...hd,12));
      if(o.cash){ const n=rbox(.02,.13,.08,.008,MAT.naira,hd[0],hd[1]+.09,hd[2]); n.rotation.x=.3*s; piv.add(n); }
      g.userData.wave=piv; return;
    }
    const hd=hands[k]||[.24,.2,.13*s];
    const mid=[(sh[0]+hd[0])/2, (sh[1]+hd[1])/2-.07, (sh[2]+hd[2])/2+.05*s];
    g.add(limb(sh,mid,.055,upper)); g.add(limb(mid,hd,.05,lower)); g.add(sph(.065,skin,...hd,12));
  });
  const ank=o.ankle||(standing?[0,-.48]:[.34,-.24]);
  [1,-1].forEach(s=>{
    const hip=[.02,.08,.09*s];
    const knee = standing ? [.05,-.2,.1*s] : [.32,.12,.11*s];
    const foot=[ank[0],ank[1],(standing?.1:.11)*s];
    g.add(limb(hip,knee,.075,pants)); g.add(limb(knee,foot,.065,o.shorts?skin:pants));
    g.add(rbox(.19,.08,.11,.035,shoeMat,foot[0]+.05,foot[1]-.045,foot[2]));
  });
  return g;
}

/* ---------- the two drivers (the game picks one; every vehicle seats whoever is chosen) ---------- */
/* red + gold ankara for Mama Put's dress and head tie (its own material, so ANKARA/ANKARA2 on the vehicles don't change) */
const DRIVER_ANKARA = new THREE.MeshStandardMaterial({roughness:.7, side:THREE.DoubleSide, map:ctex(128,128,(x)=>{
  x.fillStyle='#c8321e'; x.fillRect(0,0,128,128);
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){
    const cx=32+i*64, cy=32+j*64;
    x.fillStyle='#f2a900'; x.beginPath(); x.arc(cx,cy,24,0,7); x.fill();
    x.fillStyle='#fff2d0'; x.beginPath(); x.arc(cx,cy,14,0,7); x.fill();
    x.fillStyle='#1a1a1a'; x.beginPath(); x.arc(cx,cy,6,0,7); x.fill();
    x.fillStyle='#1f8a4c'; x.save(); x.translate(cx+32,cy+32); x.rotate(Math.PI/4); x.fillRect(-7,-7,14,14); x.restore();
  }
},3)});
const DRIVER_LOOKS = {
  moshood: { person:{ shirt:'#d9c76a', arms:'bare', pants:'#3a4a66', shorts:true, shoe:'#2d7dd2', mustache:true, angry:2, skin:MAT.skin1 }, build:[.95,1.04,.85] },
  mamaput: { person:{ shirt:DRIVER_ANKARA, arms:'bare', pants:DRIVER_ANKARA, skin:MAT.skin2, gele:DRIVER_ANKARA, shoe:'#6b3d9a', angry:1 }, build:[1,1,1.12] },
};
/* A driver's figure. `seat` carries the pose options the vehicle owns (hands, ankle, pose, wave...). */
function driverFigure(id, seat={}){
  const look=DRIVER_LOOKS[id];
  if(!look) throw new Error('driverFigure: unknown driver '+id);
  const g=person({...look.person, ...seat});
  g.scale.set(...look.build);
  return g;
}
function fixedChild(parent, child, x,y,z, ry=0, lean=0){
  const h=new THREE.Group(); h.position.set(x,y,z); h.rotation.y=ry; child.rotation.z=-lean; h.add(child); parent.add(h); return h;
}
