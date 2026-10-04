/* ---------- BRT: race-prepped "boss" bus ---------- */
// One builder for both liveries: buildBRT('#0f86cf','01') (Blue) and buildBRT('#d4141c','02') (Red).
// Helpers are brt-prefixed because every vehicle file shares one global scope.

// Merge every static mesh under `root` into one mesh per material, so the detailed body costs a handful
// of draw calls on budget phones. Decals stay separate (the showroom mirrors each decal about its own
// centre) and so does any subtree tagged userData.noBake (e.g. the conductor's waving arm).
function brtBake(root){
  root.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(), groups=new Map(), done=[];
  root.traverse(o=>{
    if(!o.isMesh || o.userData.decal) return;
    for(let p=o; p && p!==root; p=p.parent) if(p.userData.noBake) return;
    const geo=o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));
    const k=o.material.uuid; if(!groups.has(k)) groups.set(k,{m:o.material,list:[]});
    groups.get(k).list.push(geo); done.push(o);
  });
  done.forEach(o=>o.parent.remove(o));
  groups.forEach(({m,list})=>root.add(mesh(brtMerge(list),m)));
  return root;
}
function brtMerge(list){
  let n=0; list.forEach(g=>n+=g.attributes.position.count);
  const P=new Float32Array(n*3), N=new Float32Array(n*3), U=new Float32Array(n*2); let o=0;
  list.forEach(g=>{
    if(!g.attributes.normal) g.computeVertexNormals();
    P.set(g.attributes.position.array,o*3); N.set(g.attributes.normal.array,o*3);
    if(g.attributes.uv) U.set(g.attributes.uv.array,o*2);
    o+=g.attributes.position.count; g.dispose();
  });
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(P,3));
  out.setAttribute('normal',new THREE.BufferAttribute(N,3));
  out.setAttribute('uv',new THREE.BufferAttribute(U,2));
  out.computeBoundingSphere();
  return out;
}
// Low-poly rounded box for small trim (fewer bevel/corner segments than rbox).
const brtGeoCache={};
function brtRB(w,h,d,r,m,x,y,z){
  const k=[w,h,d,r].join(',');
  if(!brtGeoCache[k]){
    const b=Math.max(.002,Math.min(r,d/2-.001,w/2-.001,h/2-.001)), depth=Math.max(.001,d-2*b);
    const geo=new THREE.ExtrudeGeometry(rrectShape(w-2*b,h-2*b,Math.max(.0006,r*.6)),{depth,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:3});
    geo.translate(0,0,-depth/2); brtGeoCache[k]=smoothNormals(geo);
  }
  return mesh(brtGeoCache[k],m,x,y,z);
}
// Mirror a decal's texture left-right (lets one swoosh texture serve both sides).
function brtFlipU(d){ const uv=d.geometry.attributes.uv; for(let i=0;i<uv.count;i++) uv.setX(i,1-uv.getX(i)); return d; }

