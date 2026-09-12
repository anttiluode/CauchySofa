const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
for(const f of ['src/physics.js','src/solver.js','src/app.js']) vm.runInThisContext(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
function run(depth,budget=1200){
  const cfg=CauchyPhysics.defaultPhysicsConfig();cfg.noise=0;cfg.bounceDepth=depth;cfg.viewpointCount=2;
  const ex=CauchyAppCore.createExperiment(1,cfg), out={};
  for(const mode of CauchyAppCore.MODES){
    const st=ex.solvers[mode],initial=st.bestMSE;
    while(st.forwardEvals<budget)CauchySolver.step(st);
    out[mode]={initial,best:st.bestMSE,evals:st.forwardEvals,geometryError:CauchyAppCore.geometryError(st.bestTheta,ex.truth),rank:st.effectiveRank,condition:st.conditionEstimate};
  }
  return out;
}
function threshold(depth,limit=5000,threshold=1e-4){
  const cfg=CauchyPhysics.defaultPhysicsConfig();cfg.noise=0;cfg.bounceDepth=depth;cfg.viewpointCount=2;
  const ex=CauchyAppCore.createExperiment(1,cfg),out={};
  for(const mode of CauchyAppCore.MODES){const st=ex.solvers[mode];while(st.forwardEvals<limit&&st.bestMSE>threshold)CauchySolver.step(st);out[mode]={evals:st.forwardEvals,mse:st.bestMSE,reached:st.bestMSE<=threshold};}return out;
}
for(const depth of [1,2,4,8]) console.log(`depth ${depth}`,JSON.stringify(run(depth),null,2));
console.log('depth 2 threshold 1e-4',JSON.stringify(threshold(2),null,2));
