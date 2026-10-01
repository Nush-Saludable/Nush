const express=require("express");
const cors=require("cors");
const path=require("path");
const app=express();
app.use(cors());
app.use(express.json({limit:"12mb"}));

const MAYAH="https://mayah.co/api/v1/publico/list_public/link/cfec25a072e111eb94fee71bd50f2bf6";

app.get("/api/mayah",async(req,res)=>{
  try{
    const r=await fetch(MAYAH,{cache:"no-store"});
    const j=await r.json();
    res.json(j);
  }catch(e){
    res.status(502).json({status:"ERROR",message:"No se pudo consultar Mayah"});
  }
});

app.use(express.static(__dirname));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));

app.listen(process.env.PORT||3000,()=>console.log("NUTRILIFE lista"));
