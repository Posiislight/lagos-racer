/* ---------- OKADA (factory race build) ---------- */
// Helpers are prefixed "okada" so they can't clash with the other vehicle files (shared global scope).

// Side-profile Shape from points; a 4-number entry is a quadratic curve [cx,cy,x,y].
function okadaShape(pts){
  const s=new THREE.Shape(); s.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++){ const p=pts[i]; if(p.length===4) s.quadraticCurveTo(p[0],p[1],p[2],p[3]); else s.lineTo(p[0],p[1]); }
  s.closePath(); return s;
}
// Linear taper factor along x, clamped.
function okadaTaper(x0,s0,x1,s1){ return x=>{ const t=Math.min(1,Math.max(0,(x-x0)/(x1-x0))); return s0+(s1-s0)*t; }; }
// Extruded, bevelled body panel. UV v runs across the width (for racing stripes), then the panel is
// sculpted narrower along x by `taper` so it reads as a shaped part rather than a slab.
function okadaPanel(pts,W,bevel,m,taper){
  const geo=profileGeo(okadaShape(pts),W,bevel), p=geo.attributes.position, uv=geo.attributes.uv;
  for(let i=0;i<p.count;i++){ uv.setXY(i,p.getX(i)*2,p.getZ(i)/W+.5); if(taper) p.setZ(i,p.getZ(i)*taper(p.getX(i),p.getY(i))); }
  return mesh(taper?smoothNormals(geo):geo,m);
}
// Rounded beam between two points in the side (x,y) plane at depth z.
function okadaBeam(a,b,h,d,m,z,r){
  const L=Math.hypot(b[0]-a[0],b[1]-a[1]), o=rbox(L,h,d,r||Math.min(h,d)*.45,m,(a[0]+b[0])/2,(a[1]+b[1])/2,z);
  o.rotation.z=Math.atan2(b[1]-a[1],b[0]-a[0]); return o;
}
// Matching decals on both flanks. `ang` follows a tapered side wall (positive when it widens toward +x).
function okadaSides(g,w,h,tex,x,y,z,rz=0,ang=0){
  g.add(decal(w,h,tex,x,y,z+.003,FACE.pz-ang,rz));
  g.add(decal(w,h,tex,x,y,-z-.003,FACE.nz+ang,-rz));
}
// World point -> rider-local point (rider is leaned forward by `lean` about z).
function okadaLocal(w,pos,lean){
  const dx=w[0]-pos[0], dy=w[1]-pos[1], c=Math.cos(lean), s=Math.sin(lean);
  return [dx*c-dy*s, dx*s+dy*c, w[2]];
}

// Low-poly rounded box for small parts (core rbox() costs ~750 triangles whatever its size).
const okadaGC={};
function okadaBox(w,h,d,r,m,x,y,z){
  const k=[w,h,d,r].join(','); let geo=okadaGC[k];
  if(!geo){ const b=Math.max(.002,Math.min(r,d/2-.001,w/2-.001,h/2-.001)), depth=Math.max(.001,d-2*b);
    geo=new THREE.ExtrudeGeometry(rrectShape(w-2*b,h-2*b,Math.max(.0006,r*.6)),{depth,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:1,curveSegments:2});
    geo.translate(0,0,-depth/2); geo=okadaGC[k]=smoothNormals(geo,Math.PI/2.2); }
  return mesh(geo,m,x,y,z);
}