/* ---------- livery textures ---------- */
// Green-yellow-white swoosh rising toward the rear, dissolving into chequers at the front end. u=0 is the front.
function brtSwooshTex(){
  return ctex(1024,256,(x,w,h)=>{
    const cl=v=>Math.max(0,Math.min(1,v)), ss=v=>v*v*(3-2*v);
    const cy=t=>h*(.8-.68*ss(cl((t-.22)/.78))), k=t=>ss(cl((t-.18)/.32));
    [['#1f8a4c',0,46],['#f2c200',40,26],['#ffffff',66,12]].forEach(([c,o,T])=>{
      x.fillStyle=c; x.beginPath();
      for(let i=0;i<=64;i++){ const t=i/64; x.lineTo(t*w, cy(t)+o-k(t)*T/2); }
      for(let i=64;i>=0;i--){ const t=i/64; x.lineTo(t*w, cy(t)+o+k(t)*T/2); }
      x.fill();
    });
    const s=16, n=12, x0=.24*w-n*s;
    for(let i=0;i<n;i++) for(let j=0;j<3;j++){
      x.globalAlpha=Math.pow((i+1)/n,1.4); x.fillStyle=(i+j)%2?'#141414':'#ffffff';
      x.fillRect(x0+i*s, cy(0)+4+j*s, s, s);
    }
    x.globalAlpha=1;
  });
}
function brtLogoTex(){
  return ctex(512,180,(x,w,h)=>{
    x.font='italic 900 150px Archivo, Arial'; x.textAlign='center'; x.textBaseline='middle'; x.lineJoin='round';
    x.lineWidth=16; x.strokeStyle='rgba(8,16,32,.5)'; x.strokeText('BRT',w/2,h/2+8);
    x.fillStyle='#ffffff'; x.fillText('BRT',w/2,h/2+8);
  });
}
// Roof: twin racing stripes in the livery colour, a chequered band and the race number (reads from the door side).
function brtRoofTex(number,stripe){
  const rn=raceNumberTex(number,{bg:'#ffffff',fg:'#111111',ring:'#111111'}).image;
  return ctex(1024,216,(x,w,h)=>{
    const m=h/2;
    x.fillStyle=stripe; [-1,1].forEach(s=>x.fillRect(0,m+s*36-15,w,30));
    x.fillStyle='#f2c200'; [-1,1].forEach(s=>x.fillRect(0,m+s*58-3,w,6));
    for(let i=0;i<3;i++) for(let j=0;j<Math.ceil(h/18);j++){ x.fillStyle=(i+j)%2?'#141414':'#ffffff'; x.fillRect(40+i*18,j*18,18,18); }
    x.fillStyle='#ffffff'; x.beginPath(); x.arc(w*.25,m,86,0,7); x.fill();
    x.drawImage(rn,w*.25-78,m-78,156,156);
  });
}
function brtStackTex(list){ return ctex(512,list.length*140-12,(x)=>list.forEach((t,i)=>x.drawImage(t.image,0,i*140))); }
function brtGlowTex(){
  return ctex(256,128,(x,w,h)=>{
    x.translate(w/2,h/2); x.scale(1,h/w);
    const gr=x.createRadialGradient(0,0,w*.1,0,0,w/2);
    gr.addColorStop(0,'rgba(255,255,255,.45)'); gr.addColorStop(.6,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=gr; x.fillRect(-w/2,-w/2,w,w);
  });
}

function buildBRT(lowerColor, number, driver){
  number=String(number||'01');
  const g=new THREE.Group(), body=new THREE.Group(); g.add(body);
  const add=o=>{ body.add(o); return o; }, dec=o=>{ g.add(o); return o; };
  const PI=Math.PI, LOW=paint(lowerColor), W=MAT.white, BK=MAT.blackGloss, CF=MAT.carbon;
  const GRN='#1f8a4c', YEL='#f2c200';
  // accent colour derived from the livery: underglow neon (blue shifts toward cyan, red toward orange)
  const hsl={}; new THREE.Color(lowerColor).getHSL(hsl);
  const NEON='#'+new THREE.Color().setHSL(((hsl.h+(hsl.h>.3&&hsl.h<.8?-.04:.03))%1+1)%1,1,.55).getHexString();
  const XF=3.3, XR=-3.3, R=.6, ZS=1.27;   // axle x, wheel radius, lower-body side face

  /* ---- shell: coloured lower body with real wheel arches, white upper with raked nose, flush glass band ---- */
  const lo=new THREE.Shape(), AR=.78, yb=.46, yt=1.48, xa=5.62, xb=-5.6;
  lo.moveTo(xb+.14,yb);
  [XR,XF].forEach(xc=>{ lo.lineTo(xc-AR,yb); lo.lineTo(xc-AR,R); lo.absarc(xc,R,AR,PI,0,true); lo.lineTo(xc+AR,yb); });
  lo.lineTo(xa-.14,yb); lo.quadraticCurveTo(xa,yb,xa,yb+.14); lo.lineTo(xa,yt); lo.lineTo(xb,yt); lo.lineTo(xb,yb+.14); lo.quadraticCurveTo(xb,yb,xb+.14,yb);
  add(mesh(profileGeo(lo,2.54,.12),LOW));
  const up=new THREE.Shape();
  up.moveTo(-5.58,1.44); up.lineTo(5.58,1.44); up.lineTo(5.58,1.5); up.lineTo(5.3,2.66); up.quadraticCurveTo(5.25,2.84,5.04,2.84);
  up.lineTo(-5.22,2.84); up.quadraticCurveTo(-5.56,2.84,-5.57,2.56); up.lineTo(-5.58,1.44);
  add(mesh(profileGeo(up,2.5,.16),W));
  const wb=new THREE.Shape(); wb.moveTo(-5.02,1.74); wb.lineTo(5.36,1.74); wb.lineTo(5.14,2.62); wb.lineTo(-4.78,2.62); wb.lineTo(-5.02,1.74);
  add(mesh(profileGeo(wb,2.53,.03),MAT.glass));
  const wf=new THREE.Shape(); wf.moveTo(-5.1,1.69); wf.lineTo(5.44,1.69); wf.lineTo(5.2,2.67); wf.lineTo(-4.84,2.67); wf.lineTo(-5.1,1.69);
  add(mesh(profileGeo(wf,2.518,.03),BK));
  // green + yellow belt pinstripes along the colour line
  add(rbox(11.0,.05,2.56,.025,paint(GRN),-.04,1.515,0));
  add(rbox(11.0,.04,2.56,.02,paint(YEL),-.04,1.566,0));

  /* ---- flared arches + wheel-well liners ---- */
  const fo=.96, fi=.76, fl=new THREE.Shape();
  fl.moveTo(fi,-.14); fl.lineTo(fo,-.14); fl.lineTo(fo,0); fl.absarc(0,0,fo,0,PI,false);
  fl.lineTo(-fo,-.14); fl.lineTo(-fi,-.14); fl.lineTo(-fi,0); fl.absarc(0,0,fi,PI,0,true); fl.lineTo(fi,-.14);
  const flG=profileGeo(fl,.12,.045);
  [XF,XR].forEach(x=>{ [-1,1].forEach(s=>add(mesh(flG,LOW,x,R,1.29*s))); add(fender(.64,2.3,PI*.5,PI,MAT.blackDS,x,R,0)); });

  /* ---- side skirts, underglow, door step ---- */
  [-1,1].forEach(s=>{
    add(rbox(4.6,.24,.14,.06,CF,0,.36,1.3*s));
    add(rbox(1.36,.24,.14,.06,CF,-4.96,.36,1.3*s));
    add(brtRB(4.4,.03,.05,.012,glow(NEON,2),0,.235,1.28*s));
  });
  add(rbox(1.3,.24,.14,.06,CF,4.94,.36,1.3));
  add(rbox(1.3,.16,.14,.05,CF,4.94,.32,-1.3));
  add(rbox(1.06,.05,.28,.025,MAT.alu,4.84,.42,-1.34));

  /* ---- doors (right side, -z): open front door with grab handles, flush middle door ---- */
  add(rbox(1.08,2.24,.04,.04,BK,4.84,1.56,-1.282));
  add(rbox(.94,2.1,.04,.04,mat('#050506',{roughness:1,envMapIntensity:0}),4.84,1.56,-1.29));
  add(rod([4.44,.5,-1.31],[4.44,2.55,-1.31],.022,MAT.chrome));
  add(rod([5.3,1.3,-1.33],[5.3,2.4,-1.33],.022,MAT.chrome));
  const MD=.75;
  [[MD-.56,.07],[MD+.56,.07],[MD,.04]].forEach(([x,w])=>add(brtRB(w,2.22,.03,.015,MAT.black,x,1.56,-1.279)));
  [2.67,.46].forEach(y=>add(brtRB(1.19,.07,.03,.015,MAT.black,MD,y,-1.279)));
  add(rbox(1.06,.86,.03,.04,MAT.glassDk,MD,2.2,-1.281));

  /* ---- nose: raked windscreen + destination board ---- */
  const nose=new THREE.Group(); nose.position.set(5.74,1.5,0); nose.rotation.z=Math.atan2(.28,1.16); body.add(nose);
  nose.add(rbox(.04,1.0,2.16,.1,BK,.012,.55,0));
  nose.add(rbox(.04,.9,2.06,.08,MAT.glassDk,.022,.55,0));
  nose.add(rbox(.04,.22,1.96,.05,BK,.012,1.13,0));
  nose.add(decal(1.86,.19,textTex('OSHODI - OBALENDE',{fg:'#ff9a1a',font:'900 60px Archivo, Arial',w:900,h:100,glow:'#ff7a00'}),.036,1.13,0,FACE.px,0,true));
  const wp=brtRB(.02,.025,.9,.01,BK,.045,.14,.25); wp.rotation.x=.3; nose.add(wp);

  /* ---- front: LED eyes, intakes, armoured ram bumper, splitter, canards ---- */
  add(rbox(.06,.36,2.28,.08,BK,5.745,1.3,0));
  [-1,1].forEach(s=>{
    const led=brtRB(.03,.05,.6,.02,glow('#ffffff',2.4),5.782,1.38,.72*s); led.rotation.x=-.12*s; add(led);
    add(brtRB(.03,.08,.3,.035,MAT.lamp,5.778,1.22,.86*s));
    add(brtRB(.03,.05,.14,.02,MAT.amber,5.778,1.22,1.08*s));
    add(rbox(.06,.4,.34,.1,BK,5.745,.82,.86*s));
    [.74,.98].forEach(y=>{ const c=brtRB(.36,.022,.2,.01,CF,5.6,y,1.3*s); c.rotation.z=-.18; add(c); });
  });
  add(rbox(.06,.38,1.24,.1,BK,5.745,.82,0));
  for(let i=0;i<3;i++) add(mesh(new THREE.BoxGeometry(.025,.025,1.12),CF,5.778,.71+i*.11,0));
  add(rbox(.26,.24,2.58,.06,BK,5.75,.47,0));
  add(rbox(.44,.05,2.7,.02,CF,5.84,.3,0));
  [-1,1].forEach(s=>add(brtRB(.4,.14,.03,.015,CF,5.86,.37,1.34*s)));

  /* ---- rabbit-ear mirrors with carbon heads ---- */
  [-1,1].forEach(s=>{
    add(rod([5.28,2.92,.95*s],[5.8,2.98,1.28*s],.028,BK));
    add(rod([5.8,2.98,1.28*s],[5.87,2.66,1.34*s],.028,BK));
    add(sph(.034,BK,5.8,2.98,1.28*s,10));
    add(rbox(.1,.44,.22,.06,CF,5.88,2.44,1.35*s));
    add(brtRB(.02,.38,.18,.03,MAT.chrome,5.828,2.44,1.35*s));
    add(brtRB(.03,.04,.18,.015,MAT.amber,5.935,2.6,1.35*s));
  });

  /* ---- roof: aero AC pod, LED light bar ---- */
  const pod=new THREE.Shape(); pod.moveTo(2.5,2.96); pod.quadraticCurveTo(2.2,3.2,1.5,3.2); pod.lineTo(-.6,3.18); pod.quadraticCurveTo(-1.0,3.16,-1.05,2.96); pod.lineTo(2.5,2.96);
  add(mesh(profileGeo(pod,1.7,.1),W));
  const scoop=rbox(.1,.14,1.2,.05,BK,2.36,3.1,0); scoop.rotation.z=.55; add(scoop);
  add(rbox(.16,.11,1.5,.045,BK,4.95,3.055,0));
  add(brtRB(.03,.05,1.4,.02,glow('#ffffff',2.4),5.035,3.055,0));

  /* ---- rear: glass, LED tail lights, armour bumper, diffuser, quad exhausts ---- */
  add(rbox(.04,.76,2.0,.1,MAT.glassDk,-5.745,2.2,0));
  const TL=mat('#ff1a12',{emissive:'#ff0000',emissiveIntensity:.9,roughness:.25});
  add(brtRB(.03,.06,2.1,.03,TL,-5.738,1.5,0));
  [-1,1].forEach(s=>add(brtRB(.03,.46,.12,.04,TL,-5.73,1.16,1.0*s)));
  add(rbox(.26,.26,2.56,.06,BK,-5.74,.5,0));
  add(rbox(.34,.17,2.34,.05,CF,-5.7,.29,0));
  [-1.0,-.28,0,.28,1.0].forEach(z=>add(brtRB(.2,.17,.045,.015,CF,-5.86,.29,z)));
  [-.74,-.52,.52,.74].forEach(z=>{
    const p=mesh(new THREE.CylinderGeometry(.07,.07,.26,14,1,true),MAT.chromeDS,-5.86,.47,z); p.rotation.z=PI/2; add(p);
    const c=mesh(new THREE.CylinderGeometry(.058,.058,.02,12),mat('#0a0a0a',{roughness:.9}),-5.9,.47,z); c.rotation.z=PI/2; add(c);
  });

  /* ---- massive rear wing: carbon main plane, livery flap and endplates, swan-neck pylons ---- */
  const af=new THREE.Shape(); af.moveTo(0,0); af.quadraticCurveTo(0,.065,-.16,.065); af.lineTo(-1.0,.065); af.lineTo(-1.0,.035); af.quadraticCurveTo(-.55,-.07,-.18,-.055); af.quadraticCurveTo(0,-.05,0,0);
  const wing=new THREE.Group(); wing.position.set(-4.6,3.48,0); wing.rotation.z=-.15; body.add(wing);
  wing.add(mesh(profileGeo(af,2.66,.025),CF));
  const f2=new THREE.Shape(); f2.moveTo(0,0); f2.quadraticCurveTo(0,.035,-.08,.035); f2.lineTo(-.4,.03); f2.lineTo(-.4,0); f2.quadraticCurveTo(-.2,-.03,0,0);
  const flap=mesh(profileGeo(f2,2.66,.015),LOW,-.72,.13,0); flap.rotation.z=-.5; wing.add(flap);
  const wd=decal(1.9,.44,speedTex('OGA RACING',{fg:'#ffffff',bg:'#111111',accent:YEL}),-.55,.094,0);
  wd.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0,0,1),V(1,0,0),V(0,1,0))); wing.add(wd);
  const ep=new THREE.Shape();
  ep.moveTo(-4.5,3.28); ep.lineTo(-5.7,3.22); ep.quadraticCurveTo(-5.82,3.22,-5.83,3.34); ep.lineTo(-5.85,3.9); ep.quadraticCurveTo(-5.85,4.0,-5.75,3.99);
  ep.lineTo(-4.75,3.78); ep.quadraticCurveTo(-4.6,3.75,-4.56,3.64); ep.lineTo(-4.44,3.4); ep.quadraticCurveTo(-4.4,3.28,-4.5,3.28);
  const epG=profileGeo(ep,.06,.02);
  [-1,1].forEach(s=>{ add(mesh(epG,LOW,0,0,1.36*s)); const p=rbox(.3,.56,.09,.035,CF,-5.0,3.22,.62*s); p.rotation.z=.25; add(p); });

  /* ---- wheels: big low-profile alloys, staggered (wider rears), yellow calipers ---- */
  [[XF,1,.46,1.08],[XF,-1,.46,1.08],[XR,1,.54,1.06],[XR,-1,.54,1.06]].forEach(([x,s,w,z])=>{
    const wh=sportWheel(R,w,'#e0b12a',{spokes:5,lip:'chrome',caliper:lowerColor}), spin=wh.children[0];
    spin.children.slice().forEach(c=>{ if(c.position.z*s < -.001) spin.remove(c); }); // inner face is never seen
    brtBake(spin);
    wh.position.set(x,R,z*s); g.add(wh);
  });

  /* ---- decals ---- */
  const plate=plateTex('LSR 240 BT'), sw=brtSwooshTex(), logo=brtLogoTex();
  const rn=raceNumberTex(number,{bg:'#ffffff',fg:'#111111',ring:'#111111'});
  const agbero=textTex('AGBERO MOTORSPORT',{fg:'#ffffff',font:'italic 900 64px Archivo, Arial',w:1024,h:90});
  const jollof=speedTex('JOLLOF TURBO',{fg:'#ffffff',bg:'#e65100',accent:'#111111'});
  const kabiyesi=speedTex('KABIYESI',{fg:'#111111',bg:YEL,accent:'#111111'});
  const zf=ZS+.004;
  [[1,FACE.pz],[-1,FACE.nz]].forEach(([s,f])=>{
    const d=dec(decal(4.6,.98,sw,0,.98,zf*s,f)); if(s<0) brtFlipU(d);
    dec(decal(1.5,.53,logo,-1.45,.78,zf*s,f));
    dec(decal(.86,.86,rn,-4.86,.98,zf*s,f));
    dec(decal(1.82,.16,agbero,0,.36,1.374*s,f));
    dec(decal(1.0,.25,jollof,1.82,1.24,zf*s,f));
    dec(decal(.9,.22,kabiyesi,-5.15,3.52,1.394*s,f));
  });
  dec(decal(1.0,.75,brtStackTex([speedTex('OGA RACING',{fg:'#ffffff',bg:'#111111',accent:YEL}),
    speedTex('SUYA SPEED',{fg:'#c62828',bg:'#ffffff',accent:GRN}), speedTex('ÈKÓ NITRO',{fg:'#ffffff',bg:GRN,accent:YEL})]),4.88,.96,zf,FACE.pz));
  const rd=decal(10.0,2.1,brtRoofTex(number,lowerColor),-.08,3.004,0);
  rd.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1,0,0),V(0,0,1),V(0,1,0))); dec(rd);
  dec(decal(.36,.17,plate,5.798,.82,0,FACE.px));
  dec(decal(.56,.12,textTex('240002',{fg:'#ffffff',font:'900 70px Archivo, Arial',w:380,h:90}),5.779,1.27,0,FACE.px));
  dec(decal(.36,.17,plate,-5.726,.8,0,FACE.nx));
  dec(decal(.9,.32,logo,-5.726,1.13,0,FACE.nx));
  dec(decal(1.5,.19,textTex('NO SHAKING',{fg:'#ffffff',font:'italic 900 64px Archivo, Arial',w:700,h:90}),-5.769,1.95,0,FACE.nx));

  /* ---- underglow pool on the ground ---- */
  const ug=new THREE.Mesh(new THREE.PlaneGeometry(11.6,3.3),new THREE.MeshBasicMaterial({map:brtGlowTex(),color:NEON,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));
  ug.rotation.x=-PI/2; ug.position.y=.012; g.add(ug);

  /* ---- conductor in race helmet, leaning out of the open front door, waving and shouting the stop ---- */
  const con=driver ? driverFigure(driver,{pose:'stand', hands:{L:[-.19,.87,.37]}, wave:'R'})
    : person({shirt:YEL, pants:'#1f2a44', hat:'helmet', hatColor:'#f6f6f2', helmetStripe:lowerColor, pose:'stand', hands:{L:[-.19,.87,.37]}, wave:'R'});
  con.scale.multiplyScalar(1.1);
  con.userData.wave.userData.noBake=true;
  brtBake(con);
  fixedChild(g,con,4.84,1.068,-1.42,PI/2,.15);
  g.userData.anim=t=>{ con.userData.wave.rotation.x=-.2+Math.sin(t*5)*.5; };

  brtBake(body);
  return g;
}
