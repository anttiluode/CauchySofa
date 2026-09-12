# CauchySofa

**Can an observer trapped inside a contracting reflective moon reconstruct geometry outside it, if the propagation law is known exactly?**

CauchySofa is a browser-only inverse-problem demo. It hides three exterior circular scatterers from the solver, generates the light field they produce at sensors inside a circular "moon," and then asks three algorithms to reconstruct the outside:

- **Blind** — bounded stochastic mutations; keep a proposal only when the interior observation fits better.
- **Linear** — experimentally perturb the current proposed world, measure how the interior field changes, fit a local Jacobian, then solve a damped least-squares correction.
- **Hybrid** — blind exploratory proposals plus periodic local linear corrections.

The important separation is real in the code: solver state receives the target sensor vector and the known forward physics, **not the hidden truth geometry**. Geometry error is displayed only as an evaluation meter.

## Run it

There is no build step and no server dependency. Open `index.html` directly or serve the repository root with any static server / GitHub Pages.

For deterministic tests, open `tests/test.html`. If Node is available, the same tests can be run with:

```bash
node tests/node_harness.js
```

The reproducible benchmark is:

```bash
node tests/benchmark.js
```

## What the page shows

The top row is deliberately literal:

**TRUE OUTSIDE** → visible only to the human viewer.

**WHAT THE MOON SEES** → the actual numeric sensor strip given to the solver.

**RECONSTRUCTED OUTSIDE** → the solver's current exterior proposal.

The plots below compare observation error against **forward-model evaluations**, not iterations, because one linear Jacobian costs 24 finite-difference physics calls while one blind mutation costs one.

The singular-value plot is the second half of the experiment. A low observation error is not automatically a recovered world. If the local Jacobian loses directions, the page reports:

> **OBSERVATION FIT GOOD / GEOMETRY NOT IDENTIFIABLE**

rather than pretending that an inverse with missing information is unique.

## Forward model

This is intentionally a tractable 2-D toy, not Maxwell optics.

A sensor ray starts at a known viewpoint inside a unit circular moon. At each bounce it:

1. intersects the moon boundary,
2. leaks a known fraction of its energy outward,
3. queries the three hidden exterior circles with a smooth ray/circle intersection response,
4. receives a reflectivity- and path-length-weighted return,
5. reflects the remaining ray back into the moon,
6. contracts/attenuates the remaining energy,
7. accumulates progressively blurred information as bounce depth increases.

The hidden world has 12 continuous unknowns: angle, distance, radius, and reflectivity for each of three objects.

The inverse loop is therefore

```text
guess exterior geometry
        ↓
known forward physics F(theta)
        ↓
compare to interior observation
        ↓
residual
        ↓
measure local response J = dF/dtheta
        ↓
damped / trust-region correction
```

No neural network is involved.

## Seeded Gate-0 result

The default deterministic world uses seed 1, two interior viewpoints, zero measurement noise, and 64 sensor rays per viewpoint. At equal ~1200-forward-evaluation budgets:

| contraction depth | solver | observation MSE | normalized geometry error | Jacobian rank |
| ---: | --- | ---: | ---: | ---: |
| 1 | Blind | 3.69e-4 | 0.157 | — |
| 1 | Linear | 5.51e-3 | 0.285 | 12/12 |
| 2 | Blind | 6.75e-4 | 0.153 | — |
| 2 | Linear | **1.64e-10** | **4.83e-6** | 12/12 |
| 2 | Hybrid | 1.27e-9 | 1.34e-5 | 12/12 |
| 4 | Linear | **1.13e-19** | **1.31e-9** | 12/12 |
| 8 | Linear | 3.13e-8 | **0.0814** | **11/12** |
| 8 | Hybrid | 3.13e-8 | **0.0814** | **11/12** |

At depth 2, an observation-MSE target of `1e-4` was reached by Linear after **451** forward evaluations and Hybrid after **505**. Blind search had **not** reached it after **5000** evaluations (`2.92e-4`).

That is the positive result this demo was built to test: locally learning the response operator can turn search exhaust into a useful inverse instrument.

There are also two useful negative/limiting results.

First, at **depth 1** the sharp direct sensing map is sufficiently nonlinear that the local linear solver is worse than Blind at the fixed budget. Moderate smoothing/contraction happens to make the local response much easier to exploit in this toy; linearization is not magic.

Second, at **depth 8** Linear can match the interior observation extremely well while the recovered geometry remains noticeably wrong and the measured Jacobian drops to rank 11/12. That is exactly the distinction the Cauchy question requires: **fitting what can be seen is not the same as uniquely knowing what is outside.**

## Relationship to AnttisBrain2

AnttisBrain2's recursive mirror renderer motivated the experiment: repeated boundary events attenuate and spatially contract information until a finite observation horizon is reached. CauchySofa does **not** copy the full AnttisBrain2 shader. It isolates the inverse question in a small deterministic system where truth, observation, null directions, and compute cost can all be measured directly.

A natural Gate 1 is active sensing: instead of accepting fixed interior viewpoints, use the current Jacobian null space to choose the next viewpoint/probe that should reveal the most currently invisible geometry.

## Honesty ledger

This demo does **not** claim:

- full electromagnetic or acoustic wave physics,
- recovery of information that never reaches the sensors,
- a way around Cauchy instability, diffraction limits, or non-uniqueness,
- that local linearization always beats blind search,
- that the 2-D toy is already a physical reconstruction instrument.

It does test a narrower and useful mechanism: when the forward law is stable and available, a search process can propose worlds while a second, linear system-identification layer learns which changes in those worlds explain the measured residual.
