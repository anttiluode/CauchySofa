# Hidden-Geometry Cauchy Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only inverse-geometry demo where an observer inside a reflective/contracting moon reconstructs three genuinely hidden exterior scatterers from interior measurements using blind search, local linear system identification, or a hybrid of both.

**Architecture:** Keep truth generation, forward physics, solver state, and rendering separate. `src/physics.js` owns the deterministic map `F(theta) -> observation`; `src/solver.js` owns bounded search, finite-difference Jacobians, damped least squares, singular-value/rank diagnostics, and evaluation accounting; `src/render.js` owns canvas/chart drawing; `src/app.js` owns only seeded world creation, UI state, and experiment orchestration. No solver function may receive the hidden truth object; only the target observation and public physics/configuration are passed in.

**Tech Stack:** Static HTML5, Canvas 2D, plain JavaScript, no external runtime dependencies, browser-runnable deterministic tests.

**Spec:** `docs/superpowers/specs/2026-09-12-hidden-geometry-cauchy-design.md`

## Global Constraints

- Single static page; no server, framework, build step, WebGL, or neural network.
- Three hidden exterior circles, four continuous parameters each: angle, radial distance, radius, reflectivity.
- Forward physics is deterministic and shared by all solvers.
- Truth geometry is unavailable to solver code; parameter error is evaluation-only.
- Every call to the forward model is counted; solver comparisons use forward evaluations, not iterations.
- Finite-difference Jacobian uses central differences and bounded/wrapped parameters.
- Linear updates use damped least squares plus trust-region clipping/rejection.
- Hard cases must expose null-space/rank loss rather than pretending geometry is uniquely recovered.
- `index.html` must work directly as a static file/GitHub Pages page.

---

### Task 1: Deterministic forward physics and parameter model

**Files:**
- Create: `src/physics.js`
- Create: `tests/test.html`
- Create: `tests/test.js`

**Interfaces:**
- Produces `CauchyPhysics.PARAMS_PER_OBJECT`, `OBJECT_COUNT`, `defaultPhysicsConfig()`, `seededTruth(seed)`, `initialGuess()`, `cloneTheta(theta)`, `flattenTheta(theta)`, `unflattenTheta(vec)`, `canonicalizeTheta(theta)`, `parameterVectorDelta(a,b)`, `rayCircleSoftHit(origin, dir, circle, softness)`, `forward(theta, config)`, `mse(a,b)`, and `makeViewpoints(count, config)`.
- `forward` returns `{ observation: Float64Array, debug: { rays, contributions } }` and is the only geometry-to-measurement path used anywhere else.

- [ ] **Step 1: Write browser tests first**

In `tests/test.js`, define deterministic assertions that verify: ray/circle closest-approach geometry; angle wrapping and parameter clamping; `seededTruth(1)` is repeatable; `forward` is deterministic; perturbing one hidden object's angle changes the observation; and a clone of reconstruction state cannot mutate the truth object.

- [ ] **Step 2: Run the test page and confirm expected failures**

Open `tests/test.html` through a simple local static server or headless browser. Expected: tests fail because `CauchyPhysics` is not defined yet.

- [ ] **Step 3: Implement the parameterization**

Use exactly three object records `{ angle, distance, radius, reflectivity }`. Bounds are angle `[0,2pi)`, distance `[1.25,2.25]`, radius `[0.10,0.28]`, reflectivity `[0.25,1.0]`. Canonicalize object order by angle after every bounded update so label permutations do not create an avoidable optimization discontinuity.

- [ ] **Step 4: Implement the browser-safe forward model**

For each viewpoint and sensor ray, trace reflections inside the unit moon. At each boundary hit, use the outgoing incident direction to query hidden circles with a smooth ray/circle hit function based on closest approach. Return strength is `remaining * leak * reflectivity * softHit * distanceFalloff`; blur width increases with bounce index and the remaining interior energy contracts each bounce. Sum all bounce contributions into the sensor value. Add deterministic seeded Gaussian-like noise only when `config.noise > 0`, with the noise seed derived from configuration rather than global mutable RNG state.

