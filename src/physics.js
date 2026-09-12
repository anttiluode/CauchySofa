(function(root){
  'use strict';
  const TAU = Math.PI * 2;
  const OBJECT_COUNT = 3;
  const PARAMS_PER_OBJECT = 4;
  const BOUNDS = {
    distance:[1.25,2.25], radius:[0.10,0.28], reflectivity:[0.25,1.0]
  };
  function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }
  function wrapAngle(a){ a%=TAU; return a<0?a+TAU:a; }
  function cloneTheta(theta){ return theta.map(o=>({angle:o.angle,distance:o.distance,radius:o.radius,reflectivity:o.reflectivity})); }
  function canonicalizeTheta(theta){
    return cloneTheta(theta).map(o=>({
      angle:wrapAngle(o.angle),
      distance:clamp(o.distance,...BOUNDS.distance),
      radius:clamp(o.radius,...BOUNDS.radius),
      reflectivity:clamp(o.reflectivity,...BOUNDS.reflectivity)
    })).sort((a,b)=>a.angle-b.angle);
  }
  function flattenTheta(theta){
    const c=canonicalizeTheta(theta), out=[];
    for(const o of c) out.push(o.angle,o.distance,o.radius,o.reflectivity);
    return out;
  }
  function unflattenTheta(v){
    const t=[];
    for(let i=0;i<OBJECT_COUNT;i++) t.push({angle:v[i*4],distance:v[i*4+1],radius:v[i*4+2],reflectivity:v[i*4+3]});
    return canonicalizeTheta(t);
  }
  function thetaToUnit(theta){
    const out=[];
    for(const o of canonicalizeTheta(theta)){
      out.push(o.angle/TAU,
        (o.distance-BOUNDS.distance[0])/(BOUNDS.distance[1]-BOUNDS.distance[0]),
        (o.radius-BOUNDS.radius[0])/(BOUNDS.radius[1]-BOUNDS.radius[0]),
        (o.reflectivity-BOUNDS.reflectivity[0])/(BOUNDS.reflectivity[1]-BOUNDS.reflectivity[0]));
    }
    return out;
  }
  function unitToTheta(v){
    const t=[];
    for(let i=0;i<OBJECT_COUNT;i++){
      const j=i*4;
      const a=((v[j]%1)+1)%1;
      const d=clamp(v[j+1],0,1), r=clamp(v[j+2],0,1), q=clamp(v[j+3],0,1);
      t.push({
        angle:a*TAU,
        distance:BOUNDS.distance[0]+d*(BOUNDS.distance[1]-BOUNDS.distance[0]),
        radius:BOUNDS.radius[0]+r*(BOUNDS.radius[1]-BOUNDS.radius[0]),
        reflectivity:BOUNDS.reflectivity[0]+q*(BOUNDS.reflectivity[1]-BOUNDS.reflectivity[0])
      });
    }
    return canonicalizeTheta(t);
  }
  function parameterVectorDelta(a,b){
    const aa=thetaToUnit(a), bb=thetaToUnit(b), out=new Float64Array(aa.length);
    for(let i=0;i<aa.length;i++){
      let d=aa[i]-bb[i];
      if(i%4===0){ d=((d+0.5)%1+1)%1-0.5; }
      out[i]=d;
    }
    return out;
  }
  function rngFactory(seed){ let s=(seed|0)||1; return ()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)+0.5)/4294967296; }; }
  function seededTruth(seed){
    const r=rngFactory(seed||1);
    const anchors=[0.62,2.55,4.72];
    const ds=[1.52,1.84,1.44], rs=[0.18,0.23,0.145], qs=[0.86,0.57,0.92];
    const t=[];
    for(let i=0;i<OBJECT_COUNT;i++) t.push({
      angle:anchors[i]+(r()-0.5)*0.42,
      distance:ds[i]+(r()-0.5)*0.24,
      radius:rs[i]+(r()-0.5)*0.05,
      reflectivity:qs[i]+(r()-0.5)*0.14
    });
    return canonicalizeTheta(t);
  }
  function initialGuess(){
    return canonicalizeTheta([
      {angle:0.88,distance:1.68,radius:0.17,reflectivity:0.62},
      {angle:2.82,distance:1.70,radius:0.18,reflectivity:0.62},
      {angle:4.40,distance:1.70,radius:0.18,reflectivity:0.62}
    ]);
  }
  function defaultPhysicsConfig(){
    return {moonRadius:1, sensorRays:64, bounceDepth:2, viewpointCount:2, viewpointRadius:0.48,
      leak:0.48, attenuation:0.66, softHit:0.025, blurGrowth:0.035, pathFalloff:0.28,
      sensorBlurPerDepth:0.55, noise:0, noiseSeed:1337};
  }
  function makeViewpoints(count,cfg){
    const out=[]; const rad=cfg.viewpointRadius;
    for(let i=0;i<count;i++){
      const a=0.35+i*TAU/count;
      out.push({x:rad*Math.cos(a),y:rad*Math.sin(a),angle:a});
    }
    return out;
  }
  function rayCircleSoftHit(origin,dir,circle,softness){
    const vx=circle.x-origin.x, vy=circle.y-origin.y;
    const t=vx*dir.x+vy*dir.y;
    if(t<=0) return 0;
    const cx=origin.x+t*dir.x, cy=origin.y+t*dir.y;
    const dx=circle.x-cx, dy=circle.y-cy;
    const dist=Math.hypot(dx,dy);
    const z=(circle.radius-dist)/Math.max(1e-6,softness);
    const sig=z>35?1:z<-35?0:1/(1+Math.exp(-z));
    const front=1-Math.exp(-t/0.08);
    return sig*front;
  }
  function intersectMoon(o,d,R){
    const b=o.x*d.x+o.y*d.y;
    const c=o.x*o.x+o.y*o.y-R*R;
    const disc=Math.max(0,b*b-c);
    const t=-b+Math.sqrt(disc);
    return t>1e-8?t:null;
  }
  function circularBlur(src,sigma){
    if(sigma<=0.05) return Float64Array.from(src);
    const n=src.length, out=new Float64Array(n), rad=Math.max(1,Math.ceil(3*sigma));
    const w=[]; let ws=0;
    for(let k=-rad;k<=rad;k++){ const q=Math.exp(-0.5*(k/sigma)*(k/sigma)); w.push(q); ws+=q; }
    for(let i=0;i<n;i++){
      let s=0;
      for(let k=-rad;k<=rad;k++){ const j=(i+k+n)%n; s+=src[j]*w[k+rad]; }
      out[i]=s/ws;
    }
    return out;
  }
  function gaussianNoise(seed,index){
    let x=(seed + Math.imul(index+1,0x9e3779b1))|0;
    function u(){ x^=x<<13; x^=x>>>17; x^=x<<5; return ((x>>>0)+1)/4294967297; }
    const u1=Math.max(1e-12,u()), u2=u();
    return Math.sqrt(-2*Math.log(u1))*Math.cos(TAU*u2);
  }
  function forward(theta,config){
    const cfg=Object.assign(defaultPhysicsConfig(),config||{});
    const world=canonicalizeTheta(theta).map(o=>Object.assign({},o,{x:o.distance*Math.cos(o.angle),y:o.distance*Math.sin(o.angle)}));
    const views=makeViewpoints(cfg.viewpointCount,cfg);
    const all=[]; const debug={rays:[],contributions:[],viewpoints:views};
    for(let vi=0;vi<views.length;vi++){
      const view=views[vi]; const strip=new Float64Array(cfg.sensorRays);
      for(let ri=0;ri<cfg.sensorRays;ri++){
        const a=TAU*(ri/cfg.sensorRays)+0.11*vi;
        let o={x:view.x,y:view.y}, d={x:Math.cos(a),y:Math.sin(a)}, remaining=1, total=0;
        const path=[];
        for(let b=0;b<cfg.bounceDepth;b++){
          const t=intersectMoon(o,d,cfg.moonRadius); if(t===null) break;
          const hit={x:o.x+t*d.x,y:o.y+t*d.y};
          const n={x:hit.x/cfg.moonRadius,y:hit.y/cfg.moonRadius};
          const extO={x:hit.x+d.x*1e-4,y:hit.y+d.y*1e-4};
          let bounceContribution=0;
          const softness=cfg.softHit+b*cfg.blurGrowth;
          for(let oi=0;oi<world.length;oi++){
            const obj=world[oi];
            const vx=obj.x-extO.x, vy=obj.y-extO.y, along=vx*d.x+vy*d.y;
            const soft=rayCircleSoftHit(extO,d,{x:obj.x,y:obj.y,radius:obj.radius},softness);
            if(soft<=0) continue;
            const fall=1/(1+cfg.pathFalloff*Math.max(0,along)*Math.max(0,along));
            bounceContribution += obj.reflectivity*soft*fall;
          }
          const gain=remaining*cfg.leak;
          total += gain*bounceContribution;
          path.push({x:hit.x,y:hit.y,bounce:b,value:gain*bounceContribution});
          remaining *= (1-cfg.leak)*cfg.attenuation;
          const dot=d.x*n.x+d.y*n.y;
          d={x:d.x-2*dot*n.x,y:d.y-2*dot*n.y};
          o={x:hit.x-n.x*1e-4,y:hit.y-n.y*1e-4};
        }
        strip[ri]=total;
        if(vi===0 && ri%8===0) debug.rays.push({view:{x:view.x,y:view.y},angle:a,path});
      }
      const blurred=circularBlur(strip,Math.max(0,(cfg.bounceDepth-1)*cfg.sensorBlurPerDepth));
      for(let i=0;i<blurred.length;i++) all.push(blurred[i]);
    }
    const observation=Float64Array.from(all);
    if(cfg.noise>0){ for(let i=0;i<observation.length;i++) observation[i]+=cfg.noise*gaussianNoise(cfg.noiseSeed,i); }
    return {observation,debug};
  }
  function mse(a,b){
    if(a.length!==b.length) throw new Error('mse length mismatch');
    let s=0; for(let i=0;i<a.length;i++){ const d=a[i]-b[i]; s+=d*d; }
    return s/a.length;
  }
  root.CauchyPhysics={TAU,OBJECT_COUNT,PARAMS_PER_OBJECT,BOUNDS,defaultPhysicsConfig,seededTruth,initialGuess,cloneTheta,flattenTheta,unflattenTheta,thetaToUnit,unitToTheta,canonicalizeTheta,parameterVectorDelta,rayCircleSoftHit,forward,mse,makeViewpoints};
})(typeof globalThis!=='undefined'?globalThis:window);
