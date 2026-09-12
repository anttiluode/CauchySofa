# Hidden-Geometry Cauchy Inverse Demo — Design

## Purpose

Build a pure static HTML/JavaScript experiment that asks a stricter question than the earlier texture-recovery toy:

> If an observer is confined to the inside of a contracting reflective "moon", knows the propagation law exactly, and sees only the interior light field, how much hidden exterior geometry can it reconstruct?

The hidden geometry is genuinely unavailable to the reconstructor. The page must therefore separate truth, observation, and reconstruction.

## Core claim to test

The forward map from exterior geometry parameters to interior observations is stable to evaluate but generally hard to invert directly. We will solve the inverse problem by repeatedly proposing exterior worlds, simulating them forward, measuring residual error against the hidden observation, and fitting a local linear response operator around the current proposal.

The linear layer is not the renderer and does not know the true geometry. It only sees controlled perturbations and resulting changes in interior observations.

## Mathematical object

Let `theta` be a finite-dimensional parameter vector describing hidden exterior objects. Let

`y = F(theta)`

be the known forward physics that maps exterior geometry to the interior sensor strip.

At iteration `k` we have a proposal `theta_k` and residual

`r_k = y_target - F(theta_k)`.

Using small controlled perturbations `dtheta_j`, estimate a local Jacobian

`J_k[:, j] ~= (F(theta_k + dtheta_j) - F(theta_k - dtheta_j)) / (2 * eps)`.

Compute a damped least-squares step

`delta = argmin ||J_k delta - r_k||^2 + lambda ||delta||^2`

then update with trust-region clipping so the local linear model is never treated as globally exact.

A blind-search baseline must run on the same hidden target and same forward model. The demo compares:
1. blind random/evolutionary proposals,
2. linearized residual-guided proposals,
3. optional hybrid proposals where blind search supplies exploratory candidates and the linear layer supplies local corrections.

## Hidden exterior geometry

Keep Gate 0 intentionally small and identifiable.

The exterior contains three hidden circular scatterers around the moon. Each object has:
- polar angle,
- radial distance from the moon boundary,
- radius,
- reflectivity.

That gives 12 unknown continuous parameters.

Bounds prevent degenerate cases and keep objects outside the moon:
- angle: `[0, 2*pi)`
- radial distance: `[1.25, 2.25] * moonRadius`
- object radius: `[0.10, 0.28] * moonRadius`
- reflectivity: `[0.25, 1.0]`

Truth is generated from a fixed seeded configuration by default, with a "New hidden world" button to randomize it.

## Forward physics

Use a deliberately simplified 2D ray model suitable for a browser and visually related to AnttisBrain2's boundary recursion.

The interior observer sits at one or more positions inside a circular moon. A fan of rays is cast from each observer position.

For each ray and bounce:
1. intersect the moon boundary,
2. leak a known fraction of energy outward,
3. continue the leaked ray into the exterior,
4. test intersection with hidden circular scatterers,
5. if a scatterer is hit, return a contribution based on reflectivity, path length, and angular blur,
6. reflect the remaining interior energy and continue to the next bounce,
7. multiply remaining energy by the known contraction/attenuation factor.

The result is a one-dimensional sensor strip per interior viewpoint. Multiple viewpoints can be concatenated into one observation vector.

The model is not intended to claim full Maxwell optics. It is an honest inverse-problem toy with known deterministic forward physics and a contraction horizon.

## What is hidden from the solver

The solver receives only:
- the propagation law,
- moon radius,
- sensor positions and ray directions,
- allowed parameter bounds,
- `y_target`, the observed interior strip.

The solver must never read the truth object array, draw-state truth coordinates, or any target-side geometry helper.

Truth generation and reconstruction state must be separate JavaScript objects with no shared references.

## Static-page UI

Single `index.html`, no server and no build step.

The page should show three main canvases side by side:

### TRUE OUTSIDE
Draw the moon plus the three hidden exterior scatterers. This panel is for the human viewer only.

### WHAT THE MOON SEES
Show the interior observation as a bright sensor strip and a polar/ray visualization around the interior observer. The reconstructor receives exactly the numeric strip represented here.

### RECONSTRUCTED OUTSIDE
Draw the current proposed exterior objects, with residual magnitude and iteration number.

