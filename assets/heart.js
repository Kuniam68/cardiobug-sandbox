// Original procedural anatomical-inspired model. Illustrative; not a clinical anatomical reference.
const canvas=document.getElementById('heart-canvas');
if(canvas){
 let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,rotation=0,tilt=0,dragging=false,lastX=0,lastY=0,sceneState=null;
 const pause=document.getElementById('heart-pause'),reset=document.getElementById('heart-reset');
 function labels(){pause.textContent=paused?'Resume motion ↻':'Pause motion Ⅱ';pause.setAttribute('aria-pressed',String(paused));document.body.classList.toggle('motion-paused',paused)}
 pause.onclick=()=>{paused=!paused;labels()};reset.onclick=()=>{rotation=0;tilt=0};labels();
 async function init(){try{
 const T=await import('https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js');
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.1,100);camera.position.set(0,.25,8.8);
 scene.add(new T.HemisphereLight(0xffdfd0,0x242953,2.7));
 const key=new T.DirectionalLight(0xffd5bd,5);key.position.set(-3,5,6);scene.add(key);const rim=new T.DirectionalLight(0xb7c3ff,4);rim.position.set(4,2,-3);scene.add(rim);const fill=new T.PointLight(0xfa8299,16,20);fill.position.set(-3,-1,2);scene.add(fill);
 const heart=new T.Group();scene.add(heart);heart.rotation.z=-.18;
 const myocardium=new T.MeshPhysicalMaterial({color:0x9e3b4c,roughness:.38,metalness:0,clearcoat:.38,clearcoatRoughness:.3});
 const atrial=new T.MeshPhysicalMaterial({color:0xb84d62,roughness:.42,clearcoat:.3});
 const artery=new T.MeshPhysicalMaterial({color:0xc36770,roughness:.32,clearcoat:.45});
 const vein=new T.MeshPhysicalMaterial({color:0x626d9e,roughness:.4,clearcoat:.25});
 const coronary=new T.MeshStandardMaterial({color:0xeab29e,roughness:.45});
 function organ(pos,scale,mat,rotate=0){const geo=new T.SphereGeometry(1,64,48);const a=geo.attributes.position;for(let i=0;i<a.count;i++){let x=a.getX(i),y=a.getY(i),z=a.getZ(i);const narrow=.73+.26*(y+1)/2;const noise=1+.016*Math.sin(x*19+y*7)*Math.sin(z*17-y*8);a.setXYZ(i,x*narrow*noise,y,z*narrow*noise)}geo.computeVertexNormals();const mesh=new T.Mesh(geo,mat);mesh.position.set(...pos);mesh.scale.set(...scale);mesh.rotation.z=rotate;heart.add(mesh);return mesh}
 // Unequal ventricular masses taper to a single inferior apex.
 organ([.20,-.57,.08],[.91,1.38,.72],myocardium,-.20);
 organ([-.51,-.24,.13],[.70,.99,.61],atrial,.27);
 organ([-.69,.64,-.12],[.54,.59,.52],atrial,.25);
 organ([.45,.65,-.20],[.58,.50,.50],myocardium,-.2);
 function tube(points,r,mat,open=true){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));const geo=new T.TubeGeometry(curve,60,r,14,false);const mesh=new T.Mesh(geo,mat);heart.add(mesh);if(open){const end=new T.Vector3(...points.at(-1)),prev=new T.Vector3(...points.at(-2));const disc=new T.Mesh(new T.CircleGeometry(r*.79,24),new T.MeshStandardMaterial({color:0x311b31,side:T.DoubleSide,roughness:1}));disc.position.copy(end);disc.lookAt(end.clone().add(end.clone().sub(prev)));heart.add(disc)}return mesh}
 // Great vessels: aortic arch, pulmonary trunk, vena cava, and pulmonary veins.
 tube([[.1,.35,-.04],[.1,1.05,.04],[.40,1.64,-.03],[.85,1.65,-.21],[1.03,1.24,-.36],[1.06,.64,-.4]],.23,artery);
 tube([[.40,1.58,-.03],[.38,2.00,-.04],[.34,2.20,-.06]],.095,artery);
 tube([[.62,1.70,-.12],[.70,2.02,-.13],[.77,2.16,-.16]],.085,artery);
 tube([[.82,1.60,-.2],[1.02,1.90,-.24],[1.15,2.02,-.30]],.085,artery);
 tube([[-.1,.25,.44],[-.16,.85,.40],[-.40,1.26,.25],[-.82,1.32,.02],[-1.18,1.16,-.12]],.21,vein);
 tube([[-.35,1.13,.25],[.02,1.30,.19],[.55,1.34,.04]],.15,vein);
 tube([[-.77,.49,-.2],[-.97,1.05,-.22],[-1.03,1.70,-.22]],.21,vein);
 tube([[-.74,.33,-.29],[-1.04,-.24,-.32],[-1.09,-.79,-.40]],.18,vein);
 tube([[.47,.59,-.28],[.94,.76,-.21],[1.30,.87,-.2]],.13,artery);
 tube([[.48,.35,-.26],[1.02,.38,-.19],[1.36,.47,-.16]],.12,artery);
 // Surface coronary vessels trace branching paths rather than a decorative love-heart outline.
 tube([[.05,.42,.66],[.14,.07,.77],[.17,-.39,.79],[.12,-.90,.65],[.22,-1.46,.38]],.036,coronary,false);
 tube([[.12,-.18,.77],[.49,-.40,.73],[.73,-.67,.48]],.021,coronary,false);
 tube([[.14,-.70,.72],[-.07,-.96,.69],[-.15,-1.24,.45]],.019,coronary,false);
 tube([[.05,.38,.61],[-.42,.28,.68],[-.83,.05,.50],[-1.0,-.22,.26]],.032,coronary,false);
 tube([[-.42,.24,.67],[-.52,-.16,.68],[-.42,-.55,.60]],.018,coronary,false);
 const ringMat=new T.MeshBasicMaterial({color:0x677297,transparent:true,opacity:.18});const ring=new T.Mesh(new T.TorusGeometry(2.38,.007,6,140),ringMat);ring.rotation.x=.55;ring.rotation.y=.5;ring.position.y=.15;scene.add(ring);
 document.getElementById('heart-fallback').setAttribute('hidden','');canvas.setAttribute('aria-label','Interactive anatomical-inspired three-dimensional heart. Drag horizontally to rotate; use reset to restore the view.');
 function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()};new ResizeObserver(resize).observe(canvas);resize();
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;lastX=e.clientX;lastY=e.clientY});canvas.addEventListener('pointermove',e=>{if(!dragging)return;rotation+=(e.clientX-lastX)*.009;tilt=Math.max(-.35,Math.min(.35,tilt+(e.clientY-lastY)*.004));lastX=e.clientX;lastY=e.clientY});window.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);canvas.addEventListener('pointerleave',()=>dragging=false);
 let phase=0,last=performance.now();let visible=true;new IntersectionObserver(entries=>visible=entries[0].isIntersecting).observe(canvas);
 function frame(t){const dt=Math.min(t-last,50);last=t;if(visible&&!document.hidden){if(!paused)phase+=dt/1000;const pulse=paused?0:Math.pow(Math.max(0,Math.sin(phase*4.5)),14)*.045;heart.scale.set(1+pulse,1-pulse*.55,1+pulse*.6);heart.rotation.y=rotation+(paused?0:Math.sin(phase*.3)*.35);heart.rotation.x=tilt+.10;renderer.render(scene,camera)}requestAnimationFrame(frame)}requestAnimationFrame(frame);sceneState={renderer};
 }catch(e){document.getElementById('heart-fallback').removeAttribute('hidden');document.getElementById('heart-render-status').textContent='Illustrated view · interactive 3D unavailable on this connection';reset.hidden=true}}
 init();
}
