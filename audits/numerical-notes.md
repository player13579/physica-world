# Nature engine numerical notes

The engine is a real-time landscape approximation in SI units. It does not claim to solve the full Navier–Stokes equations, detailed porous-media flow, or electromagnetic radiation.

## Water

Each sample column stores terrain elevation and water depth. Four-neighbor face discharges are persistent pipe/finite-volume fluxes. Gravity accelerates each face discharge from the free-surface head difference; exponential damping represents unresolved bed friction. Before applying transfers, all outgoing faces of each donor are scaled together so a substep cannot export more than 72% of that cell's water. This makes the interior update conservative and keeps depth nonnegative. The positive-z boundary is an open broad-crested-style outlet; its removed volume is recorded as `outflowVolume`.

Rain and the upstream spring add measured volumes and mix their source temperatures with existing water. The same accepted face volumes advect water temperature, so heat cannot move downstream through a decorative velocity field. `flowX` and `flowZ` are reconstructed from adjacent face discharges and local wetted cross-section.

## Sun and terrain shadow

The sun follows a fixed user-selected hour. Daylight elevation is a smooth 65-degree maximum arc. Local irradiance uses terrain-normal incidence, while a ray marched toward the sun compares terrain horizon slope against solar elevation. The irradiance field is cached by hour, sun power, and terrain revision; height brushes invalidate it.

## Fire and heat

Combustion rate is continuous fuel mass loss in kg/m2/s. It depends on fuel, temperature, moisture, standing-water suppression, and the current burning state. Chemical power is the measured consumed mass times 18 MJ/kg. A fraction heats the burning surface; a separate radiative fraction is deposited in nearby cells with inverse-square view factors. A midpoint terrain test reduces the view factor across an intervening ridge or rock barrier, and the summed view factor is capped to keep emitted radiation bounded.

Fire state follows the ignition response produced by temperature and dryness. No neighbor-count or random cellular-automaton ignition is used: a neighboring cell must receive enough energy to cross the thermal ignition range. Standing water also exchanges sensible heat with the ground and rapidly damps combustion.

Ground temperature integrates absorbed sunlight, deposited fire radiation, combustion heat, convection, long-wave radiation, and ground/water heat exchange. Water/ground exchange is capped at their two-capacity equilibrium so one explicit step cannot overshoot. Evaporation is limited by available water and an available surface-energy flux; its latent heat is removed from the coupled surface/water energy budget. Temperatures are capped only at broad physical/numerical safety limits after those fluxes are applied.

## Stability and bookkeeping

Public time steps are split into substeps no longer than 0.04 s. Arrays remain allocated for the world's lifetime. Cumulative burned mass, evaporation, spring inflow, boundary outflow, rain, and explicit brush water are recorded separately. A closed-source balance therefore compares current water plus evaporation and outflow with initial water (and, when used, adds measured rain, spring, and user water to the source side).

The tests cover closed mass accounting, downstream and diverted flow, dry and wet combustion, fuel loss, rain extinction, radiative neighbor heating, advective heat transport, horizon shadows, time-of-day irradiance, brush bounds/revisions, and a long mixed forcing run.

## Integration additions
Shared getSunState drives both light and irradiance. Burn-rate-weighted smoke and local lights, idempotent fire stamping with external ignition energy, and rasterized crown shadows are integrated. Canopy occlusion is revision-cached and updated when actual fuel/fire changes its effective size or opacity.
