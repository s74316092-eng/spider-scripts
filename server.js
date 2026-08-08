const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data.json");

app.use(express.json({limit:"1mb"}));
app.use(express.static(__dirname));

function readData(){
  if(!fs.existsSync(DATA)) fs.writeFileSync(DATA, JSON.stringify({users:[], scripts:[]}, null, 2));
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}
function saveData(data){ fs.writeFileSync(DATA, JSON.stringify(data, null, 2)); }


function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")){
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return {salt, hash};
}
function verifyPassword(password, salt, hash){
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(test, "hex"), Buffer.from(hash, "hex"));
}

app.post("/api/register",(req,res)=>{
  const {username,email,password}=req.body;
  if(!username||!email||!password) return res.status(400).json({error:"Preencha usuário, e-mail e senha."});
  if(password.length<6) return res.status(400).json({error:"A senha precisa ter pelo menos 6 caracteres."});
  const data=readData(), em=email.trim().toLowerCase(), un=username.trim();
  if(data.users.some(u=>u.email===em || u.username.toLowerCase()===un.toLowerCase()))
    return res.status(409).json({error:"Usuário ou e-mail já cadastrado."});
  const {salt,hash}=hashPassword(password);
  const user={id:Date.now().toString(),username:un,email:em,passwordHash:hash,passwordSalt:salt,createdAt:new Date().toISOString()};
  data.users.push(user); saveData(data);
  res.status(201).json({id:user.id,username:user.username});
});

app.post("/api/login",(req,res)=>{const {email,password}=req.body;const data=readData();const u=data.users.find(x=>x.email===String(email||"").trim().toLowerCase());if(!u||!verifyPassword(password||"",u.passwordSalt,u.passwordHash))return res.status(401).json({error:"E-mail ou senha incorretos."});res.json({id:u.id,username:u.username});});

app.get("/api/stats",(req,res)=>{
  const data=readData();
  res.json({
    users:data.users.length,
    scripts:data.scripts.filter(s=>s.type==="script").length,
    tools:data.scripts.filter(s=>s.type==="executor").length,
    ratings:data.scripts.reduce((n,s)=>n+(s.ratings||0),0)
  });
});

app.get("/api/scripts", (req,res)=>res.json(readData().scripts));

app.post("/api/scripts", (req,res)=>{
  const {title, type, description, code, author} = req.body;
  if(!title || !description || !code || !author)
    return res.status(400).json({error:"Preencha todos os campos."});

  const data=readData();
  const item={
    id: Date.now().toString(),
    title, type:type==="executor"?"executor":"script",
    description, code, author,
    rating:0, ratings:0, downloads:0,
    createdAt:new Date().toISOString()
  };
  data.scripts.unshift(item);
  saveData(data);
  res.status(201).json(item);
});

app.post("/api/scripts/:id/rate",(req,res)=>{
  const score=Math.max(1,Math.min(5,Number(req.body.score)));
  const data=readData();
  const item=data.scripts.find(x=>x.id===req.params.id);
  if(!item) return res.status(404).json({error:"Script não encontrado."});
  item.rating=((item.rating*item.ratings)+score)/(item.ratings+1);
  item.ratings++;
  saveData(data);
  res.json(item);
});

app.post("/api/scripts/:id/download",(req,res)=>{
  const data=readData();
  const item=data.scripts.find(x=>x.id===req.params.id);
  if(!item) return res.status(404).json({error:"Script não encontrado."});
  item.downloads++;
  saveData(data);
  res.json({code:item.code, filename:item.title.replace(/[^a-z0-9_-]/gi,"_")+".txt"});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));

app.listen(PORT,()=>console.log(`ScriptForge online em http://localhost:${PORT}`));