Below the canvases:
- Run / Pause
- Step once
- Reset reconstruction
- New hidden world
- solver mode selector: `Blind`, `Linear`, `Hybrid`
- bounce-depth slider
- noise slider
- number-of-viewpoints selector

Live meters:
- observation MSE,
- parameter error (for evaluation only; never fed to solver),
- best blind-search MSE,
- current linearized MSE,
- Jacobian condition estimate,
- effective rank of the Jacobian,
- accepted/rejected update count.

A small plot should show observation MSE versus forward-model evaluations. This is the fairest cost axis for comparing blind versus linear methods.

## Baselines and fairness

Blind mode:
- maintain a small population around the best-so-far proposal,
- use bounded Gaussian mutation,
- accept any candidate that improves target MSE,
- count every call to `F(theta)` as one forward evaluation.

Linear mode:
- estimate the finite-difference Jacobian from the current best proposal,
- solve damped least squares,
- evaluate the proposed update,
- if it fails, shrink the trust radius and retry,
- count every finite-difference and trial call to `F(theta)`.

Hybrid mode:
- perform occasional blind exploratory mutations,
- whenever a new best is found, run one local linearization/correction pass.

The chart must compare methods by total forward evaluations, not iteration count.

## Information-horizon experiment

The demo must make failure informative.

Provide presets for bounce depths `1, 2, 4, 8`. As contraction/blur increases, the Jacobian should lose singular directions. The UI should expose:
- effective numerical rank,
- singular-value bars,
- whether geometry reconstruction remains unique enough to recover.

If multiple geometries produce nearly identical interior observations, the page should say "OBSERVATION FIT GOOD / GEOMETRY NOT IDENTIFIABLE" rather than pretending recovery succeeded.

## Success criteria

Gate 0 succeeds if, for the seeded default world with noise = 0:

1. the forward simulator produces a nontrivial interior observation that visibly changes when hidden geometry changes;
2. Blind, Linear, and Hybrid all use the exact same forward model and target observation;
3. Linear or Hybrid reaches a target observation MSE threshold with substantially fewer forward evaluations than Blind on the seeded case;
4. the reconstructed geometry is visually close to truth in at least one identifiable low-bounce preset;
5. at a harder contraction preset, the UI can demonstrate the opposite case: low observation error while one or more geometry directions remain poorly identifiable;
6. all of this runs by opening `index.html` directly or through GitHub Pages.

If criterion 3 does not hold, keep the negative result visible rather than tuning the benchmark until it does.

## File layout

- `index.html` — complete static demo, UI, canvases, controls.
- `src/physics.js` — deterministic forward model and geometry/ray helpers.
- `src/solver.js` — blind search, finite-difference Jacobian, damped least squares, trust-region update.
- `src/render.js` — canvas drawing and chart helpers; no access to solver internals beyond state passed in.
- `src/app.js` — seeded truth creation, UI wiring, experiment loop, metrics.
- `tests/test.html` — browser-runnable deterministic assertions with a visible pass/fail summary.
- `README.md` — what the demo tests, how to run it, honesty notes, and screenshots/result summary after verification.

No external JavaScript libraries are required for Gate 0.

## Testing

Deterministic tests must cover:
- circle/ray intersections,
- parameter clamping/wrapping,
- forward-model determinism for a fixed seed,
- target observation changes under a known geometry perturbation,
- finite-difference Jacobian dimensions and finite entries,
- damped least-squares solver reduces a synthetic linear residual,
- trust-region rejection on a deliberately oversized nonlinear step,
- truth object cannot be mutated through reconstruction state,
- forward-evaluation accounting is exact.

A final seeded end-to-end test should run a bounded number of evaluations and assert that the solver improves observation MSE over its initial proposal. It should not hard-code a claim that Linear always beats Blind until the measured result supports that claim.

## Non-goals for Gate 0

- no neural network,
- no WebGL requirement,
- no attempt to model full electromagnetic wave propagation,
- no claim of beating a Cauchy uniqueness theorem or diffraction limit,
- no arbitrary textured exterior,
- no 3D AnttisBrain2 integration yet,
- no active choice of the next sensor viewpoint yet.

If Gate 0 is sound, Gate 1 can add active sensing: choose the next interior viewpoint or probe that maximizes expected information gain in the current Jacobian null space.
