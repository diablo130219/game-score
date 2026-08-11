const http=require("http");
const fs=require("fs");
const path=require("path");
const root=__dirname;
const port=process.env.PORT||3000;

const types={
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".webp":"image/webp",
  ".svg":"image/svg+xml",
  ".ico":"image/x-icon",
  ".json":"application/json; charset=utf-8",
  ".txt":"text/plain; charset=utf-8"
};

http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  let rel=decodeURIComponent(url.pathname);
  if(rel==="/"||!path.extname(rel))rel="/index.html";
  const file=path.normalize(path.join(root,rel));
  if(!file.startsWith(root)){
    res.writeHead(403);return res.end("Forbidden");
  }
  fs.readFile(file,(err,data)=>{
    if(err){
      fs.readFile(path.join(root,"index.html"),(e,index)=>{
        if(e){res.writeHead(404);return res.end("Not found")}
        res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});
        res.end(index);
      });
      return;
    }
    res.writeHead(200,{
      "Content-Type":types[path.extname(file).toLowerCase()]||"application/octet-stream",
      "Cache-Control":path.basename(file)==="index.html"?"no-cache":"public, max-age=3600"
    });
    res.end(data);
  });
}).listen(port,()=>console.log(`GAME SCORE online on port ${port}`));
