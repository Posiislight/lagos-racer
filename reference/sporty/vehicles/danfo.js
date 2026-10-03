/* ---------- DANFO (race build) ----------
   Touring-car / rally-raid build of the old yellow Lagos bus: lowered on fat sport wheels, bolt-on box
   flares, carbon splitter, skirts and diffuser, roof-rack light bar and a rear wing behind the rack.
   Keeps the danfo identity: yellow with two black stripes, sliding door jammed open (right, -z),
   conductor on the step, passenger on the wooden chair, driver's elbow out of the left window, loaded rack. */

// Merge the static meshes that are direct children of `root` and share a material (fewer draw calls on phones).
function danfoMerge(root){
  const groups=new Map();
  root.children.slice().forEach(o=>{
    if(!o.isMesh || o.userData.decal || o.userData.keep) return;
    (groups.get(o.material)||groups.set(o.material,[]).get(o.material)).push(o);
  });
  groups.forEach((list,m)=>{
    if(list.length<2) return;
    const parts=list.map(o=>{ o.updateMatrix(); return (o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrix); });
    const geo=new THREE.BufferGeometry();
    ['position','normal','uv'].forEach(n=>{
      if(!parts.every(p=>p.attributes[n])) return;
      const arr=new Float32Array(parts.reduce((a,p)=>a+p.attributes[n].array.length,0)); let off=0;
      parts.forEach(p=>{ arr.set(p.attributes[n].array,off); off+=p.attributes[n].array.length; });
      geo.setAttribute(n,new THREE.BufferAttribute(arr,parts[0].attributes[n].itemSize));
    });
    list.forEach(o=>root.remove(o)); root.add(mesh(geo,m));
  });
  return root;
}
// Sport wheel with the hidden inboard spokes stripped and the rest merged. side: +1 left (+z), -1 right (-z).
function danfoWheel(side){
  const w=sportWheel(.42,.34,'#1c1c1f',{spokes:6, lip:'#f7b500', caliper:'#19a64a', rimRatio:.72});
  const spin=w.children[0];
  spin.children.slice().forEach(o=>{ if(Math.abs(o.position.z)>.01 && Math.sign(o.position.z)!==side) spin.remove(o); });
  danfoMerge(spin);
  return w;
}
// Tilt a front-facing decal back to lie on a raked surface (windscreen, bumper).
function danfoTilt(d,a){ d.rotation.order='ZYX'; d.rotation.z=a; return d; }
// Plain box for tiny trim (LED strips, louvres) where a rounded box would only cost triangles.
function danfoBox(w,h,d,m,x,y,z){ return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z); }
// Wing top graphic: chequered fades running in from both tips to a "NO SHAKING" sponsor box.
function danfoWingTex(){
  return ctex(1024,128,(x,w,h)=>{
    const c=32;
    for(let i=0;i<12;i++) for(let j=0;j<4;j++){ if((i+j)%2) continue; const k=c*(1-i/12)*.96;
      [i*c+c/2, w-i*c-c/2].forEach(cx=>{ x.fillStyle='#111'; x.fillRect(cx-k/2,j*c+c/2-k/2,k,k); }); }
    x.fillStyle='#111'; x.beginPath(); x.moveTo(420,14); x.lineTo(640,14); x.lineTo(604,114); x.lineTo(384,114); x.closePath(); x.fill();
    x.fillStyle='#19a64a'; x.beginPath(); x.moveTo(612,14); x.lineTo(640,14); x.lineTo(604,114); x.lineTo(576,114); x.closePath(); x.fill();
    x.fillStyle='#f7b500'; x.font='italic 900 52px Archivo, Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('NO SHAKING',w/2-14,h/2+3);
  });
}

