/* ---------- KEKE (factory race build) ---------- */
// Side-profile helpers. Outlines are sampled into polylines so they can be grown or shrunk evenly:
// a body keeps its exact silhouette under profileGeo's bevel, and racing stripes can sit a few
// millimetres proud of the same surface.
function kekePts(build, div=8){
  const s=new THREE.Shape(); build(s);
  const out=[];
  s.getPoints(div).forEach(v=>{ const l=out[out.length-1]; if(!l || l.distanceTo(v)>1e-4) out.push(v.clone()); });
  if(out.length>2 && out[0].distanceTo(out[out.length-1])<1e-4) out.pop();
  if(THREE.ShapeUtils.isClockWise(out)) out.reverse();
  return out;
}
function kekeOffset(pts, d){
  const n=pts.length, res=[];
  for(let i=0;i<n;i++){
    const a=pts[(i-1+n)%n], b=pts[i], c=pts[(i+1)%n];
    const e1=V2(b.x-a.x,b.y-a.y).normalize(), e2=V2(c.x-b.x,c.y-b.y).normalize();
    const n1=V2(e1.y,-e1.x), m=n1.clone().add(V2(e2.y,-e2.x));
    if(m.lengthSq()<1e-8) m.copy(n1); m.normalize();
    const k=d/Math.max(.35,m.dot(n1));
    res.push(V2(b.x+m.x*k, b.y+m.y*k));
  }
  return res;
}
// Extrude a side profile across z so its outer silhouette is exactly `pts` (+grow).
function kekeSolid(pts, width, bevel, grow=0){ return profileGeo(new THREE.Shape(kekeOffset(pts, grow-bevel)), width, bevel); }
// Racing stripe: a thin band hugging the part of a profile where keep(point) is true, standing `grow` proud of it.
function kekeStripe(pts, keep, width, bevel=.01, grow=.006, depth=.03){
  const o=kekeOffset(pts,grow-bevel), inn=kekeOffset(pts,grow-bevel-depth), n=pts.length, k=pts.map(keep), idx=[];
  for(let j=k.findIndex((v,i)=>v && !k[(i-1+n)%n]); k[j%n] && idx.length<n; j++) idx.push(j%n);
  return profileGeo(new THREE.Shape(idx.map(j=>o[j]).concat(idx.slice().reverse().map(j=>inn[j]))), width, bevel);
}
// Arch band (fender / flare) around a wheel centre, between radii r1 and r2.
function kekeArch(cx,cy,r1,r2,a0,a1){ return kekePts(s=>{ s.absarc(cx,cy,r2,a0,a1,false); s.absarc(cx,cy,r1,a1,a0,true); },8); }
// Collapse every non-decal mesh under root into one mesh per material (far fewer draw calls on phones).
function kekeMerge(root){
  root.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(), m=new THREE.Matrix4(), list=[], buckets=new Map();
  root.traverse(o=>{ if(o.isMesh && !o.userData.decal) list.push(o); });
  list.forEach(o=>{
    m.multiplyMatrices(inv,o.matrixWorld);
    const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    geo.applyMatrix4(m);
    if(m.determinant()<0){ ['position','normal','uv'].forEach(k=>{ const a=geo.attributes[k]; if(!a) return; const s=a.itemSize, arr=a.array;
      for(let i=0;i<arr.length;i+=3*s) for(let j=0;j<s;j++){ const t=arr[i+s+j]; arr[i+s+j]=arr[i+2*s+j]; arr[i+2*s+j]=t; } }); }
    if(!buckets.has(o.material)) buckets.set(o.material,[]);
    buckets.get(o.material).push(geo); o.parent.remove(o);
  });
  buckets.forEach((geos,material)=>{
    const out=new THREE.BufferGeometry(); let n=0; geos.forEach(q=>n+=q.attributes.position.count);
    [['position',3],['normal',3],['uv',2]].forEach(([k,s])=>{
      const arr=new Float32Array(n*s); let off=0;
      geos.forEach(q=>{ const a=q.attributes[k]; if(a) arr.set(a.array.subarray(0,q.attributes.position.count*s),off); off+=q.attributes.position.count*s; });
      out.setAttribute(k,new THREE.BufferAttribute(arr,s));
    });
    out.computeBoundingSphere(); root.add(mesh(out,material));
  });
  return root;
}
// Light rounded box for small trim (rbox costs ~700 triangles each; this is ~150-250).
const kekeGC={};
function kekeRB(w,h,d,r,m,x,y,z,seg=2){
  const k=[w,h,d,r,seg].join(',');
  if(!kekeGC[k]){
    const b=Math.max(.002,Math.min(r,d/2-.001,w/2-.001,h/2-.001)), depth=Math.max(.001,d-2*b);
    const geo=new THREE.ExtrudeGeometry(rrectShape(w-2*b,h-2*b,Math.max(.0006,r*.6)),{depth,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:seg});
    geo.translate(0,0,-depth/2); kekeGC[k]=smoothNormals(geo);
  }
  return mesh(kekeGC[k],m,x,y,z);
}
function kekeWheel(r,w,rim,o){ const wh=sportWheel(r,w,rim,o); kekeMerge(wh.children[0]); return wh; }
// With a `driver` id the figure is that character, seated with the same hands and feet.
function kekeRider(o,driver){ return kekeMerge(driver ? driverFigure(driver,{hands:o.hands, ankle:o.ankle}) : person(o)); }
// Tilt a decal about z after its facing turn (lets text lie on raked faces and on the roof).
function kekeTilt(d,t){ d.rotation.order='ZYX'; d.rotation.z=t; return d; }

