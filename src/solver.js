(function(root){
  'use strict';
  const P=root.CauchyPhysics;
  if(!P){ root.CauchySolver={}; return; }

  function cloneConfig(cfg){ return Object.assign({},cfg,{noise:0}); }
  function predict(theta,cfg,counter){
    if(counter) counter.count=(counter.count||0)+1;
    return P.forward(theta,cfg).observation;
  }
  function finiteDifferenceJacobian(theta,target,cfg,counter,eps=0.012){
    const x=P.thetaToUnit(theta), rows=target.length, cols=x.length;
    const J=new Float64Array(rows*cols);
    const modelCfg=cloneConfig(cfg);
    for(let j=0;j<cols;j++){
      const xp=x.slice(), xm=x.slice();
      xp[j]+=eps; xm[j]-=eps;
      const yp=predict(P.unitToTheta(xp),modelCfg,counter);
      const ym=predict(P.unitToTheta(xm),modelCfg,counter);
      const inv=1/(2*eps);
      for(let i=0;i<rows;i++) J[i*cols+j]=(yp[i]-ym[i])*inv;
    }
    return {J,rows,cols};
  }
  function normalEquations(J,r,rows,cols,lambda){
    const A=new Float64Array(cols*cols), b=new Float64Array(cols);
    for(let i=0;i<rows;i++){
      const off=i*cols, ri=r[i];
      for(let j=0;j<cols;j++){
        const Jij=J[off+j]; b[j]+=Jij*ri;
        for(let k=j;k<cols;k++) A[j*cols+k]+=Jij*J[off+k];
      }
    }
    for(let j=0;j<cols;j++){
      for(let k=j+1;k<cols;k++) A[k*cols+j]=A[j*cols+k];
      A[j*cols+j]+=lambda;
    }
    return {A,b};
  }
  function solveLinear(Ain,bin,n){
    const A=Float64Array.from(Ain), b=Float64Array.from(bin);
    for(let k=0;k<n;k++){
      let piv=k, pv=Math.abs(A[k*n+k]);
      for(let i=k+1;i<n;i++){ const v=Math.abs(A[i*n+k]); if(v>pv){pv=v;piv=i;} }
      if(pv<1e-14){ A[k*n+k]+=1e-10; pv=Math.abs(A[k*n+k]); }
      if(piv!==k){
        for(let j=k;j<n;j++){const t=A[k*n+j];A[k*n+j]=A[piv*n+j];A[piv*n+j]=t;}
        const tb=b[k];b[k]=b[piv];b[piv]=tb;
      }
      const diag=A[k*n+k];
      for(let i=k+1;i<n;i++){
        const f=A[i*n+k]/diag; if(!Number.isFinite(f)) continue;
        A[i*n+k]=0;
        for(let j=k+1;j<n;j++) A[i*n+j]-=f*A[k*n+j];
        b[i]-=f*b[k];
      }
    }
    const x=new Float64Array(n);
    for(let i=n-1;i>=0;i--){
      let s=b[i]; for(let j=i+1;j<n;j++) s-=A[i*n+j]*x[j];
      const d=A[i*n+i]; x[i]=Math.abs(d)<1e-14?0:s/d;
    }
    return x;
  }
  function dampedLeastSquares(J,residual,rows,cols,lambda){
    const {A,b}=normalEquations(J,residual,rows,cols,lambda);
    return solveLinear(A,b,cols);
  }
  function jtJ(J,rows,cols){
    const A=new Float64Array(cols*cols);
    for(let i=0;i<rows;i++){
      const off=i*cols;
      for(let j=0;j<cols;j++) for(let k=j;k<cols;k++) A[j*cols+k]+=J[off+j]*J[off+k];
    }
    for(let j=0;j<cols;j++) for(let k=j+1;k<cols;k++) A[k*cols+j]=A[j*cols+k];
    return A;
  }
  function jacobiEigenvalues(Ain,n){
    const A=Float64Array.from(Ain);
    const maxIter=80*n*n;
    for(let iter=0;iter<maxIter;iter++){
      let p=0,q=1,max=0;
      for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
        const v=Math.abs(A[i*n+j]); if(v>max){max=v;p=i;q=j;}
      }
      if(max<1e-12) break;
      const app=A[p*n+p], aqq=A[q*n+q], apq=A[p*n+q];
      const phi=0.5*Math.atan2(2*apq,aqq-app), c=Math.cos(phi), s=Math.sin(phi);
      for(let k=0;k<n;k++) if(k!==p && k!==q){
        const akp=A[k*n+p], akq=A[k*n+q];
        const nkp=c*akp-s*akq, nkq=s*akp+c*akq;
        A[k*n+p]=A[p*n+k]=nkp; A[k*n+q]=A[q*n+k]=nkq;
      }
      A[p*n+p]=c*c*app-2*s*c*apq+s*s*aqq;
      A[q*n+q]=s*s*app+2*s*c*apq+c*c*aqq;
      A[p*n+q]=A[q*n+p]=0;
    }
    const ev=[]; for(let i=0;i<n;i++) ev.push(A[i*n+i]);
    return ev;
  }
  function singularDiagnostics(J,rows,cols){
    const ev=jacobiEigenvalues(jtJ(J,rows,cols),cols);
    const s=ev.map(v=>Math.sqrt(Math.max(0,v))).sort((a,b)=>b-a);
    const max=s[0]||0, threshold=max*1e-3;
    const retained=s.filter(v=>v>threshold && v>1e-12);
    return {singularValues:s,effectiveRank:retained.length,conditionEstimate:retained.length?max/retained[retained.length-1]:Infinity};
  }
  function xorshift(state){
    let x=state.rngState|0; if(!x)x=1; x^=x<<13; x^=x>>>17; x^=x<<5; state.rngState=x|0; return ((x>>>0)+0.5)/4294967296;
  }
  function randn(state){
    const u1=Math.max(1e-12,xorshift(state)), u2=xorshift(state);
    return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
  }
  function norm(v){ let s=0;for(const x of v)s+=x*x;return Math.sqrt(s); }
  function makeResidual(target,pred){ const r=new Float64Array(target.length);for(let i=0;i<r.length;i++)r[i]=target[i]-pred[i];return r; }
  function evaluateStateCandidate(state,theta){
    const pred=predict(theta,state.physicsConfig,null); state.forwardEvals++;
    return {theta:P.cloneTheta(theta),prediction:pred,mse:P.mse(state.target,pred)};
  }
  function acceptIfBetter(state,c){
    if(c.mse < state.bestMSE){
      state.theta=P.cloneTheta(c.theta); state.bestTheta=P.cloneTheta(c.theta); state.bestPrediction=c.prediction; state.bestMSE=c.mse; state.accepted++;
      state.history.push({evals:state.forwardEvals,mse:state.bestMSE}); return true;
    }
    state.rejected++; state.history.push({evals:state.forwardEvals,mse:state.bestMSE}); return false;
  }
  function createState(mode,initialTheta,target,physicsConfig,seed){
    const cfg=cloneConfig(physicsConfig), theta=P.cloneTheta(initialTheta), pred=P.forward(theta,cfg).observation;
    return {mode,theta:P.cloneTheta(theta),bestTheta:P.cloneTheta(theta),bestPrediction:pred,target:Float64Array.from(target),physicsConfig:cfg,
      bestMSE:P.mse(target,pred),forwardEvals:1,accepted:0,rejected:0,trustRadius:0.22,damping:0.006,mutationScale:0.10,
      history:[{evals:1,mse:P.mse(target,pred)}],singularValues:[],effectiveRank:0,conditionEstimate:Infinity,rngState:(seed|0)||1,
      lastStepNorm:0,hybridCounter:0};
  }
  function blindStep(state){
    const x=P.thetaToUnit(state.bestTheta), cand=x.slice();
    for(let j=0;j<cand.length;j++) cand[j]+=randn(state)*state.mutationScale*(j%4===0?0.65:1);
    const c=evaluateStateCandidate(state,P.unitToTheta(cand));
    const ok=acceptIfBetter(state,c);
    state.mutationScale=ok?Math.min(0.18,state.mutationScale*1.025):Math.max(0.012,state.mutationScale*0.996);
    state.lastStepNorm=norm(cand.map((v,i)=>v-x[i]));
    return ok;
  }
  function linearStep(state){
    const counter={count:0};
    const fd=finiteDifferenceJacobian(state.bestTheta,state.target,state.physicsConfig,counter,0.010);
    state.forwardEvals+=counter.count;
    const diag=singularDiagnostics(fd.J,fd.rows,fd.cols);
    state.singularValues=diag.singularValues; state.effectiveRank=diag.effectiveRank; state.conditionEstimate=diag.conditionEstimate;
    const residual=makeResidual(state.target,state.bestPrediction);
    const scale=(()=>{const A=jtJ(fd.J,fd.rows,fd.cols);let tr=0;for(let i=0;i<fd.cols;i++)tr+=A[i*fd.cols+i];return tr/fd.cols;})();
    let delta=dampedLeastSquares(fd.J,residual,fd.rows,fd.cols,Math.max(1e-10,state.damping*(scale+1e-9)));
    let dn=norm(delta); if(dn>state.trustRadius){const f=state.trustRadius/dn;for(let i=0;i<delta.length;i++)delta[i]*=f;dn=state.trustRadius;}
    state.lastStepNorm=dn;
    const x=P.thetaToUnit(state.bestTheta), cand=x.map((v,i)=>v+delta[i]);
    const c=evaluateStateCandidate(state,P.unitToTheta(cand));
    const ok=acceptIfBetter(state,c);
    if(ok){state.trustRadius=Math.min(0.35,state.trustRadius*1.18);state.damping=Math.max(1e-5,state.damping*0.65);}else{state.trustRadius=Math.max(0.005,state.trustRadius*0.5);state.damping=Math.min(10,state.damping*4);}
    return ok;
  }
  function step(state){
    if(state.mode==='Blind') return blindStep(state);
    if(state.mode==='Linear') return linearStep(state);
    if(state.mode==='Hybrid'){
      state.hybridCounter++;
      if(state.hybridCounter%6===0 || (state.hybridCounter<3 && state.accepted===0)) return linearStep(state);
      return blindStep(state);
    }
    throw new Error(`unknown solver mode ${state.mode}`);
  }
  function bestSnapshot(state){
    return {theta:P.cloneTheta(state.bestTheta),mse:state.bestMSE,forwardEvals:state.forwardEvals,accepted:state.accepted,rejected:state.rejected,
      trustRadius:state.trustRadius,singularValues:state.singularValues.slice(),effectiveRank:state.effectiveRank,conditionEstimate:state.conditionEstimate,lastStepNorm:state.lastStepNorm};
  }
  root.CauchySolver={createState,step,finiteDifferenceJacobian,dampedLeastSquares,singularDiagnostics,bestSnapshot};
})(typeof globalThis!=='undefined'?globalThis:window);
