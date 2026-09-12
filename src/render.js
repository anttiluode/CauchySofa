(function(root){
  'use strict';
  function ctx2d(canvas){ return canvas && canvas.getContext ? canvas.getContext('2d') : null; }
  function clear(ctx,w,h,bg='#071018'){ ctx.fillStyle=bg;ctx.fillRect(0,0,w,h); }
  function worldMap(canvas,x,y){ const s=Math.min(canvas.width,canvas.height)/5.4; return {x:canvas.width/2+x*s,y:canvas.height/2-y*s,s}; }
  function drawWorld(canvas,theta,options={}){
    const ctx=ctx2d(canvas); if(!ctx)return; const w=canvas.width,h=canvas.height; clear(ctx,w,h,options.background||'#071018');
    const m=worldMap(canvas,0,0), R=m.s;
    const g=ctx.createRadialGradient(m.x,m.y,0,m.x,m.y,R*1.05);g.addColorStop(0,'#112a38');g.addColorStop(0.72,'#0b1823');g.addColorStop(1,'#1d3240');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(m.x,m.y,R,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#78b8c8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(m.x,m.y,R,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([4,6]);ctx.strokeStyle='rgba(120,184,200,.25)';ctx.beginPath();ctx.arc(m.x,m.y,R*2.25,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    const views=options.viewpoints||[];
    for(const v of views){ const p=worldMap(canvas,v.x,v.y);ctx.fillStyle='#fff4bf';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill(); }
    const palette=options.truth?['#ffad66','#f47fa8','#d8df7a']:['#73e2ff','#9a8cff','#66f0b4'];
    (theta||[]).forEach((o,i)=>{
      const x=o.distance*Math.cos(o.angle), y=o.distance*Math.sin(o.angle), p=worldMap(canvas,x,y); const rad=o.radius*p.s;
      ctx.fillStyle=palette[i%palette.length]+'b8';ctx.strokeStyle=palette[i%palette.length];ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(p.x,p.y,rad,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.strokeStyle=palette[i%palette.length]+'55';ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(p.x,p.y);ctx.stroke();
      ctx.fillStyle='#d9edf3';ctx.font='12px system-ui';ctx.fillText(String(i+1),p.x+rad+5,p.y-4);
    });
    ctx.fillStyle='rgba(225,245,250,.72)';ctx.font='12px system-ui';ctx.fillText('known moon boundary',12,h-14);
  }
  function drawSensor(canvas,observation,debug,options={}){
    const ctx=ctx2d(canvas);if(!ctx)return;const w=canvas.width,h=canvas.height;clear(ctx,w,h,'#071018');
    const count=options.viewpointCount||1, rays=Math.max(1,Math.floor(observation.length/count));
    let mx=1e-9;for(const v of observation)mx=Math.max(mx,Math.abs(v));
    const stripH=Math.min(105,Math.floor(h*0.34)), rowH=stripH/count;
    for(let vi=0;vi<count;vi++) for(let i=0;i<rays;i++){
      const v=Math.max(0,observation[vi*rays+i]/mx), x=i*w/rays, ww=Math.ceil(w/rays)+1;
      const hue=205-165*v, light=8+64*Math.pow(v,.65);
      ctx.fillStyle=`hsl(${hue} 85% ${light}%)`;ctx.fillRect(x,vi*rowH,ww,rowH-1);
    }
    ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='11px system-ui';ctx.fillText('actual numeric observation fed to solver',10,stripH+16);
    const cx=w/2,cy=stripH+(h-stripH)/2+10,R=Math.min(w,h-stripH)*0.29;
    ctx.strokeStyle='#477486';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
    const views=(debug&&debug.viewpoints)||[];
    for(const v of views){ const px=cx+v.x*R,py=cy-v.y*R;ctx.fillStyle='#fff0a6';ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill(); }
    if(debug&&debug.rays){ctx.strokeStyle='rgba(94,210,234,.24)';ctx.lineWidth=1;for(const r of debug.rays){let x0=cx+r.view.x*R,y0=cy-r.view.y*R;ctx.beginPath();ctx.moveTo(x0,y0);for(const p of r.path){const x=cx+p.x*R,y=cy-p.y*R;ctx.lineTo(x,y);x0=x;y0=y;}ctx.stroke();}}
  }
  function drawHistory(canvas,histories){
    const ctx=ctx2d(canvas);if(!ctx)return;const w=canvas.width,h=canvas.height;clear(ctx,w,h,'#071018');
    const pad={l:46,r:15,t:18,b:30}, colors={Blind:'#ffb454',Linear:'#69d7ff',Hybrid:'#a9ef84'};
    let maxX=1,minY=Infinity,maxY=0;
    for(const arr of Object.values(histories||{})) for(const p of arr){maxX=Math.max(maxX,p.evals);minY=Math.min(minY,p.mse);maxY=Math.max(maxY,p.mse);}
    if(!Number.isFinite(minY)){minY=1e-8;maxY=1;} minY=Math.max(1e-12,minY);maxY=Math.max(minY*1.01,maxY);
    const ly=y=>Math.log10(Math.max(1e-12,y)), lo=ly(minY),hi=ly(maxY);
    const X=x=>pad.l+(w-pad.l-pad.r)*x/maxX, Y=y=>pad.t+(h-pad.t-pad.b)*(1-(ly(y)-lo)/(hi-lo||1));
    ctx.strokeStyle='rgba(180,220,230,.18)';ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
    for(const [name,arr] of Object.entries(histories||{})){if(!arr.length)continue;ctx.strokeStyle=colors[name]||'#fff';ctx.lineWidth=2;ctx.beginPath();arr.forEach((p,i)=>{const x=X(p.evals),y=Y(p.mse);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
    ctx.fillStyle='#9eb8c1';ctx.font='11px system-ui';ctx.fillText('forward evaluations →',w-120,h-9);ctx.save();ctx.translate(12,h/2);ctx.rotate(-Math.PI/2);ctx.fillText('log observation MSE',0,0);ctx.restore();
    let lx=pad.l;for(const n of ['Blind','Linear','Hybrid']){ctx.fillStyle=colors[n];ctx.fillRect(lx,7,10,3);ctx.fillStyle='#dcebf0';ctx.fillText(n,lx+14,12);lx+=72;}
  }
  function drawSingularValues(canvas,values,rank){
    const ctx=ctx2d(canvas);if(!ctx)return;const w=canvas.width,h=canvas.height;clear(ctx,w,h,'#071018');
    const vals=(values||[]).slice(0,12), mx=vals[0]||1, pad=16, bw=(w-2*pad)/Math.max(1,vals.length);
    vals.forEach((v,i)=>{const q=Math.max(0,Math.min(1,v/mx));ctx.fillStyle=i<rank?'#69d7ff':'#324a56';ctx.fillRect(pad+i*bw,h-22-q*(h-46),Math.max(2,bw-4),q*(h-46));ctx.fillStyle='#91a9b2';ctx.font='9px system-ui';ctx.fillText(String(i+1),pad+i*bw+2,h-8);});
    ctx.fillStyle='#dcebf0';ctx.font='11px system-ui';ctx.fillText(`Jacobian singular spectrum · effective rank ${rank||0}/12`,pad,14);
  }
  root.CauchyRender={drawWorld,drawSensor,drawHistory,drawSingularValues};
})(typeof globalThis!=='undefined'?globalThis:window);
