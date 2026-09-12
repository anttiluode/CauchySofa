(function(root){
  'use strict';
  const P=root.CauchyPhysics,S=root.CauchySolver,R=root.CauchyRender;
  if(!P||!S){root.CauchyAppCore={};return;}
  const MODES=['Blind','Linear','Hybrid'];
  function createExperiment(seed,config){
    const physics=Object.assign(P.defaultPhysicsConfig(),config||{});
    const truth=P.seededTruth(seed);
    const targetResult=P.forward(truth,physics);
    const ex={seed,physics,truth,targetObservation:targetResult.observation,targetDebug:targetResult.debug,solvers:{},initialTheta:P.initialGuess()};
    resetSolvers(ex);return ex;
  }
  function resetSolvers(ex){
    const model=Object.assign({},ex.physics,{noise:0});
    ex.solvers={};MODES.forEach((m,i)=>{ex.solvers[m]=S.createState(m,P.cloneTheta(ex.initialTheta),ex.targetObservation,model,ex.seed*101+i*17+3);});
    return ex;
  }
  function updatePhysics(ex,patch){
    Object.assign(ex.physics,patch||{});const t=P.forward(ex.truth,ex.physics);ex.targetObservation=t.observation;ex.targetDebug=t.debug;resetSolvers(ex);return ex;
  }
  function geometryError(a,b){
    const d=P.parameterVectorDelta(a,b);let s=0;for(const x of d)s+=x*x;return Math.sqrt(s/d.length);
  }
  function identifiabilityStatus(state,truth,initialMSE){
    const ge=geometryError(state.bestTheta,truth), fit=state.bestMSE<Math.max(1e-8,initialMSE*0.025);
    if(fit&&((state.effectiveRank>0&&state.effectiveRank<12)||ge>0.17)) return {code:'NOT_IDENTIFIABLE',text:'OBSERVATION FIT GOOD / GEOMETRY NOT IDENTIFIABLE',className:'warn',geometryError:ge};
    if(fit&&ge<0.12) return {code:'RECOVERED',text:'GEOMETRY RECOVERED',className:'good',geometryError:ge};
    return {code:'SEARCHING',text:'SEARCHING THE HIDDEN OUTSIDE',className:'search',geometryError:ge};
  }
  root.CauchyAppCore={createExperiment,resetSolvers,updatePhysics,geometryError,identifiabilityStatus,MODES};

  if(typeof document==='undefined'||!R)return;
  function $(id){return document.getElementById(id);}
  function init(){
    const els={truth:$('truthCanvas'),sensor:$('sensorCanvas'),recon:$('reconCanvas'),history:$('historyCanvas'),sv:$('svCanvas'),
      run:$('runBtn'),step:$('stepBtn'),reset:$('resetBtn'),newWorld:$('newBtn'),mode:$('modeSelect'),depth:$('depthSelect'),noise:$('noiseRange'),noiseVal:$('noiseVal'),views:$('viewSelect'),status:$('status'),
      mse:$('mseVal'),geom:$('geomVal'),evals:$('evalVal'),blind:$('blindVal'),linear:$('linearVal'),hybrid:$('hybridVal'),rank:$('rankVal'),cond:$('condVal'),ar:$('arVal')};
    if(!els.truth)return;
    let ex=createExperiment(1,P.defaultPhysicsConfig()),running=false;
    els.mode.value='Hybrid';
    function selected(){return ex.solvers[els.mode.value];}
    function fmt(x){if(!Number.isFinite(x))return '∞';if(x===0)return '0';if(Math.abs(x)<1e-3)return x.toExponential(2);return x.toFixed(5);}
    function identStatus(st){
      const s=identifiabilityStatus(st,ex.truth,st.history[0].mse);
      return [s.text,s.className];
    }
    function render(){
      const st=selected(), views=P.makeViewpoints(ex.physics.viewpointCount,ex.physics);
      R.drawWorld(els.truth,ex.truth,{truth:true,viewpoints:views});R.drawSensor(els.sensor,ex.targetObservation,ex.targetDebug,{viewpointCount:ex.physics.viewpointCount});R.drawWorld(els.recon,st.bestTheta,{truth:false,viewpoints:views});
      R.drawHistory(els.history,{Blind:ex.solvers.Blind.history,Linear:ex.solvers.Linear.history,Hybrid:ex.solvers.Hybrid.history});R.drawSingularValues(els.sv,st.singularValues,st.effectiveRank);
      els.mse.textContent=fmt(st.bestMSE);els.geom.textContent=geometryError(st.bestTheta,ex.truth).toFixed(4);els.evals.textContent=st.forwardEvals;
      els.blind.textContent=fmt(ex.solvers.Blind.bestMSE);els.linear.textContent=fmt(ex.solvers.Linear.bestMSE);els.hybrid.textContent=fmt(ex.solvers.Hybrid.bestMSE);els.rank.textContent=`${st.effectiveRank}/12`;els.cond.textContent=fmt(st.conditionEstimate);els.ar.textContent=`${st.accepted} / ${st.rejected}`;
      const [text,cls]=identStatus(st);els.status.textContent=text;els.status.className='status '+cls;els.run.textContent=running?'Pause':'Run';
    }
    function advanceFair(){
      let pick=ex.solvers.Blind;for(const m of MODES)if(ex.solvers[m].forwardEvals<pick.forwardEvals)pick=ex.solvers[m];S.step(pick);
    }
    function loop(){if(!running)return;const start=performance.now();while(performance.now()-start<10)advanceFair();render();requestAnimationFrame(loop);}
    els.run.onclick=()=>{running=!running;render();if(running)requestAnimationFrame(loop);};
    els.step.onclick=()=>{S.step(selected());render();};
    els.reset.onclick=()=>{running=false;resetSolvers(ex);render();};
    els.newWorld.onclick=()=>{running=false;ex=createExperiment((Date.now()&0x7fffffff)||2,ex.physics);render();};
    els.mode.onchange=render;
    els.depth.onchange=()=>{running=false;updatePhysics(ex,{bounceDepth:+els.depth.value});render();};
    els.views.onchange=()=>{running=false;updatePhysics(ex,{viewpointCount:+els.views.value});render();};
    els.noise.oninput=()=>{els.noiseVal.textContent=(+els.noise.value).toFixed(3);};
    els.noise.onchange=()=>{running=false;updatePhysics(ex,{noise:+els.noise.value});render();};
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof globalThis!=='undefined'?globalThis:window);
