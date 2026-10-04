const express=require("express");
const cors=require("cors");
const path=require("path");
const fs=require("fs");
const app=express();
app.use(cors());
app.use(express.json({limit:"50mb"}));

const MAYAH="https://mayah.co/api/v1/publico/list_public/link/cfec25a072e111eb94fee71bd50f2bf6";
const DATA_DIR=process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : __dirname);
fs.mkdirSync(DATA_DIR,{recursive:true});
const DATA=path.join(DATA_DIR,"catalog-data.json");
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"nutrilife";
const GITHUB_TOKEN=process.env.GITHUB_TOKEN||"";
const GITHUB_REPO=process.env.GITHUB_REPO||"benja20br-source/Nutrilife";
const GITHUB_BRANCH=process.env.GITHUB_BRANCH||"main";
const GITHUB_FILE=process.env.GITHUB_FILE||"catalog-data.json";

async function githubRequest(url,options={}){return fetch(url,{...options,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:`Bearer ${GITHUB_TOKEN}`,...(options.headers||{})}})}
async function saveCatalogToGitHub(data){
  if(!GITHUB_TOKEN)return {saved:false,reason:"GITHUB_TOKEN no configurado"};
  const url=`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const current=await githubRequest(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`);let sha;
  if(current.ok){const j=await current.json();sha=j.sha}else if(current.status!==404)throw new Error(`GitHub GET ${current.status}`);
  const content=Buffer.from(JSON.stringify(data,null,2),"utf8").toString("base64");
  const body={message:"Actualizar catálogo NUTRILIFE",content,branch:GITHUB_BRANCH};if(sha)body.sha=sha;
  const r=await githubRequest(url,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok){const t=await r.text();throw new Error(`GitHub PUT ${r.status}: ${t.slice(0,300)}`)}return {saved:true}
}
async function loadCatalogFromGitHub(){
  if(!GITHUB_TOKEN)return null;try{const url=`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;const r=await githubRequest(url);if(!r.ok)return null;const j=await r.json();if(!j.content)return null;return JSON.parse(Buffer.from(j.content.replace(/\n/g,""),"base64").toString("utf8"))}catch(e){console.error("No se pudo leer catálogo desde GitHub:",e.message);return null}
}
function seedCatalog(){const products=JSON.parse(fs.readFileSync(path.join(__dirname,"products.json"),"utf8"));const config=JSON.parse(fs.readFileSync(path.join(__dirname,"config.json"),"utf8"));return {products,config,updatedAt:new Date().toISOString()}}
function readLocalCatalog(){try{return JSON.parse(fs.readFileSync(DATA,"utf8"))}catch(e){return null}}
async function readCatalog(){const remote=await loadCatalogFromGitHub();if(remote){try{fs.writeFileSync(DATA,JSON.stringify(remote,null,2))}catch(e){}return remote}const local=readLocalCatalog();if(local)return local;const fresh=seedCatalog();try{fs.writeFileSync(DATA,JSON.stringify(fresh,null,2))}catch(e){}return fresh}
async function writeCatalog(data){data.updatedAt=new Date().toISOString();fs.writeFileSync(DATA,JSON.stringify(data,null,2));return saveCatalogToGitHub(data)}
function auth(req,res,next){if(req.headers["x-admin-password"]!==ADMIN_PASSWORD)return res.status(401).json({ok:false,message:"Contraseña incorrecta"});next()}

app.get("/api/catalog",async(req,res)=>{try{const d=await readCatalog();const products=d.products.map(p=>({code:p.code,name:p.name,cat:p.cat,desc:p.desc||"",image:p.image||null,available:p.available!==false,prices:{100:publicPrice(p,100),500:publicPrice(p,500),1000:publicPrice(p,1000)}}));res.json({products,updatedAt:d.updatedAt,promotions:d.config?.promotions||[]})}catch(e){res.status(500).json({message:e.message})}});
function marginFor(p,g){const specific={100:p.margin100,500:p.margin500,1000:p.margin1000}[g];if(specific!=null&&specific!=="")return Number(specific);return Number(p.margin??40)}
function publicPrice(p,g){const margin=marginFor(p,g);const cost=Number(p.cost||0);return Math.round(cost*g/1000*(1+margin/100))}

app.get("/api/admin/catalog",auth,async(req,res)=>{try{res.json(await readCatalog())}catch(e){res.status(500).json({ok:false,message:e.message})}});
app.put("/api/admin/catalog",auth,async(req,res)=>{try{const body=req.body;if(!body||!Array.isArray(body.products)||!body.config)return res.status(400).json({ok:false,message:"Datos inválidos"});body.config.promotions=Array.isArray(body.config.promotions)?body.config.promotions:[];const result=await writeCatalog({products:body.products,config:body.config});res.json({ok:true,updatedAt:body.updatedAt,persistent:"github",github:result})}catch(e){res.status(500).json({ok:false,message:e.message})}});
app.get("/api/mayah",async(req,res)=>{try{const r=await fetch(MAYAH,{cache:"no-store"});const j=await r.json();res.json(j)}catch(e){res.status(502).json({status:"ERROR",message:"No se pudo consultar Mayah"})}});
app.post("/api/admin/sync-mayah",auth,async(req,res)=>{try{const r=await fetch(MAYAH,{cache:"no-store"});const j=await r.json();const d=await readCatalog();const incoming=j.response?.productos||[];let changed=0;for(const x of incoming){const p=d.products.find(y=>String(y.code)===String(x.codigo));if(p&&x.precio!=null){p.cost=Number(x.precio);changed++}if(p&&x.imagen&&!p.image)p.image=x.imagen}await writeCatalog(d);res.json({ok:true,changed,updatedAt:d.updatedAt})}catch(e){res.status(502).json({ok:false,message:"No se pudo sincronizar Mayah"})}});

const LOGO_SVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" role="img" aria-label="NUTRILIFE"><rect width="1080" height="1350" fill="#5b610b"/><g fill="#f7efe3" font-family="Arial,Helvetica,sans-serif" font-weight="900" text-anchor="middle"><text x="540" y="690" font-size="150" letter-spacing="4">NUTRILIFE</text></g><g fill="none" stroke="#f7efe3" stroke-width="28" stroke-linecap="round"><path d="M425 755 C470 850 610 875 690 790"/></g><path d="M700 555 C715 510 735 475 770 450 C765 500 745 540 710 575 Z" fill="#f7efe3"/><path d="M710 575 C725 535 745 505 765 490" fill="none" stroke="#5b610b" stroke-width="12" stroke-linecap="round"/></svg>`;
app.get("/logo.svg",(req,res)=>{res.set("Cache-Control","no-store");res.type("image/svg+xml");const file=path.join(__dirname,"logo.svg");if(fs.existsSync(file))return res.send(fs.readFileSync(file,"utf8"));return res.send(LOGO_SVG)});
app.get(["/","/index.html"],(req,res)=>{try{const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");const brand=`<div class="nutrilife-brand" aria-label="NUTRILIFE"><img src="/logo.svg?v=2" alt="NUTRILIFE"></div>`;const styles=`<style>.nutrilife-brand{width:100%;height:96px;background:#5a600b;display:flex;align-items:center;justify-content:center;overflow:hidden}.nutrilife-brand img{width:170px;height:96px;object-fit:contain;display:block}.nutrilife-brand+nav{margin-top:0}@media(max-width:600px){.nutrilife-brand{height:82px}.nutrilife-brand img{width:145px;height:82px}}</style>`;res.type("html").send(html.replace("<body>","<body>"+styles+brand))}catch(e){res.status(500).send("No se pudo cargar NUTRILIFE")}});
app.use(express.static(__dirname));
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>console.log("NUTRILIFE lista"));