function buildOkada(body, driver){
  const g=new THREE.Group();
  const RED=body||'#b8000c', GOLD='#e09a00', WHITE='#f6f6f2';
  const BODY=paint(RED), BK=MAT.blackGloss, CF=MAT.carbon, ALU=MAT.alu;
  const GOLDM=mat('#d08a10',{metalness:.85,roughness:.28});          // anodised gold
  const TI=mat('#cfd2d6',{metalness:.9,roughness:.28});               // titanium can
  // Livery paint: red with twin white racing stripes and a gold centre pin (linear canvas so it matches paint()).
  const livCan=document.createElement('canvas'); livCan.width=4; livCan.height=256;
  const lx=livCan.getContext('2d'); lx.fillStyle=RED; lx.fillRect(0,0,4,256);
  lx.fillStyle=WHITE; lx.fillRect(0,90,4,26); lx.fillRect(0,140,4,26); lx.fillStyle=GOLD; lx.fillRect(0,122,4,12);
  const livTex=new THREE.CanvasTexture(livCan); livTex.anisotropy=8;
  const LIV=new THREE.MeshPhysicalMaterial({color:'#ffffff',map:livTex,roughness:.3,metalness:.1,clearcoat:1,clearcoatRoughness:.1});

  /* --- wheels: black alloys, gold lip, gold calipers, fat low-profile rear --- */
  const FX=.68, RX=-.63, R=.31;
  const fw=sportWheel(R,.11,'#161616',{spokes:5,lip:GOLD,caliper:GOLD}); fw.position.set(FX,R,0);
  const rw=sportWheel(R,.15,'#161616',{spokes:5,lip:GOLD,caliper:GOLD}); rw.position.set(RX,R,0);
  g.add(fw,rw);
  // yellow race-tyre sidewall stripes (rotationally symmetric, so they needn't spin)
  [[fw,.11],[rw,.15]].forEach(([wh,w])=>{ const ri=R*.74, rc=R-Math.min(.05,w*.25); [-1,1].forEach(s=>wh.add(mesh(new THREE.TorusGeometry((ri+rc)/2,.0045,4,36),mat('#ffd23f',{roughness:.5}),0,0,s*(w/2+.001)))); });
  g.add(fender(.345,.1,Math.PI*.55,Math.PI*.6,MAT.carbonDS,FX,R,0));           // carbon front hugger
  g.add(fender(.36,.14,Math.PI*.74,Math.PI*.4,MAT.carbonDS,RX,R,0));           // carbon rear hugger

  /* --- upside-down gold forks + clamps --- */
  const A=[FX,R], T=[.505,.975], P=t=>[A[0]+(T[0]-A[0])*t, A[1]+(T[1]-A[1])*t];
  const forkAng=Math.atan2(T[1]-A[1],T[0]-A[0])-Math.PI/2;
  [-1,1].forEach(s=>{ const z=.088*s;
    g.add(rod([...P(.02),z],[...P(.52),z],.02,MAT.chrome,12));
    g.add(rod([...P(.46),z],[...P(1),z],.036,GOLDM,14));
    const foot=okadaBox(.06,.1,.045,.02,BK,A[0]-.01,A[1]+.02,z); foot.rotation.z=forkAng; g.add(foot);
  });
  [.97,.76].forEach(t=>{ const y=okadaBox(.1,.03,.25,.014,BK,...P(t),0); y.rotation.z=forkAng; g.add(y); });

  /* --- front fairing: wedge nose, angry LED eyes, nose number, winglets, iridium flyscreen --- */
  const fTaper=okadaTaper(.55,1,.83,.72), fV=okadaTaper(.78,.62,.97,1);
  g.add(okadaPanel([[.58,.83],[.70,.82],[.79,.83,.785,.885],[.68,1.03],[.64,1.065,.60,1.05],[.565,1.0]],.30,.045,LIV,(x,y)=>fTaper(x)*fV(y)));
  // the nose face is the straight edge (.785,.885)->(.68,1.03); offset by the bevel to sit on its surface
  const F0=[.785,.885], FD=[-.105,.145], FL=Math.hypot(...FD), FN=[FD[1]/FL,-FD[0]/FL], FA=Math.atan2(FN[1],FN[0]);
  const onFace=(u,off)=>[F0[0]+FD[0]*u+FN[0]*(.045+off), F0[1]+FD[1]*u+FN[1]*(.045+off)];
  const LED=glow('#eaf7ff',2.6);
  [-1,1].forEach(s=>{
    const so=okadaBox(.016,.046,.095,.016,BK,...onFace(.3,-.002),.07*s); so.rotation.order='ZYX'; so.rotation.set(.42*s,0,FA); g.add(so);
    const e=okadaBox(.02,.022,.08,.01,LED,...onFace(.3,.006),.07*s); e.rotation.order='ZYX'; e.rotation.set(.42*s,0,FA); g.add(e); });
  const n07=decal(.085,.085,raceNumberTex('07',{bg:WHITE,fg:'#111',ring:'#111'}),...onFace(.68,.003),0); n07.rotation.order='ZYX'; n07.rotation.set(0,FACE.px,FA); g.add(n07);
  g.add(okadaPanel([[.655,1.05],[.69,1.07],[.62,1.17,.545,1.235],[.53,1.225],[.60,1.16,.655,1.05]],.22,.006,new THREE.MeshPhysicalMaterial({color:'#2a3d8c',roughness:.06,metalness:.65,clearcoat:1}),okadaTaper(.53,.7,.69,1)));
  okadaSides(g,.12,.028,textTex('SHINE YOUR EYE',{fg:'#ffd23f',stroke:'#111',font:'900 50px Archivo, Arial',w:440,h:90}),.635,.997,.15*fTaper(.635),0,-Math.atan(.15*.28/.28));   // nose narrows toward +x, so the wall angle is negative
  [-1,1].forEach(s=>{
    const wl=okadaBox(.12,.018,.1,.008,CF,.735,.865,.15*fTaper(.735)*fV(.865)+.045); wl.position.z*=s; wl.rotation.set(-.3*s,0,-.12); g.add(wl);
    const ind=sph(.018,MAT.amber,.62,.85,.142*s,10); ind.scale.set(1.8,.8,1); g.add(ind);
  });

  /* --- clip-on bars, levers, bar-end weights, tassels, aero mirrors --- */
  [-1,1].forEach(s=>{
    g.add(rod([.505,.94,.09*s],[.462,.928,.22*s],.017,ALU));
    g.add(limb([.465,.928,.2*s],[.455,.925,.31*s],.025,MAT.rubber));
    g.add(sph(.028,GOLDM,.455,.925,.33*s,12));
    g.add(rod([.49,.945,.15*s],[.535,.935,.29*s],.007,BK,6));
    ['#e53935','#43a047','#fdd835','#1e88e5'].forEach((c,i)=>g.add(okadaBox(.012,.15,.018,.005,mat(c),.455,.84,(.345+i*.012)*s)));
    g.add(rod([.63,1.04,.1*s],[.6,1.15,.22*s],.008,BK,6));
    const mh=sph(.065,BODY,.6,1.16,.26*s,14); mh.scale.set(.5,.6,1.25); g.add(mh);
    const mg=cylm(.05,.05,.012,MAT.chrome,16); mg.rotation.z=Math.PI/2; mg.position.set(.57,1.16,.26*s); mg.scale.set(.6,1,1.2); g.add(mg);
  });

  /* --- sculpted sport tank --- */
  const tankTaper=okadaTaper(.05,.62,.42,1), tk=.16*(1-.62)/(.42-.05), tankAng=Math.atan(tk);
  g.add(okadaPanel([[.09,.86],[.40,.85],[.47,.85,.465,.93],[.44,.99],[.30,1.03,.12,.96],[.075,.93]],.32,.055,LIV,tankTaper));
  // red supermoto shrouds over the radiator, flowing from the nose into the tank (edges pick up the pinstripes)
  [-1,1].forEach(s=>{ const sh=okadaPanel([[.565,.97],[.565,.80],[.50,.70,.32,.635],[.37,.72],[.47,.87,.50,.96]],.03,.012,LIV); sh.position.z=.15*s; g.add(sh); });
  okadaSides(g,.15,.04,speedTex('OGA RACING',{bg:'#111',accent:GOLD}),.505,.855,.165,.55);
  okadaSides(g,.09,.022,checkerTex(10,2),.47,.735,.165,.55);

  /* --- frame spars, engine, belly pan --- */
  [-1,1].forEach(s=>{
    g.add(okadaBeam([.5,.87],[.02,.64],.085,.04,ALU,.118*s));
    g.add(okadaBeam([.02,.66],[-.04,.42],.1,.04,ALU,.118*s));
    const pv=cylm(.035,.035,.03,GOLDM,14); pv.rotation.x=Math.PI/2; pv.position.set(-.04,.44,.145*s); g.add(pv);
  });
  g.add(rbox(.34,.2,.19,.07,MAT.black,.13,.44,0));
  const cyl=rbox(.16,.22,.16,.05,MAT.black,.29,.6,0); cyl.rotation.z=-.45; g.add(cyl);
  for(let i=0;i<4;i++){ const f=okadaBox(.018,.2,.21,.008,ALU,.24+i*.035,.58+i*.016,0); f.rotation.z=-.45; g.add(f); }
  const cov=cylm(.085,.085,.03,GOLDM,20); cov.rotation.x=Math.PI/2; cov.position.set(.06,.43,.105); g.add(cov);
  const cov2=cylm(.06,.06,.03,MAT.black,16); cov2.rotation.x=Math.PI/2; cov2.position.set(.1,.43,-.105); g.add(cov2);
  g.add(okadaPanel([[-.06,.36],[-.02,.24,.08,.235],[.24,.215],[.31,.215,.31,.29],[.30,.47],[.12,.40,-.06,.36]],.25,.035,CF));
  okadaSides(g,.2,.05,speedTex('ÈKÓ NITRO',{bg:WHITE,fg:RED,accent:'#1f8a4c'}),.13,.30,.125,.03);

  /* --- seat (stepped, ankara) and tail cowl --- */
  g.add(okadaPanel([[0,.84],[.04,.875],[0,.885,-.12,.88],[-.30,.88],[-.36,.88,-.38,.92],[-.40,.935],[-.76,.935],[-.80,.935,-.80,.90],[-.78,.84]],.27,.04,ANKARA,okadaTaper(-.82,.8,-.4,1)));
  const tailTaper=okadaTaper(-1.0,.42,-.55,1), tlk=.13*(1-.42)/(.45), tailAng=Math.atan(tlk);
  g.add(okadaPanel([[-.06,.65],[-.25,.62,-.55,.72],[-.97,.93],[-1.01,.955,-.975,.985],[-.85,.95],[-.5,.83],[-.11,.83]],.26,.05,LIV,tailTaper));
  okadaSides(g,.17,.17,raceNumberTex('07',{bg:WHITE,fg:'#111',ring:'#111'}),-.27,.74,.13);
  okadaSides(g,.17,.042,speedTex('JOLLOF TURBO',{bg:'#111',accent:GOLD}),-.55,.765,.13*tailTaper(-.55),.12,tailAng);
  okadaSides(g,.1,.03,checkerTex(10,2),-.87,.905,.13*tailTaper(-.87),.25,tailAng);
  g.add(okadaBox(.025,.035,.09,.012,glow('#ff0000',.9),-1.035,.975,0));            // LED tail light

  /* --- swingarm, piggyback shocks, rear-sets --- */
  [-1,1].forEach(s=>{
    g.add(okadaBeam([-.04,.44],[RX,R],.075,.035,ALU,.1*s));
    g.add(okadaBox(.05,.04,.02,.01,GOLDM,RX+.03,R,.125*s));
    g.add(rod([-.43,.40,.128*s],[-.29,.72,.128*s],.012,MAT.chrome));
    g.add(rod([-.415,.435,.128*s],[-.335,.62,.128*s],.032,paint('#ffd400'),12));
    g.add(rod([-.33,.63,.128*s],[-.29,.72,.128*s],.026,GOLDM,12));
    g.add(rod([.05,.52,.1*s],[.05,.52,.2*s],.014,GOLDM));
    g.add(okadaBox(.1,.08,.012,.006,ALU,.04,.56,.112*s));
  });
  okadaSides(g,.2,.04,textTex('NO SHAKING',{fg:'#fff',font:'italic 900 64px Archivo, Arial',w:440,h:90}),-.36,.38,.12,Math.atan2(.44-R,-.04-RX));

  /* --- exhaust on the right: header under the belly pan, high titanium can, carbon shield --- */
  const hdr=[[.31,.56,-.05],[.24,.30,-.08],[.0,.25,-.11],[-.30,.38,-.17],[-.46,.52,-.185]];
  for(let i=0;i<hdr.length-1;i++) g.add(limb(hdr[i],hdr[i+1],.022,TI));
  const c0=[-.44,.51,-.19], c1=[-.86,.72,-.19];
  g.add(rod(c0,c1,.058,TI,16));
  const sh=mesh(new THREE.CylinderGeometry(.068,.068,.2,14,1,true,Math.PI-1.1,2.2),MAT.carbonDS); orient(sh,V(-.5,.54,-.19),V(-.7,.64,-.19)); g.add(sh);
  const ec=mesh(new THREE.CylinderGeometry(.04,.058,.05,16),CF); orient(ec,V(...c1),V(-.905,.742,-.19)); g.add(ec);
  g.add(rod([-.89,.735,-.19],[-.94,.76,-.19],.026,mat('#3b55b8',{metalness:.9,roughness:.25}),12));

  /* --- rack, plate hanger, indicators --- */
  [-1,1].forEach(s=>g.add(rod([-.66,1.0,.13*s],[-.99,1.0,.13*s],.013,GOLDM)));
  g.add(rod([-.99,1.0,-.13],[-.99,1.0,.13],.013,GOLDM));
  g.add(okadaBeam([-.88,.84],[-.975,.68],.03,.05,CF,0));
  const plg=new THREE.Group(); plg.position.set(-.99,.62,0); plg.rotation.z=-.1; g.add(plg);
  plg.add(okadaBox(.014,.16,.2,.006,BK,0,0,0));
  plg.add(decal(.17,.08,plateTex('KJA 247 OK'),-.0095,.028,0,FACE.nx));
  plg.add(decal(.17,.04,textTex('ỌLỌRUN MAA ṢE',{fg:'#fdd835',font:'900 40px Archivo, Arial',w:360,h:80}),-.0095,-.047,0,FACE.nx));
  [-1,1].forEach(s=>{ const ri=sph(.02,MAT.amber,-.95,.75,.07*s,10); ri.scale.set(1.4,.8,1); g.add(ri); });

  /* --- green underglow --- */
  g.add(limb([-.02,.185,0],[.28,.18,0],.016,glow('#2bff88',2.4)));
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.6),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,map:ctex(128,64,(x,w,h)=>{
    const gr=x.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2); gr.addColorStop(0,'rgba(60,255,140,.55)'); gr.addColorStop(1,'rgba(60,255,140,0)');
    x.fillStyle=gr; x.fillRect(0,0,w,h); })}));
  pool.rotation.x=-Math.PI/2; pool.position.set(-.02,.012,0); g.add(pool);

  /* --- rider (race helmet, tucked), madam side-saddle, Ghana Must Go bag --- */
  const RP=[-.12,.92], LEAN=.38;
  const riderHands={L:okadaLocal([.46,.928,.27],RP,LEAN), R:okadaLocal([.46,.928,-.27],RP,LEAN)}, riderAnkle=okadaLocal([.0,.61,0],RP,LEAN).slice(0,2);
  const rider=driver ? driverFigure(driver,{hands:riderHands, ankle:riderAnkle})
    : person({shirt:'#1c1c1e', pants:'#1c1c1e', arms:'long', hat:'helmet', hatColor:WHITE, helmetStripe:RED, vest:'#f25c05', vestText:'247', hands:riderHands, ankle:riderAnkle});
  fixedChild(g,rider,RP[0],RP[1],0,0,LEAN);
  const kn=[RP[0]+.32*Math.cos(LEAN)+.12*Math.sin(LEAN), RP[1]-.32*Math.sin(LEAN)+.12*Math.cos(LEAN)];   // person() knee, leaned
  [-1,1].forEach(s=>{ const k=okadaBox(.085,.055,.025,.012,paint('#ffd400'),kn[0]+.01,kn[1]-.005,.178*s); k.rotation.z=-.3; g.add(k); });
  const pas=person({shirt:'#7b2d8b', pants:ANKARA2, skin:MAT.skin2, gele:GELE, hands:{L:[-.03,.225,.33],R:[.24,.2,-.1]}});
  fixedChild(g,pas,-.54,.975,0,Math.PI/2);
  const bag=rbox(.46,.34,.42,.07,PLAID,-.85,1.17,0); bag.rotation.z=.05; g.add(bag);
  [-.72,-.96].forEach(x=>{ const st=rbox(.026,.355,.432,.02,mat('#151515',{roughness:.7}),x,1.17+(x+.85)*.05,0); st.rotation.z=.05; g.add(st); });

  g.userData.anim=t=>{ g.rotation.x=Math.sin(t*1.6)*.02; };
  return g;
}