function buildDanfo(){
  const g=new THREE.Group(), Y=paint('#f7b500'), BK=MAT.black, BG=MAT.blackGloss, CF=MAT.carbon, b=.1;
  const WX=1.5, WR=.42, WZ=.92, BOT=.40, AR=.55, HW=.88, TOP=1.64; // wheel x/radius/track, body bottom, arch radius (shape), half width, roof (shape)
  const add=o=>{ g.add(o); return o; };

  /* body: side profile with wheel arches cut in, raked windscreen, chopped roof */
  const s=new THREE.Shape(), da=Math.asin((WR-BOT)/AR), dx=AR*Math.cos(da);
  s.moveTo(-2.12,BOT);
  [-WX,WX].forEach(cx=>{ s.lineTo(cx-dx,BOT); s.absarc(cx,WR,AR,Math.PI+da,-da,true); });
  s.lineTo(2.1,BOT); s.quadraticCurveTo(2.2,BOT,2.2,BOT+.1);
  s.lineTo(2.2,1.10); s.lineTo(1.98,1.52); s.quadraticCurveTo(1.93,TOP,1.78,TOP);
  s.lineTo(-2.06,TOP); s.quadraticCurveTo(-2.2,TOP,-2.2,TOP-.14);
  s.lineTo(-2.2,BOT+.08); s.quadraticCurveTo(-2.2,BOT,-2.12,BOT);
  add(mesh(profileGeo(s,HW*2,b),Y));

  /* bolt-on box flares (widebody) */
  const fs=new THREE.Shape(), fr=.5, fb=-.12, fx=Math.sqrt(fr*fr-fb*fb), fa=Math.atan2(fb,fx);
  fs.moveTo(-.62,fb); fs.lineTo(-.53,.42); fs.quadraticCurveTo(-.51,.53,-.4,.53); fs.lineTo(.4,.53);
  fs.quadraticCurveTo(.51,.53,.53,.42); fs.lineTo(.62,fb); fs.lineTo(fx,fb); fs.absarc(0,0,fr,fa,Math.PI-fa,false); fs.lineTo(-.62,fb);
  const flareGeo=profileGeo(fs,.26,.05);
  [-WX,WX].forEach(x=>{ [-1,1].forEach(z=>add(mesh(flareGeo,Y,x,WR,1.0*z))); add(fender(.44,2.2,Math.PI*.5,Math.PI,MAT.blackDS,x,WR,0)); });

  /* windscreen (raked) + sun strip */
  const wa=V(2.2,1.10,0), wb=V(1.98,1.52,0), wd=wb.clone().sub(wa), wn=V(wd.y,-wd.x,0).normalize(), wang=Math.atan2(-wd.x,wd.y), wu=wd.clone().normalize();
  const wm=wa.clone().add(wb).multiplyScalar(.5).addScaledVector(wn,b);
  [[.5,1.58,BK,.004],[.4,1.46,MAT.glassDk,.014]].forEach(([h,d,m,off])=>{ const o=add(rbox(.03,h,d,.04,m,wm.x+wn.x*off,wm.y+wn.y*off,0)); o.rotation.z=wang; });
  add(danfoTilt(decal(1.3,.09,textTex('AGBERO MOTORSPORT',{fg:'#f7b500',font:'italic 900 60px Archivo, Arial',w:900,h:80}),
    wm.x+wn.x*.032+wu.x*.15,wm.y+wn.y*.032+wu.y*.15,0,FACE.px),wang));

  /* nose: grille band with slim LED lamps, number roundel as the badge */
  add(rbox(.04,.2,1.56,.03,BG,2.3,.88,0));
  [-1,1].forEach(z=>{
    add(rbox(.03,.07,.36,.03,MAT.lamp,2.322,.9,.55*z)).rotation.x=-.13*z;
    add(danfoBox(.02,.02,.4,glow('#e6fbff',1.6),2.326,.835,.55*z)).rotation.x=-.13*z;
    add(danfoBox(.03,.05,.05,MAT.amber,2.322,.93,.78*z));
  });
  add(decal(.27,.27,raceNumberTex('14'),2.33,.88,0,FACE.px));
  // aero chin bumper (raked face), intakes, splitter, canards, tow hook
  const bs=new THREE.Shape();
  bs.moveTo(2.14,.62); bs.lineTo(2.34,.6); bs.quadraticCurveTo(2.41,.59,2.42,.53); bs.lineTo(2.48,.3); bs.quadraticCurveTo(2.49,.24,2.43,.24); bs.lineTo(2.14,.24); bs.lineTo(2.14,.62);
  add(mesh(profileGeo(bs,1.74,.06),Y));
  const ba=Math.atan2(.06,.23), bx=y=>2.48+(.545-y)*.261;   // bumper face tilt and its x at height y
  const onB=(o,y,off)=>{ o.position.set(bx(y)+off,y,o.position.z); o.rotation.z=ba; return add(o); };
  onB(rbox(.04,.1,.62,.04,BK,0,0,0),.31,-.012);
  [-1,1].forEach(z=>{
    onB(rbox(.04,.13,.28,.05,BK,0,0,.58*z),.39,-.012);
    onB(danfoBox(.02,.026,.22,glow('#e6fbff',1.4),0,0,.58*z),.39,.012);
    const c=add(rbox(.22,.02,.14,.01,CF,2.4,.52,.86*z)); c.rotation.z=.2;
  });
  add(danfoTilt(decal(.32,.15,plateTex('APP 419 XA'),bx(.47)+.006,.47,0,FACE.px),ba));
  add(rbox(.44,.035,2.1,.015,CF,2.42,.165,0));
  const hook=add(mesh(new THREE.TorusGeometry(.045,.013,6,14),paint('#e0201b'),2.53,.27,.42)); hook.rotation.y=Math.PI/2;

  /* two bold black racing stripes, wrapping the body (split on the door side around the opening) */
  [1.04,1.13].forEach(y=>{
    add(rbox(1.52,.06,HW*2+.02,.015,BK,1.57,y,0));
    add(rbox(2.34,.06,HW*2+.02,.015,BK,-1.15,y,0));
    add(rbox(.86,.06,.03,.012,BK,.42,y,HW+.005));
  });

  /* side windows: white frames, tinted glass; driver's window wound down */
  const WY=1.39, win=(x,w,z,m)=>{ add(rbox(w+.08,.4,.02,.03,MAT.white,x,WY,(HW-.004)*z)); add(rbox(w,.32,.02,.03,m||MAT.glassDk,x,WY,(HW+.004)*z)); };
  [[.42,.74],[-.48,.86],[-1.45,.82]].forEach(([x,w])=>win(x,w,1));
  win(1.62,.56,-1); win(-1.45,.82,-1); win(1.62,.56,1,mat('#0d0d0d'));
  [-1,1].forEach(z=>{ for(let i=0;i<3;i++) add(danfoBox(.18,.025,.02,BK,-2.06,1.32+i*.07,(HW+.004)*z)); });

  /* open sliding door (right, -z): dark doorway, door slid back along the side */
  const DZ=-(HW+.035);
  add(rbox(.8,1.28,.02,.03,mat('#0d0d0d'),.42,.99,-(HW+.002)));
  add(rbox(.82,1.26,.05,.03,Y,-.4,.98,DZ));
  add(rbox(.7,.4,.02,.03,MAT.white,-.4,WY,DZ-.026)); add(rbox(.62,.32,.02,.03,MAT.glassDk,-.4,WY,DZ-.032));
  [1.04,1.13].forEach(y=>add(rbox(.82,.06,.03,.012,BK,-.4,y,DZ-.02)));
  add(danfoBox(.1,.025,.025,MAT.chrome,-.04,1.0,DZ-.03));

  /* side skirts, door step, underglow */
  [-1,1].forEach(z=>{
    add(rbox(1.72,.14,.12,.05,CF,0,.3,(HW+.035)*z));
    add(rbox(1.6,.016,.03,.008,glow('#19e36b',2),0,.225,HW*z));
  });
  add(rbox(.8,.03,.16,.01,MAT.alu,.42,.385,-(HW+.06)));

  /* mirrors: carbon aero pods */
  [-1,1].forEach(z=>{
    add(rod([2.05,1.18,.84*z],[2.02,1.26,.98*z],.014,BK));
    add(rbox(.13,.09,.17,.045,CF,2.02,1.29,1.01*z));
    add(danfoBox(.01,.066,.12,MAT.chrome,1.952,1.29,1.01*z));
  });

  /* rear: window, LED tails, bumper, diffuser, centre-exit exhausts, rain light */
  add(rbox(.02,.38,1.44,.03,MAT.white,-2.302,1.37,0)); add(rbox(.02,.3,1.34,.03,MAT.glassDk,-2.31,1.37,0));
  [-1,1].forEach(z=>{ add(rbox(.04,.26,.12,.03,BG,-2.3,.86,.72*z)); add(danfoBox(.02,.2,.07,glow('#ff1a0a',1.3),-2.322,.86,.72*z)); });
  add(danfoBox(.02,.026,1.3,glow('#ff1a0a',1.3),-2.312,.765,0));
  add(decal(1.28,.16,textTex('NO FOOD FOR LAZY MAN',{fg:'#231f1b',font:'900 58px Archivo, Arial',w:820,h:100}),-2.31,.9,0,FACE.nx));
  add(decal(.34,.16,plateTex('APP 419 XA'),-2.31,.66,0,FACE.nx));
  add(rbox(.26,.22,1.76,.08,BG,-2.32,.41,0));
  add(rbox(.42,.04,1.66,.02,CF,-2.36,.19,0));
  [-.74,-.48,.48,.74].forEach(z=>add(rbox(.36,.13,.025,.01,CF,-2.4,.25,z)));
  const TI=mat('#8a7fb8',{metalness:1,roughness:.22,side:DS});
  [-.17,.17].forEach(z=>{
    const t=add(mesh(new THREE.CylinderGeometry(.08,.075,.26,16,1,true),TI,-2.44,.27,z)); t.rotation.z=Math.PI/2;
    const c=add(cylm(.068,.068,.01,BK,16)); c.rotation.z=Math.PI/2; c.position.set(-2.5,.27,z);
  });
  add(rbox(.03,.08,.07,.02,glow('#ff1a0a',1.8),-2.47,.27,0));
  add(decal(.6,.12,speedTex('SUYA SPEED',{bg:'#111',fg:'#f7b500',accent:'#e0201b'}),-2.452,.41,0,FACE.nx));

  /* wheels */
  [[WX,1],[WX,-1],[-WX,1],[-WX,-1]].forEach(([x,z])=>{ const w=danfoWheel(z); w.position.set(x,WR,WZ*z); g.add(w); });

  /* livery: race number 14, invented sponsors, the slogans, one cheeky Bondo touch-up */
  const N=raceNumberTex('14');
  add(decal(.42,.42,N,.42,.58,HW+.003,FACE.pz));
  add(decal(.4,.4,N,-.4,.64,DZ-.026,FACE.nz));
  add(decal(1.5,.15,textTex("GOD'S TIME IS BEST",{fg:'#231f1b',font:'900 58px Archivo, Arial',w:820,h:100}),-.02,.88,HW+.003,FACE.pz));
  add(decal(.7,.17,speedTex('JOLLOF TURBO',{bg:'#111',fg:'#fff',accent:'#e0201b'}),-.36,.58,HW+.003,FACE.pz));
  add(decal(1.1,.1,speedTex('KABIYESI',{bg:'#f7b500',fg:'#111',accent:'#19a64a'}),0,.3,HW+.096,FACE.pz));
  add(decal(1.1,.1,speedTex('ÈKÓ NITRO',{bg:'#f7b500',fg:'#111',accent:'#19a64a'}),0,.3,-(HW+.096),FACE.nz));
  const bondo=ctex(160,110,(x,w,h)=>{
    x.fillStyle='rgba(150,72,30,.8)'; x.beginPath(); x.ellipse(w/2,h/2,74,48,.1,0,7); x.fill();
    x.fillStyle='#a4a49c'; x.beginPath(); x.ellipse(w/2+3,h/2-2,64,40,.1,0,7); x.fill();
    x.strokeStyle='rgba(255,255,255,.35)'; x.lineWidth=2; for(let i=0;i<7;i++){ x.beginPath(); x.arc(w/2+(i%3-1)*16,h/2+4,12+i*4,.5,2.5); x.stroke(); }
  });
  add(decal(.24,.16,bondo,-.66,.43,DZ-.026,FACE.nz));

  /* roof rack with a rally light bar up front, rear wing on carbon pylons behind it */
  const RY=TOP+.21;
  [-1,1].forEach(z=>add(rod([-1.85,RY,.72*z],[1.3,RY,.72*z],.024,BG)));
  [-1.7,-.9,-.1,.7,1.25].forEach(x=>{ add(rod([x,RY,-.72],[x,RY,.72],.018,BG)); [-1,1].forEach(z=>add(rod([x,TOP+.09,.72*z],[x,RY,.72*z],.016,BG))); });
  add(rbox(.1,.13,1.5,.04,BG,1.32,RY+.08,0));
  [-.54,-.18,.18,.54].forEach(z=>{
    const h=add(cylm(.075,.085,.09,BG,16)); h.rotation.z=Math.PI/2; h.position.set(1.4,RY+.08,z);
    const l=add(cylm(.064,.064,.02,glow('#fff6d8',1.1),16)); l.rotation.z=Math.PI/2; l.position.set(1.448,RY+.08,z);
  });
  [-1,1].forEach(z=>{ const p=add(rbox(.3,.3,.04,.02,CF,-2.06,TOP+.22,.5*z)); p.rotation.z=-.3; });
  const ep=new THREE.Shape(); ep.moveTo(.3,-.06); ep.lineTo(.3,.08); ep.quadraticCurveTo(.3,.12,.24,.12); ep.lineTo(-.26,.15); ep.quadraticCurveTo(-.36,.15,-.36,.06);
  ep.lineTo(-.34,-.12); ep.quadraticCurveTo(-.33,-.16,-.26,-.16); ep.lineTo(.18,-.12); ep.quadraticCurveTo(.3,-.11,.3,-.06);
  const epGeo=profileGeo(ep,.035,.012);
  const wing=new THREE.Group(); wing.position.set(-2.16,TOP+.36,0); wing.rotation.z=-.12; g.add(wing);
  wing.add(rbox(.58,.06,2.1,.03,Y,0,0,0));
  wing.add(danfoBox(.02,.06,2.06,BK,-.28,.05,0));
  const wtop=decal(2.0,.25,danfoWingTex(),-.04,.0305,0,0,-Math.PI/2); wtop.rotation.x=-Math.PI/2; wing.add(wtop);
  [-1,1].forEach(z=>{
    wing.add(mesh(epGeo,CF,0,0,1.06*z));
    wing.add(decal(.4,.09,speedTex('OGA RACING',{bg:'#111',fg:'#f7b500',accent:'#19a64a'}),-.04,-.02,(1.06+.022)*z,z>0?FACE.pz:FACE.nz));
  });
  danfoMerge(wing);

  /* the load */
  add(rbox(.8,.46,.56,.08,PLAID,-.5,RY+.25,.18));
  add(rbox(.55,.38,.5,.04,mat('#b58a55'),-1.3,RY+.2,-.28));
  add(decal(.3,.08,textTex('FRAGILE',{fg:'#8b1a1a',font:'900 54px Archivo, Arial',w:320,h:80}),-1.3,RY+.2,-.532,FACE.nz));
  const JC=paint('#e0201b'); add(rbox(.28,.4,.16,.05,JC,-1.6,RY+.22,.45)); add(rod([-1.6,RY+.42,.45],[-1.6,RY+.48,.45],.03,JC));
  for(let i=0;i<6;i++) add(limb([.3+i*.06,RY+.09,-.25-i*.04],[.55+i*.05,RY+.15,-.1-i*.05],.04,paint(i%2?'#7cb342':'#cddc39')));
  add(rod([.3,RY+.1,-.6],[.6,RY+.1,.6],.012,mat('#2b6cb0')));
  add(rod([-.75,RY+.48,-.12],[-.25,RY+.48,.48],.012,mat('#2b6cb0')));

  /* ground glow under the van (underglow light pool) */
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(4.2,2.0), new THREE.MeshBasicMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    map:ctex(128,64,(x,w,h)=>{ const gr=x.createRadialGradient(w/2,h/2,4,w/2,h/2,w/2); gr.addColorStop(0,'rgba(25,227,107,.7)'); gr.addColorStop(.7,'rgba(25,227,107,.25)'); gr.addColorStop(1,'rgba(25,227,107,0)');
      x.save(); x.scale(1,h/w); x.fillStyle=gr; x.fillRect(0,0,w,w); x.restore(); })}));
  pool.rotation.x=-Math.PI/2; pool.position.y=.006; pool.renderOrder=1; pool.userData.keep=true; g.add(pool);

  /* driver: race-suit elbow out of the left window, helmeted head leaning out */
  add(limb([1.48,1.18,.74],[1.68,1.25,.99],.06,mat('#1f8a4c'))); add(limb([1.68,1.25,.99],[1.93,1.31,.96],.05,MAT.skin2));
  add(sph(.06,mat('#111'),1.95,1.32,.96,12));
  const drv=person({hat:'helmet', hatColor:'#f5f6f1', helmetStripe:'#19a64a', skin:MAT.skin2});
  const head=drv.children.find(o=>o.isGroup); head.position.set(1.56,1.43,.95); head.scale.setScalar(.92); g.add(danfoMerge(head));

  /* passenger on the extra wooden chair in the doorway */
  const ch=new THREE.Group(); ch.position.set(.22,.36,-.8); ch.rotation.y=-Math.PI/2;
  ch.add(rbox(.34,.04,.34,.01,MAT.wood,0,.36,0)); ch.add(rbox(.04,.4,.34,.01,MAT.wood,.17,.58,0));
  [[-.15,-.15],[-.15,.15],[.15,-.15],[.15,.15]].forEach(([x,z])=>ch.add(rod([x,0,z],[x,.36,z],.018,MAT.wood)));
  g.add(danfoMerge(ch));
  const pas=person({shirt:'#90a4ae', pants:'#263238', ankle:[.2,-.3]});
  fixedChild(g,pas,.22,.76,-.8,Math.PI/2); danfoMerge(pas);

  /* conductor on the step, singlet, hanging out and waving cash */
  const con=person({shirt:'#f4f4f4', pants:'#6d5f4e', arms:'bare', hat:'capBack', hatColor:'#111', pose:'stand', hands:{L:[-.08,.98,.22]}, wave:'R', cash:true});
  g.userData.con=fixedChild(g,con,.78,.9,-1.0,Math.PI/2,.22); danfoMerge(con);

  danfoMerge(g);
  g.userData.anim=t=>{ con.userData.wave.rotation.x=-.2+Math.sin(t*6)*.5; g.position.y=Math.abs(Math.sin(t*4))*.012; };
  return g;
}
