import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import WorkflowCanvas from '../src/WorkflowCanvas';
import WorkflowShelf from '../src/WorkflowShelf';
import type {ObjectInfo,Workflow} from '../src/api';
import {defaults} from '../src/workflow';
import '../src/styles.css';import '../src/experience.css';import '../src/mochi.css';import '../src/mobile.css';import '../src/settings-hub.css';

const info:ObjectInfo={
  CheckpointLoaderSimple:{class_type:'CheckpointLoaderSimple',input:{required:{ckpt_name:['COMBO',{options:['sd_xl_base_1.0.safetensors','anima.safetensors']}]}}},
  CLIPTextEncode:{class_type:'CLIPTextEncode',input:{required:{text:['STRING',{multiline:true}],clip:['CLIP']}}},
  EmptyLatentImage:{class_type:'EmptyLatentImage',input:{required:{width:['INT',{min:64,max:4096,step:8}],height:['INT',{min:64,max:4096,step:8}],batch_size:['INT',{min:1,max:8}]}}},
  KSampler:{class_type:'KSampler',input:{required:{model:['MODEL'],seed:['INT',{min:0,max:18446744073709551615}],steps:['INT',{min:1,max:150}],cfg:['FLOAT',{min:0,max:30}],sampler_name:['COMBO',{options:['euler_ancestral','dpmpp_2m']}],scheduler:['COMBO',{options:['normal','karras']}],positive:['CONDITIONING'],negative:['CONDITIONING'],latent_image:['LATENT'],denoise:['FLOAT',{min:0,max:1}]}}},
  VAEDecode:{class_type:'VAEDecode',input:{required:{samples:['LATENT'],vae:['VAE']}}},
  SaveImage:{class_type:'SaveImage',input:{required:{images:['IMAGE'],filename_prefix:['STRING']}}},
} as unknown as ObjectInfo;

const base:Workflow={
  '1':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:'sd_xl_base_1.0.safetensors'}},
  '2':{class_type:'CLIPTextEncode',inputs:{text:'{{prompt}}',clip:['1',1]}},
  '3':{class_type:'CLIPTextEncode',inputs:{text:'{{negative}}',clip:['1',1]}},
  '4':{class_type:'EmptyLatentImage',inputs:{width:1024,height:1024,batch_size:1}},
  '5':{class_type:'KSampler',inputs:{model:['1',0],seed:42,steps:30,cfg:5,sampler_name:'',scheduler:'',positive:['2',0],negative:['3',0],latent_image:['4',0],denoise:1}},
  '6':{class_type:'VAEDecode',inputs:{samples:['5',0],vae:['1',2]}},
  '7':{class_type:'SaveImage',inputs:{images:['6',0],filename_prefix:'ComfyPocket/ComfyPocket'}},
};

function Harness(){
  const [graph,setGraph]=useState<Workflow>(base);
  const [settings,setSettings]=useState({...defaults,positive:'a cat',sampler:''});
  const [name,setName]=useState('');
  const [id,setId]=useState('');
  const [log,setLog]=useState<string[]>([]);
  const say=(text:string)=>setLog(old=>[...old.slice(-3),text]);
  return (
    <div style={{padding:16,maxWidth:720,margin:'0 auto'}}>
      <output id="log">{log.join(' | ')}</output>
      <WorkflowShelf graph={graph} name={name} id={id} onName={setName} onSaved={(n,i)=>{setName(n);setId(i);}} onLoad={(g,n,i)=>{setGraph(g);setName(n);setId(i);}} onMessage={say} onError={say}/>
      <WorkflowCanvas graph={graph} info={info} settings={settings} onChange={setGraph} onSettings={setSettings} onMessage={say}/>
      <pre id="graph">{JSON.stringify(graph)}</pre>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Harness/>);