function buildKeke(bodyColor='#ffb000', driver){
  const g=new THREE.Group(), body=new THREE.Group(), add=o=>{ body.add(o); return o; };
  const Y=paint(bodyColor), BK=MAT.blackGloss, CF=MAT.carbon, TOP=paint('#121212');
  const LED=glow('#eaf8ff',2.2), RED=glow('#ff1a0a',1.0), NEON=glow('#25ff8a',1.8), TI=mat('#5a5fd0',{metalness:.9,roughness:.25});
  const SIDE=s=>s>0?FACE.pz:FACE.nz, RB=kekeRB;

  /* wheels: fat low-profile rears on a wider track, black alloys with yellow lips and green calipers */
  const WO={spokes:5, lip:'#ffb000', caliper:'#1f8a4c'};
  const fw=kekeWheel(.235,.17,'#1b1b1b',WO); fw.position.set(1.04,.235,0); g.add(fw);
  [-1,1].forEach(s=>{ const w=kekeWheel(.25,.2,'#1b1b1b',Object.assign({rimRatio:.7},WO)); w.position.set(-.72,.25,.655*s); g.add(w); });

  /* chassis */
  add(RB(2.0,.1,1.08,.03,MAT.black,-.18,.34,0));                          // floor pan, top at .39

  /* sculpted front cowl with twin racing stripes */
  const cowlP=kekePts(s=>{
    s.moveTo(.90,.44); s.lineTo(1.10,.48);
    s.quadraticCurveTo(1.25,.48,1.26,.58);                                // chin
    s.lineTo(1.22,1.0);                                                    // raked face
    s.quadraticCurveTo(1.20,1.12,1.06,1.12);
    s.lineTo(.88,1.13);
    s.quadraticCurveTo(.76,1.13,.76,1.02);
    s.lineTo(.76,.56);
    s.quadraticCurveTo(.76,.43,.90,.44);
  },6);
  add(mesh(kekeSolid(cowlP,1.16,.1),Y));
  [-1,1].forEach(s=>add(mesh(kekeStripe(cowlP,p=>p.y>.53&&p.x>.8,.1),BK,0,0,.2*s)));
  // nose furniture laid out along the raked face (local y runs up the face, local x out of it)
  const face=new THREE.Group(); face.position.set(1.26,.58,0); face.rotation.z=.095; body.add(face);
  [-1,1].forEach(s=>{
    face.add(RB(.05,.11,.21,.04,BK,0,.27,.37*s));                         // slim headlamp housing
    face.add(RB(.03,.06,.16,.025,MAT.lamp,.018,.275,.36*s));
    face.add(RB(.022,.018,.21,.008,LED,.01,.195,.37*s));                  // LED strip under each lamp
    face.add(RB(.026,.035,.07,.014,MAT.amber,.006,.07,.43*s));
  });
  face.add(decal(.19,.19,raceNumberTex('33',{ring:'#1f8a4c'}),.004,.235,0,FACE.px));
  face.add(decal(.24,.05,textTex('KABIYESI',{fg:'#c8102e',bg:'#f2f2f2',font:'900 54px Archivo, Arial',w:400,h:84,radius:30}),.004,.38,0,FACE.px));
  face.add(decal(.27,.115,plateTex('LND 427 KK'),.006,.07,0,FACE.px));
  // front fender, fork with red coil-overs, carbon splitter
  add(mesh(kekeSolid(kekeArch(1.04,.235,.275,.32,.5,2.7),.21,.025),Y));
  [-1,1].forEach(s=>{
    add(rod([1.04,.235,.11*s],[.97,.62,.11*s],.022,BK));
    add(rod([1.015,.37,.11*s],[.985,.53,.11*s],.034,MAT.spring,12));
  });
  add(rbox(.3,.026,1.1,.012,CF,1.16,.48,0));

  /* windscreen: raked, still tall, with sun strip, wiper and the little flag */
  const ws=new THREE.Group(); ws.position.set(.78,1.41,0); ws.rotation.z=.27; body.add(ws);
  ws.add(RB(.016,.56,1.02,.008,MAT.glass,0,0,0));
  ws.add(RB(.045,.05,1.1,.02,BK,0,.3,0));
  ws.add(RB(.045,.05,1.1,.02,BK,0,-.285,0));
  [-1,1].forEach(s=>ws.add(RB(.045,.64,.05,.02,BK,0,0,.535*s)));
  ws.add(rod([.012,-.25,.12],[.012,.1,-.2],.006,BK));
  ws.add(decal(1.0,.075,textTex('ÈKÓ NITRO',{fg:'#ffb000',bg:'#111111',font:'italic 900 62px Archivo, Arial',w:900,h:72}),.01,.19,0,FACE.px));
  ws.add(decal(.08,.05,ctex(60,40,(x)=>{x.fillStyle='#1f8a4c';x.fillRect(0,0,20,40);x.fillRect(40,0,20,40);x.fillStyle='#fff';x.fillRect(20,0,20,40);}),.012,-.19,-.38,FACE.px));
  [-1,1].forEach(s=>{                                                     // aero mirrors
    add(rod([.84,1.2,.55*s],[.87,1.3,.68*s],.012,BK));
    add(RB(.07,.1,.15,.045,CF,.88,1.32,.72*s));
    add(RB(.01,.075,.12,.035,MAT.reflect,.844,1.32,.72*s));
  });

  /* rocker panels + carbon side skirts + underglow */
  [-1,1].forEach(s=>{
    add(rbox(1.0,.2,.1,.045,Y,.28,.46,.55*s));
    add(RB(1.2,.03,.15,.014,CF,.2,.35,.565*s));
    add(RB(1.1,.012,.02,.006,NEON,.2,.33,.6*s));
  });

  /* rear tub with real wheel arches, flared wide-body arches over the fat rears */
  const ra=.34, ax=-.72, ay=.25, aF=.62, aR=Math.PI-Math.asin((.40-ay)/ra);
  const tubP=kekePts(s=>{
    s.moveTo(-.32,.40);                                                    // raised footwell step for the back row
    s.quadraticCurveTo(-.24,.40,-.24,.48);
    s.lineTo(-.24,.49);
    s.quadraticCurveTo(-.24,.58,-.33,.58);
    s.lineTo(-.40,.58);
    s.quadraticCurveTo(-.50,.58,-.50,.68);
    s.lineTo(-.50,.70);
    s.quadraticCurveTo(-.50,.80,-.60,.80);
    s.lineTo(-.84,.80);
    s.quadraticCurveTo(-.97,.80,-.98,.92);                                // into the rear deck
    s.quadraticCurveTo(-.99,1.0,-1.07,1.0);
    s.quadraticCurveTo(-1.16,1.0,-1.16,.91);
    s.lineTo(-1.16,.52);
    s.quadraticCurveTo(-1.16,.40,-1.05,.40);
    s.lineTo(ax+ra*Math.cos(aR),.40);
    s.absarc(ax,ay,ra,aR,aF,true);
    s.quadraticCurveTo(ax+ra*Math.cos(aF)+(ay+ra*Math.sin(aF)-.40)*Math.tan(aF),.40,-.36,.40); // fillet arch into the step
  },6);
  add(mesh(kekeSolid(tubP,1.34,.055),Y));
  [-1,1].forEach(s=>{
    add(mesh(kekeSolid(kekeArch(ax,ay,.30,.37,.17,Math.PI-.17),.24,.025),Y,0,0,.655*s));
    add(mesh(kekeSolid(kekeArch(ax,ay,.295,.33,.12,Math.PI-.12),.05,.012),CF,0,0,.75*s));   // carbon arch lip
  });
  add(RB(.44,.03,1.36,.012,BK,-.73,.80,0));                               // black trim along the tub sides
  // rear face: LED tail bars, carbon diffuser, twin exhausts
  [-1,1].forEach(s=>{
    add(RB(.03,.3,.05,.015,BK,-1.165,.72,.55*s));
    add(RB(.02,.26,.03,.012,RED,-1.18,.72,.55*s));
    const ex=cylm(.046,.046,.2,MAT.chrome,16); ex.rotation.z=Math.PI/2; ex.position.set(-1.16,.30,.38*s); add(ex);
    const ring=mesh(new THREE.TorusGeometry(.044,.009,6,16),TI,-1.258,.30,.38*s); ring.rotation.y=Math.PI/2; add(ring);
    const hole=cylm(.035,.035,.01,MAT.black,14); hole.rotation.z=Math.PI/2; hole.position.set(-1.256,.30,.38*s); add(hole);
  });
  add(RB(.3,.12,1.06,.03,CF,-1.07,.33,0));
  for(let i=-2;i<=2;i++) add(RB(.26,.1,.016,.006,CF,-1.09,.24,i*.12,1));

  /* seats + controls */
  add(RB(.32,.26,.5,.04,MAT.black,.26,.52,0));                           // driver pedestal
  add(rbox(.40,.07,.80,.03,ANKARA,.27,.665,-.16));                        // bench (extra squeezes on the end)
  const bk=rbox(.08,.62,.46,.04,CF,.06,1.0,.02); bk.rotation.z=.14; add(bk); // carbon bucket back
  [-1,1].forEach(s=>{ const b=RB(.14,.46,.05,.02,CF,.09,.93,.02+.24*s); b.rotation.z=.14; add(b); });
  add(rod([.82,.70,0],[.66,1.03,0],.022,BK));                            // steering column
  add(rod([.66,1.04,-.32],[.66,1.04,.32],.016,BK));
  [-1,1].forEach(s=>add(limb([.66,1.04,.22*s],[.66,1.04,.33*s],.024,MAT.rubber)));
  add(RB(.03,.07,.15,.015,BK,.69,1.10,0)); add(RB(.006,.05,.12,.01,glow('#39ff88',.9),.674,1.10,0));
  add(rbox(.40,.07,1.24,.03,ANKARA,-.76,.835,0));                         // rear bench
  const rb=rbox(.07,.36,1.24,.03,ANKARA,-.94,1.08,0); rb.rotation.z=.1; add(rb);

  /* canopy: raked glossy black hardtop with yellow stripes, fringe, curtains, posts, rear panel, roof wing */
  const roofP=kekePts(s=>{
    s.moveTo(-1.14,1.765); s.lineTo(.80,1.725);
    s.quadraticCurveTo(.88,1.725,.88,1.78);
    s.quadraticCurveTo(.88,1.835,.78,1.835);
    s.lineTo(-1.10,1.88);
    s.quadraticCurveTo(-1.20,1.88,-1.20,1.82);
    s.quadraticCurveTo(-1.20,1.765,-1.14,1.765);
  },6);
  add(mesh(kekeSolid(roofP,1.40,.035),TOP));
  [-1,1].forEach(s=>add(mesh(kekeStripe(roofP,p=>p.y>1.785,.1,.01,.005,.025),Y,0,0,.2*s)));
  const TAS=['#e53935','#fdd835','#43a047','#1e88e5'], tg=new THREE.BoxGeometry(.014,.085,.036);
  for(let i=0;i<24;i++) add(mesh(tg,paint(TAS[i%4]),.835,1.685,-.62+i*.054));
  [-1,1].forEach(s=>{
    add(rbox(.95,.11,.025,.012,TOP,-.66,1.675,.69*s));                    // side curtains
    add(rod([-.52,.78,.655*s],[-.52,1.76,.665*s],.022,BK));               // mid posts
    add(rod([-.52,1.16,.67*s],[-1.1,1.16,.67*s],.014,MAT.chrome));        // grab rails
  });
  const rp=new THREE.Group(); rp.position.set(-1.12,1.385,0); rp.rotation.z=-.05; body.add(rp);
  rp.add(rbox(.04,.78,1.38,.02,TOP,0,0,0));
  rp.add(RB(.02,.28,1.0,.05,MAT.glass,-.016,.12,0));
  rp.add(decal(.62,.065,textTex('NO SHAKING',{fg:'#ffffff',font:'italic 900 60px Archivo, Arial',w:600,h:64}),-.028,.22,0,FACE.nx));
  rp.add(decal(1.3,.055,checkerTex(48,2),-.024,-.355,0,FACE.nx));
  rp.add(decal(.9,.1,textTex('AGBERO MOTORSPORT',{fg:'#ffb000',font:'italic 900 62px Archivo, Arial',w:820,h:90}),-.024,-.15,0,FACE.nx));
  // rally wing on swan-neck struts
  const wing=new THREE.Group(); wing.position.set(-1.13,2.0,0); body.add(wing);
  const blade=rbox(.36,.055,1.30,.025,CF,0,0,0); blade.rotation.z=-.14; wing.add(blade);
  wing.add(RB(.02,.024,.6,.01,RED,-.168,.03,0));
  const chk=checkerTex(10,4);
  [-1,1].forEach(s=>{
    wing.add(rbox(.4,.17,.026,.012,Y,-.02,-.02,.665*s));
    wing.add(decal(.36,.12,chk,-.02,-.02,(.665+.014)*s,SIDE(s)));
    const st=RB(.06,.2,.026,.012,BK,.11,-.075,.32*s); st.rotation.z=.88; wing.add(st);
  });

  /* livery */
  const n33=raceNumberTex('33',{ring:'#1f8a4c'});
  const lasg=textTex('LASG KK/0427',{fg:'#231f1b',font:'900 50px Archivo, Arial',w:520,h:90});
  const jollof=speedTex('JOLLOF TURBO',{fg:'#ffb000',bg:'#151515',accent:'#1f8a4c'});
  const oga=speedTex('OGA RACING',{fg:'#151515',bg:'#ffb000',accent:'#1f8a4c'});
  [-1,1].forEach(s=>{
    add(decal(.26,.26,n33,1.0,.80,(.58+.003)*s,SIDE(s)));
    add(decal(.6,.09,jollof,.28,.46,(.60+.003)*s,SIDE(s)));
    add(decal(.42,.075,lasg,-.80,.70,(.67+.003)*s,SIDE(s)));
    add(decal(.5,.085,oga,-.84,1.675,(.69+.0135)*s,SIDE(s)));
  });
  add(kekeTilt(decal(.42,.42,n33,-.3,1.866,0,FACE.px),Math.PI/2-.024));   // rally roof number
  add(decal(.3,.14,plateTex('LND 427 KK'),-1.163,.60,0,FACE.nx));
  add(decal(.8,.1,textTex("NO CONDITION IS PERMANENT",{fg:"#231f1b",font:"900 44px Archivo, Arial",w:760,h:84}),-1.163,.81,0,FACE.nx));

  kekeMerge(body); g.add(body);

  /* underglow pool */
  const ug=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.5),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    map:ctex(128,128,(x)=>{ const gr=x.createRadialGradient(64,64,6,64,64,64); gr.addColorStop(0,'rgba(37,255,138,.9)'); gr.addColorStop(.6,'rgba(37,255,138,.45)'); gr.addColorStop(1,'rgba(37,255,138,0)'); x.fillStyle=gr; x.fillRect(0,0,128,128); })}));
  ug.rotation.x=-Math.PI/2; ug.position.set(-.05,.012,0); g.add(ug);

  /* crew: helmeted driver, the extra squeezed in beside him, three at the back */
  fixedChild(g,kekeRider({shirt:'#1f8a4c', pants:'#1f8a4c', arms:'long', hat:'helmet', hatColor:'#f6f6f2', helmetStripe:'#1f8a4c',
    hands:{L:[.39,.34,.25],R:[.39,.34,-.29]}, ankle:[.34,-.22]}, driver),.27,.70,.02);
  const eh=fixedChild(g,kekeRider({shirt:'#c62828', skin:MAT.skin2, hat:'cap', hatColor:'#1e88e5', hands:{L:[.3,.2,.08],R:[.27,.18,-.17]}, ankle:[.3,-.22]}),.12,.70,-.44);
  eh.rotation.x=-.17;
  [['#8e44ad',-.38,MAT.skin1,{wave:'R',cash:true}],['#16a085',0,MAT.skin2,{}],['#e67e22',.38,MAT.skin1,{}]].forEach(([c,z,sk,o])=>{
    fixedChild(g,kekeRider(Object.assign({shirt:c, skin:sk, pants:'#2b2b35', ankle:[.36,-.205]},o)),-.76,.87,z);
  });

  g.userData.anim=t=>{ g.position.y=Math.abs(Math.sin(t*7))*.015; g.rotation.x=Math.sin(t*3.1)*.012; };
  return g;
}
