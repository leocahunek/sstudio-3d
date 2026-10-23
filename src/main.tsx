import React, {Suspense, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import {OrbitControls, TransformControls, useGLTF, ContactShadows} from '@react-three/drei';
import * as THREE from 'three';
import {useStudio, types, presets, type Light} from './store';
import {Plus, Trash2, Download, Upload} from 'lucide-react';
import './style.css';

class ModelErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){
   console.error('Model import failed:',error);
   useStudio.setState({modelUrl:null});
   window.dispatchEvent(new CustomEvent('lc-model-error',{detail:error.message}));
 }
 render(){return this.state.failed?null:this.props.children;}
}
function Imported({url}:{url:string}) {
 const {scene}=useGLTF(url);
 const object=React.useMemo(()=>{
   const copy=scene.clone(true);
   copy.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(copy);
   const size=bounds.getSize(new THREE.Vector3());
   const center=bounds.getCenter(new THREE.Vector3());
   if(!Number.isFinite(size.y)||size.y<=0||Math.max(size.x,size.y,size.z)>100000)
      throw new Error('Invalid model dimensions.');
   // Preserve the model proportions, put the feet at ground level and
   // center the subject relative to the studio camera.
   const scale=1.85/size.y;
   copy.scale.multiplyScalar(scale);
   copy.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
   copy.traverse(child=>{
     if((child as THREE.Mesh).isMesh){
       (child as THREE.Mesh).castShadow=true;
       (child as THREE.Mesh).receiveShadow=true;
     }
   });
   return copy;
 },[scene]);
 return <primitive object={object}/>;
}
function Human(){
 const url=useStudio(s=>s.modelUrl),rotation=useStudio(s=>s.modelRotation);
 return <group rotation={[0,rotation*Math.PI/180,0]}>
 {url?<ModelErrorBoundary key={url}><Suspense fallback={null}><Imported url={url}/></Suspense></ModelErrorBoundary>:<group>
 <mesh position={[0,1.45,0]} castShadow><capsuleGeometry args={[.24,.65,8,24]}/><meshStandardMaterial color="#656c78"/></mesh>
 <mesh position={[0,2.13,0]} castShadow><sphereGeometry args={[.19,32,24]}/><meshStandardMaterial color="#b98a72"/></mesh>
 {[-.12,.12].map(x=><mesh key={x} position={[x,.55,0]} castShadow><capsuleGeometry args={[.095,.85]}/><meshStandardMaterial color="#343a43"/></mesh>)}
 </group>}</group>;
}
function kelvin(k:number):THREE.Color {
 const t=k/100;
 const r=t<=66?255:329.6987*Math.pow(t-60,-.1332);
 const g=t<=66?99.4708*Math.log(t)-161.1196:288.1222*Math.pow(t-60,-.0755);
 const b=t>=66?255:t<=19?0:138.5177*Math.log(t-10)-305.0448;
 return new THREE.Color().setRGB(...([r,g,b].map(v=>Math.max(0,Math.min(255,v))/255) as [number,number,number]));
}
function Fixture({l,setup,visible}:{l:Light;setup:boolean;visible:boolean}){
 const selected=useStudio(s=>s.selected),set=useStudio(s=>s.set),update=useStudio(s=>s.update);
 const ref=useRef<THREE.Group>(null);
 const reflector=l.type.includes('Reflector')||l.type==='V-flat';
 return <>
 {visible&&<group ref={ref} position={[l.x,l.height,l.z]} onClick={e=>{e.stopPropagation();set({selected:l.id})}}>
 <mesh rotation={[Math.PI/2,0,0]} castShadow><cylinderGeometry args={[.23,.23,.07,32]}/><meshStandardMaterial color={selected===l.id?'#efb35e':'#292e36'}/></mesh>
 {setup&&<mesh position={[0,-l.height/2,0]}><cylinderGeometry args={[.018,.018,l.height,8]}/><meshStandardMaterial color="#727983"/></mesh>}
 </group>}
 {l.enabled&&!reflector&&<spotLight position={[l.x,l.height,l.z]} color={l.type==='Color gel'?l.color:kelvin(l.kelvin)} intensity={l.power/100*100} angle={Math.min(1.5,l.angle*Math.PI/360)} penumbra={l.type.includes('Softbox')||l.type.includes('Octabox')?.95:.3} distance={12} decay={2} castShadow shadow-mapSize={[1024,1024]}/>}
 {setup&&selected===l.id&&ref.current&&<TransformControls object={ref.current} mode="translate" onMouseUp={()=>{const p=ref.current!.position;update(l.id,{x:p.x,z:p.z,height:Math.max(.3,Math.min(3,p.y))})}}/>}
 </>;
}
function Scene({setup=false}:{setup?:boolean}){
 const lights=useStudio(s=>s.lights),hide=useStudio(s=>s.hideGear),quality=useStudio(s=>s.quality),framing=useStudio(s=>s.framing);
 return <Canvas shadows={quality} camera={{position:setup?[5,5,6]:[0,framing==='Full body'?1.5:2,framing==='Portrait'?3.2:framing==='Half body'?4.6:7],fov:40}} gl={{preserveDrawingBuffer:true,antialias:true}} onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1}}>
 <color attach="background" args={['#191c22']}/><ambientLight intensity={.12}/>
 <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[20,20]}/><meshStandardMaterial color="#383c43"/></mesh>
 {setup&&<gridHelper args={[12,12,'#4a5058','#333840']} position={[0,.006,0]}/>}
 <Human/>{lights.map(l=><Fixture key={l.id} l={l} setup={setup} visible={setup||!hide}/>)}
 <ContactShadows opacity={.4} scale={8} blur={2} far={3}/>
 <OrbitControls makeDefault enablePan={setup} minDistance={1.6} maxDistance={15} maxPolarAngle={Math.PI/2.05} target={[0,setup?1:1.7,0]}/>
 </Canvas>;
}
function App(){
 const s=useStudio(),chosen=s.lights.find(l=>l.id===s.selected);
 const [modelMessage,setModelMessage]=React.useState('');
 React.useEffect(()=>{
   const handler=(event:Event)=>setModelMessage('Could not load model: '+((event as CustomEvent<string>).detail||'unsupported file'));
   window.addEventListener('lc-model-error',handler);
   return ()=>window.removeEventListener('lc-model-error',handler);
 },[]);
 const loadModel=(f?:File)=>{
   if(!f)return;
   if(!f.name.toLowerCase().endsWith('.glb')){
     setModelMessage('Please use a self-contained .glb file. External .gltf resources are not supported in this uploader.');
     return;
   }
   if(f.size>60*1024*1024){
     setModelMessage('This model exceeds the 60 MB safety limit. Please optimize it before loading.');
     return;
   }
   setModelMessage('Loading '+f.name+'…');
   s.set({modelUrl:URL.createObjectURL(f)});
 };
 const file=useRef<HTMLInputElement>(null),model=useRef<HTMLInputElement>(null);
 const exportJson=()=>{const blob=new Blob([JSON.stringify({lights:s.lights},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lc-lighting-setup.json';a.click();URL.revokeObjectURL(url)};
 const importJson=async(f?:File)=>{if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.lights))throw Error();s.set({lights:data.lights,selected:null})}catch{alert('Invalid setup JSON')}};
 return <div className="app"><header><b><span>LC</span> LIGHTING STUDIO</b><small>3D STUDIO / BETA</small><div className="grow"/>
 <button onClick={()=>s.set({quality:!s.quality})}>{s.quality?'Quality':'Performance'}</button>
 <button onClick={exportJson}><Download size={15}/> Export</button>
 <button onClick={()=>file.current?.click()}><Upload size={15}/> Import</button>
 <input hidden ref={file} type="file" accept=".json" onChange={e=>importJson(e.target.files?.[0])}/></header>
 <main><aside><h3>Equipment <span>{s.lights.length}</span></h3>
 <select id="equipment" defaultValue=""><option value="" disabled>Add equipment…</option>{types.map(t=><option key={t}>{t}</option>)}</select>
 <button className="primary full" onClick={()=>{const e=document.getElementById('equipment') as HTMLSelectElement;s.add(e.value||types[0])}}><Plus size={15}/> Add equipment</button>
 <div className="equipment">{s.lights.map((l,i)=><button key={l.id} className={'equip '+(s.selected===l.id?'active':'')} onClick={()=>s.set({selected:l.id})}><span className="dot"/><span>{l.type}<small>Light {i+1} · {l.power}%</small></span><span onClick={e=>{e.stopPropagation();s.update(l.id,{enabled:!l.enabled})}}>{l.enabled?'●':'○'}</span></button>)}</div>
 <h3>Model</h3><label>Rotation <em>{s.modelRotation}°</em></label><input type="range" min="0" max="360" value={s.modelRotation} onChange={e=>s.set({modelRotation:+e.target.value})}/>
 <button className="full" onClick={()=>model.current?.click()}>Load human GLB</button><input ref={model} hidden type="file" accept=".glb" onChange={e=>{loadModel(e.target.files?.[0]);e.target.value=""}}/><button className="full" onClick={()=>{s.set({modelUrl:null});setModelMessage("Model removed.");}}>Reset human model</button>{modelMessage&&<p className="hint" role="status">{modelMessage}</p>}
 <p className="hint">Placeholder figure until you load a licensed realistic 3D human model. GLB recommended.</p></aside>
 <section className="work"><div className="viewheads"><strong>PHOTOGRAPHER VIEW</strong><div>
 <select value={s.framing} onChange={e=>s.set({framing:e.target.value})}>{['Portrait','Half body','Full body'].map(x=><option key={x}>{x}</option>)}</select>
 <select value={s.focal} onChange={e=>s.set({focal:+e.target.value})}>{[35,50,85,105].map(x=><option key={x} value={x}>{x} mm</option>)}</select>
 <button onClick={()=>s.set({hideGear:!s.hideGear})}>{s.hideGear?'Show gear':'Hide gear'}</button></div></div>
 <div className="preview"><Scene/></div><div className="viewheads"><strong>STUDIO SETUP VIEW</strong><span>Orbit · Zoom · Select light · Drag gizmo</span></div><div className="setup"><Scene setup/></div></section>
 <aside className="properties"><h3>Properties</h3>{chosen?<><strong className="chosen">{chosen.type}</strong>
 {([['power','Power',0,100,'%'],['kelvin','Temperature',2700,10000,' K'],['height','Height',.3,3,' m'],['x','Position X',-5,5,' m'],['z','Position Z',-5,5,' m'],['angle','Beam angle',10,150,'°']] as const).map(([key,label,min,max,unit])=><div className="control" key={key}><label>{label}<em>{chosen[key]}{unit}</em></label><input type="range" min={min} max={max} step={key==='height'||key==='x'||key==='z'?.1:1} value={chosen[key]} onChange={e=>s.update(chosen.id,{[key]:+e.target.value})}/></div>)}
 {chosen.type==='Color gel'&&<div className="control"><label>RGB color</label><input type="color" value={chosen.color} onChange={e=>s.update(chosen.id,{color:e.target.value})}/></div>}
 <div className="actions"><button onClick={()=>s.add(chosen.type)}>Duplicate</button><button onClick={()=>s.remove(chosen.id)}><Trash2 size={15}/> Delete</button></div>
 </>:<p className="hint">Select a light to adjust its position, beam and power.</p>}
 <div className="limitations"><h4>Render notes</h4><p>Spotlights approximate studio fixtures. Reflectors are placeholders; accurate bounce and depth of field are not implemented.</p></div></aside></main>
 <footer><div><strong>LIGHTING PRESETS</strong><button onClick={()=>s.loadPreset('Rembrandt')}>Reset</button></div><div className="presets">{Object.keys(presets).map(name=><button key={name} onClick={()=>s.loadPreset(name)}>{name}</button>)}</div></footer></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
