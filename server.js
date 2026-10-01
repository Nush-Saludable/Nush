const express=require("express");
const cors=require("cors");
const path=require("path");
const fs=require("fs");
const app=express();
app.use(cors());
app.use(express.json({limit:"15mb"}));

const MAYAH="https://mayah.co/api/v1/publico/list_public/link/cfec25a072e111eb94fee71bd50f2bf6";
const DATA=path.join(__dirname,"catalog-data.json");
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"nutrilife";

function readCatalog(){
  try{return JSON.parse(fs.readFileSync(DATA,"utf8"));}catch(e){
    const products=JSON.parse(fs.readFileSync(path.join(__dirname,"products.json"),"utf8"));
    const config=JSON.parse(fs.readFileSync(path.join(__dirname,"config.json"),"utf8"));
    const data={products,config,updatedAt:new Date().toISOString()};
    fs.writeFileSync(DATA,JSON.stringify(data,null,2));
    return data;
  }
}
function writeCatalog(data){
  data.updatedAt=new Date().toISOString();
  fs.writeFileSync(DATA,JSON.stringify(data,null,2));
}
function auth(req,res,next){
  if(req.headers["x-admin-password"]!==ADMIN_PASSWORD)return res.status(401).json({ok:false,message:"Contraseña incorrecta"});
  next();
}

app.get("/api/catalog",(req,res)=>{
  const d=readCatalog();
  const products=d.products.map(p=>({
    code:p.code,name:p.name,cat:p.cat,desc:p.desc||"",image:p.image||null,
    available:p.available!==false,
    prices:{100:publicPrice(p,100,d.config),500:publicPrice(p,500,d.config),1000:publicPrice(p,1000,d.config)}
  }));
  res.json({products,updatedAt:d.updatedAt});
});

// Margen comercial: se suma el porcentaje indicado al costo.
// Ejemplo: costo $1.480 con 40% => $2.072.
function publicPrice(p,g,c){
  const margin=Number(p.margin??c.margin??40);
  const cost=Number(p.cost||0);
  const pack=Number((c.packaging||{})[g]||0);
  return Math.round((cost*g/1000+pack)*(1+margin/100));
}

app.get("/api/admin/catalog",auth,(req,res)=>res.json(readCatalog()));
app.put("/api/admin/catalog",auth,(req,res)=>{
  try{
    const body=req.body;
    if(!body||!Array.isArray(body.products)||!body.config) return res.status(400).json({ok:false,message:"Datos inválidos"});
    writeCatalog({products:body.products,config:body.config});
    res.json({ok:true,updatedAt:readCatalog().updatedAt});
  }catch(e){res.status(500).json({ok:false,message:e.message});}
});

app.get("/api/mayah",async(req,res)=>{
  try{const r=await fetch(MAYAH,{cache:"no-store"});const j=await r.json();res.json(j);}
  catch(e){res.status(502).json({status:"ERROR",message:"No se pudo consultar Mayah"});}
});

app.post("/api/admin/sync-mayah",auth,async(req,res)=>{
  try{
    const r=await fetch(MAYAH,{cache:"no-store"});
    const j=await r.json();
    const d=readCatalog();
    const incoming=j.response?.productos||[];
    let changed=0;
    for(const x of incoming){
      const p=d.products.find(y=>String(y.code)===String(x.codigo));
      if(p&&x.precio!=null){p.cost=Number(x.precio);changed++;}
      if(p&&x.imagen&&!p.image)p.image=x.imagen;
    }
    writeCatalog(d);
    res.json({ok:true,changed,updatedAt:d.updatedAt});
  }catch(e){res.status(502).json({ok:false,message:"No se pudo sincronizar Mayah"});}
});

app.use(express.static(__dirname));
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(process.env.PORT||3000,()=>console.log("NUTRILIFE lista"));
