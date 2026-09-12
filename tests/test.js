(function(root){
  'use strict';
  const tests = [];
  function test(name, fn){ tests.push({name, fn}); }
  function assert(cond, msg){ if(!cond) throw new Error(msg || 'assertion failed'); }
  function approx(a,b,eps=1e-9){ return Math.abs(a-b) <= eps; }

  test('physics API exists', () => {
    const P = root.CauchyPhysics;
    assert(P && typeof P.forward === 'function', 'CauchyPhysics.forward should exist');
  });

  test('ray soft hit is strongest through circle center', () => {
    const P = root.CauchyPhysics;
    const circle = {x:2,y:0,radius:0.2};
    const hit = P.rayCircleSoftHit({x:1,y:0},{x:1,y:0},circle,0.02);
    const miss = P.rayCircleSoftHit({x:1,y:0.5},{x:1,y:0},circle,0.02);
    assert(hit > 0.95, `center hit ${hit}`);
    assert(miss < 0.05, `miss ${miss}`);
  });

  test('parameter bounds wrap angle and clamp scalar parameters', () => {
    const P = root.CauchyPhysics;
    const theta = [{angle: 2*Math.PI + 0.25, distance: 0.2, radius: 2, reflectivity:-1},
      {angle: 2.0, distance:1.5, radius:0.15, reflectivity:0.5},
      {angle: 4.0, distance:1.7, radius:0.2, reflectivity:0.8}];
    const c = P.canonicalizeTheta(theta);
    assert(c.length === 3, 'three objects');
    assert(c[0].angle >= 0 && c[0].angle < 2*Math.PI, 'angle wrapped');
    assert(c[0].distance >= 1.25, 'distance clamped');
    assert(c[0].radius <= 0.28, 'radius clamped');
    assert(c[0].reflectivity >= 0.25, 'reflectivity clamped');
  });

  test('seeded truth is deterministic and cloned', () => {
    const P = root.CauchyPhysics;
    const a = P.seededTruth(7), b = P.seededTruth(7);
    assert(JSON.stringify(a) === JSON.stringify(b), 'same seed should match');
    a[0].angle += 1;
    assert(!approx(a[0].angle, b[0].angle), 'results must not share references');
  });

  test('forward model is deterministic and geometry-sensitive', () => {
    const P = root.CauchyPhysics;
    const cfg = P.defaultPhysicsConfig(); cfg.noise = 0; cfg.bounceDepth = 2; cfg.viewpointCount = 2;
    const t = P.seededTruth(1);
    const y1 = P.forward(t,cfg).observation;
    const y2 = P.forward(t,cfg).observation;
    assert(y1.length === y2.length && y1.length > 20, 'observation dimensions');
    let maxDiff=0; for(let i=0;i<y1.length;i++) maxDiff=Math.max(maxDiff,Math.abs(y1[i]-y2[i]));
    assert(maxDiff < 1e-12, `determinism diff=${maxDiff}`);
    const p = P.cloneTheta(t); p[0].angle += 0.18; const yp = P.forward(p,cfg).observation;
    assert(P.mse(y1,yp) > 1e-7, `perturbation should change observation: ${P.mse(y1,yp)}`);
  });

  test('reconstruction clone cannot mutate truth', () => {
    const P = root.CauchyPhysics;
    const truth=P.seededTruth(1), recon=P.cloneTheta(truth); recon[0].distance += 0.2;
    assert(!approx(truth[0].distance,recon[0].distance), 'no shared object references');
  });

  test('solver API exists', () => {
    const S=root.CauchySolver;
    assert(S && typeof S.createState === 'function' && typeof S.step === 'function', 'solver API should exist');
  });

  test('finite difference Jacobian is observationLength x 12 and finite', () => {
    const P=root.CauchyPhysics, S=root.CauchySolver;
    const cfg=P.defaultPhysicsConfig(); cfg.noise=0; cfg.sensorRays=24; cfg.viewpointCount=1; cfg.bounceDepth=2;
    const t=P.initialGuess(); const target=P.forward(P.seededTruth(1),cfg).observation;
    const counter={count:0};
    const r=S.finiteDifferenceJacobian(t,target,cfg,counter);
    assert(r.rows===target.length && r.cols===12, `shape ${r.rows}x${r.cols}`);
    for(const x of r.J) assert(Number.isFinite(x),'Jacobian finite');
    assert(counter.count===24, `central differences should cost 24 evals, got ${counter.count}`);
  });

  test('damped least squares reduces a synthetic linear residual', () => {
    const S=root.CauchySolver;
    const J=new Float64Array([1,0, 0,2, 1,1]);
    const r=new Float64Array([1,2,1.5]);
    const d=S.dampedLeastSquares(J,r,3,2,1e-8);
    function err(v){ let e=0; for(let i=0;i<3;i++){let y=0;for(let j=0;j<2;j++)y+=J[i*2+j]*v[j]; const q=y-r[i];e+=q*q;} return e; }
    assert(err(d) < err(new Float64Array(2)), `error ${err(d)}`);
  });

  test('singular diagnostics recognize rank two matrix', () => {
    const S=root.CauchySolver;
    const J=new Float64Array([1,0,0, 0,2,0, 1,2,0, 2,0,0]);
    const d=S.singularDiagnostics(J,4,3);
    assert(d.effectiveRank===2, `rank ${d.effectiveRank}`);
    assert(d.singularValues[0] >= d.singularValues[1] && d.singularValues[2] < 1e-8, 'ordered singular values');
    assert(d.conditionEstimate===Infinity, 'rank-deficient condition estimate should be infinity');
  });

  test('linear step respects trust radius and exact forward accounting', () => {
    const P=root.CauchyPhysics, S=root.CauchySolver;
    const cfg=P.defaultPhysicsConfig(); cfg.noise=0; cfg.sensorRays=20; cfg.viewpointCount=1; cfg.bounceDepth=1;
    const target=P.forward(P.seededTruth(1),cfg).observation;
    const st=S.createState('Linear',P.initialGuess(),target,cfg,3);
    assert(st.forwardEvals===1, `initial evaluation count ${st.forwardEvals}`);
    st.trustRadius=0.02;
    S.step(st);
    assert(st.forwardEvals===26, `one 12-param central Jacobian plus trial should total 26 evals, got ${st.forwardEvals}`);
    assert(st.lastStepNorm <= 0.0200001, `step norm ${st.lastStepNorm}`);
  });

  test('render and app core APIs exist', () => {
    assert(root.CauchyRender && typeof root.CauchyRender.drawWorld==='function','render API');
    assert(root.CauchyAppCore && typeof root.CauchyAppCore.createExperiment==='function','app core API');
  });

  test('experiment solvers share initial proposal but never receive truth geometry', () => {
    const P=root.CauchyPhysics, A=root.CauchyAppCore;
    const cfg=P.defaultPhysicsConfig(); cfg.sensorRays=20; cfg.bounceDepth=1; cfg.viewpointCount=1; cfg.noise=0;
    const ex=A.createExperiment(1,cfg);
    const modes=['Blind','Linear','Hybrid'];
    const base=JSON.stringify(ex.solvers.Blind.bestTheta);
    for(const m of modes){
      assert(JSON.stringify(ex.solvers[m].bestTheta)===base, `${m} same initial proposal`);
      assert(!Object.prototype.hasOwnProperty.call(ex.solvers[m],'truth'), `${m} must not contain truth`);
      assert(ex.solvers[m].bestTheta !== ex.truth, `${m} must not alias truth`);
    }
  });

  test('reset and sensing-depth change rebuild observations and histories', () => {
    const P=root.CauchyPhysics, A=root.CauchyAppCore;
    const cfg=P.defaultPhysicsConfig(); cfg.sensorRays=20; cfg.bounceDepth=1; cfg.viewpointCount=1; cfg.noise=0;
    const ex=A.createExperiment(1,cfg);
    root.CauchySolver.step(ex.solvers.Blind);
    assert(ex.solvers.Blind.forwardEvals>1,'solver advanced');
    const before=Array.from(ex.targetObservation);
    A.resetSolvers(ex);
    assert(ex.solvers.Blind.forwardEvals===1,'reset accounting');
    A.updatePhysics(ex,{bounceDepth:4});
    const after=Array.from(ex.targetObservation);
    assert(after.length===before.length,'same sensor dimensions');
    let diff=0;for(let i=0;i<before.length;i++)diff=Math.max(diff,Math.abs(before[i]-after[i]));
    assert(diff>1e-8,'bounce depth must alter observation');
    assert(ex.solvers.Linear.history.length===1 && ex.solvers.Hybrid.history.length===1,'histories reset');
  });

  test('seeded end-to-end solvers improve observation fit within bounded cost', () => {
    const P=root.CauchyPhysics, A=root.CauchyAppCore, S=root.CauchySolver;
    const cfg=P.defaultPhysicsConfig(); cfg.sensorRays=16; cfg.viewpointCount=1; cfg.bounceDepth=2; cfg.noise=0;
    const ex=A.createExperiment(1,cfg);
    for(const m of A.MODES){
      const st=ex.solvers[m], initial=st.bestMSE;
      while(st.forwardEvals<150) S.step(st);
      assert(st.bestMSE<initial, `${m} should improve: ${initial} -> ${st.bestMSE}`);
    }
  });

  test('rank loss is reported as non-identifiable even with a good observation fit', () => {
    const P=root.CauchyPhysics, A=root.CauchyAppCore;
    assert(typeof A.identifiabilityStatus==='function','identifiabilityStatus API');
    const truth=P.seededTruth(1);
    const state={bestTheta:P.cloneTheta(truth),bestMSE:1e-10,effectiveRank:11};
    const s=A.identifiabilityStatus(state,truth,1e-2);
    assert(s.code==='NOT_IDENTIFIABLE', `status ${s.code}`);
  });

  function run(opts={}){
    const log = opts.log || (()=>{}); let passed=0; const failures=[];
    for(const t of tests){
      try{ t.fn(); passed++; log(`PASS ${t.name}`); }
      catch(e){ failures.push({name:t.name,error:e}); log(`FAIL ${t.name}: ${e.message}`); }
    }
    log(`${passed}/${tests.length} passed`);
    return {ok: failures.length===0, passed, total:tests.length, failures};
  }
  root.CauchyTests={test,assert,run};
})(typeof globalThis!=='undefined'?globalThis:window);