- [ ] **Step 5: Run Task 1 tests**

Expected: all parameter, determinism, geometry-perturbation, and truth-separation tests pass.

- [ ] **Step 6: Commit Task 1**

Commit message: `feat: add deterministic hidden-geometry forward model`.

---

### Task 2: Blind, linear, and hybrid inverse solvers

**Files:**
- Create: `src/solver.js`
- Extend: `tests/test.js`

**Interfaces:**
- Consumes `CauchyPhysics.forward`, flatten/unflatten helpers, parameter bounds, and `mse`.
- Produces `CauchySolver.createState(mode, initialTheta, target, physicsConfig, seed)`, `step(state)`, `finiteDifferenceJacobian(theta,target,config,counter)`, `dampedLeastSquares(J,residual,lambda)`, `singularDiagnostics(J)`, and `bestSnapshot(state)`.
- Solver state contains `theta`, `bestTheta`, `bestMSE`, `forwardEvals`, `accepted`, `rejected`, `trustRadius`, `history`, `singularValues`, `effectiveRank`, `conditionEstimate`, and mode-specific RNG state. It never contains truth geometry.

- [ ] **Step 1: Add failing numerical tests**

Add tests that check Jacobian shape `[observationLength x 12]`, all entries finite, a small synthetic linear system is improved by damped least squares, singular diagnostics report rank 2 for a known rank-2 matrix, oversized trust-region proposals are clipped/rejected, and forward evaluation accounting increments exactly by each call to `forward`.

- [ ] **Step 2: Implement small-matrix linear algebra**

Implement `J^T J`, `J^T r`, Gaussian elimination with partial pivoting for the 12x12 damped normal equations, and a Jacobi eigenvalue routine for symmetric `J^T J`. Singular values are `sqrt(max(eigenvalue,0))`; effective rank uses `sigma > maxSigma * 1e-3`; condition estimate is `maxSigma/minRetainedSigma`, or infinity when rank deficient.

- [ ] **Step 3: Implement blind search**

Blind mode mutates the current best parameter vector with bounded Gaussian perturbations whose scale slowly adapts. It evaluates one candidate per step and accepts only lower observation MSE. RNG is deterministic from state seed.

- [ ] **Step 4: Implement linearized search**

Linear mode estimates the central-difference Jacobian around the best state, computes residual `target - F(theta)`, solves `(J^T J + lambda I) delta = J^T residual`, clips the normalized step to the trust radius, evaluates the trial, and accepts only if observation MSE improves. On rejection halve trust radius; on acceptance grow it modestly up to a cap.

- [ ] **Step 5: Implement hybrid search**

Hybrid alternates small blind exploratory proposals with local linear corrections. A new blind best triggers the next linearization. Forward evaluation counting remains shared and exact.

- [ ] **Step 6: Run Task 2 tests**

Expected: all numerical, rank, trust-region, and accounting tests pass.

- [ ] **Step 7: Commit Task 2**

Commit message: `feat: add blind and linear inverse solvers`.

---

### Task 3: Static visualization and experiment controls

**Files:**
- Create: `src/render.js`
- Create: `src/app.js`
- Create: `index.html`
- Extend: `tests/test.js`

**Interfaces:**
- `render.js` produces `drawWorld(canvas, theta, options)`, `drawSensor(canvas, observation, debug, options)`, `drawHistory(canvas, histories)`, and `drawSingularValues(canvas, values, rank)`.
- `app.js` owns `truth`, `targetObservation`, one solver state per mode, shared public physics config, and all DOM events. Only `app.js` may compute evaluation-only parameter error by comparing a solver snapshot with truth.

- [ ] **Step 1: Add the HTML shell**

Create three labeled main canvases: `TRUE OUTSIDE`, `WHAT THE MOON SEES`, `RECONSTRUCTED OUTSIDE`. Add Run/Pause, Step, Reset, New Hidden World, solver selector, bounce-depth selector `{1,2,4,8}`, noise control, viewpoint selector `{1,2,4}`, and live metrics for observation MSE, evaluation-only geometry error, forward evaluations, best blind MSE, current linear/hybrid MSE, rank, condition estimate, accepted/rejected counts.

- [ ] **Step 2: Implement rendering**

Truth/reconstruction panels show the unit moon, interior viewpoints, and exterior circles. The sensor panel shows the numeric observation as an intensity strip plus a compact polar-ray sketch. Add a history chart whose horizontal axis is forward evaluations and a singular-value bar chart.

- [ ] **Step 3: Wire solver orchestration**

On a new hidden world, generate truth, deep-clone only public configuration, compute `targetObservation = forward(truth, config).observation`, then initialize solvers from the same `initialGuess`. Never pass `truth` into solver constructors. Run animation in small batches through `requestAnimationFrame` so the page remains responsive.

- [ ] **Step 4: Add identifiability messaging**

When observation MSE is small but effective rank is below 10 or evaluation-only geometry error remains high, display `OBSERVATION FIT GOOD / GEOMETRY NOT IDENTIFIABLE`. When both fit and geometry are good, display `GEOMETRY RECOVERED`. Otherwise display `SEARCHING`.

- [ ] **Step 5: Add UI-state tests**

Test that reset returns all modes to the identical initial proposal, changing bounce depth recomputes the target observation and resets solver histories, and solver state JSON does not contain any truth object or truth coordinates.

- [ ] **Step 6: Run browser tests**

Expected: deterministic test page passes all assertions.

- [ ] **Step 7: Commit Task 3**

Commit message: `feat: add static Cauchy inverse demo`.

---

### Task 4: Seeded benchmark, honesty checks, and documentation

**Files:**
- Create: `README.md`
- Extend: `tests/test.js`
- Modify as measurement requires: `src/physics.js`, `src/solver.js`, `src/app.js`

**Interfaces:**
- No new public runtime interfaces required.

- [ ] **Step 1: Add seeded end-to-end tests**

For the default noiseless world, run each solver under a fixed forward-evaluation budget. Assert only that every solver improves over its initial observation MSE and that all three use identical target observations. Do not assert Linear beats Blind until measured data supports it.

- [ ] **Step 2: Measure the seeded case**

Record, for Blind/Linear/Hybrid, initial MSE, best MSE at equal forward-evaluation budgets, effective rank, geometry error, and accepted/rejected counts for bounce depths 1 and 8.

- [ ] **Step 3: Tune only numerical stability, not the truth**

If linear steps are unstable, adjust damping, finite-difference scale, trust radius, or smooth-hit softness. Do not change the hidden truth merely to make Linear win. If Linear/Hybrid does not beat Blind, preserve that negative result in the README and UI.

- [ ] **Step 4: Verify the information-horizon behavior**

Confirm at least one harder preset exhibits lower effective rank or worse geometry identifiability than the easy preset. If the selected physics does not produce this, document the negative result rather than fabricating rank loss; the next experiment can change the sensing protocol.

- [ ] **Step 5: Write README**

Explain the question, the exact toy physics, what is hidden, solver comparison, measured seeded results, how to run through GitHub Pages or any static server, and explicit non-claims: not Maxwell optics, not a proof of Cauchy inversion beyond noise limits, not AI, and not direct AnttisBrain2 integration yet.

- [ ] **Step 6: Final verification**

Run all browser tests and a headless/static-page smoke test if a browser runtime is available. Open the page once visually and confirm the three canvases, controls, charts, and status message update while running.

- [ ] **Step 7: Commit Task 4**

Commit message: `docs: verify hidden-geometry Cauchy demo`.
