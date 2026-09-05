# Physical approximation sources

These sources support a deliberately bounded, game-scale approximation; the implementation must not claim full Navier–Stokes, combustion chemistry, or radiative-transfer fidelity.

| Coupling | Authoritative source | Extracted constraint for the approximation |
|---|---|---|
| Shallow water | [USGS finite-volume shallow environmental flow](https://www.usgs.gov/publications/finite-volume-model-two-dimensional-shallow-environmental-flow) | A depth-integrated, unsteady shallow-water model can use finite-volume fluxes, explicit time marching, and mass-preserving wet/dry fronts. Use conservative cell-volume fluxes, bounded wet/dry handling, and stable substeps. |
| Water volume bookkeeping | [USGS FEQ conservation principles](https://cm.water.usgs.gov/proj/feq/feqdoc/chap1html/chap1_6.html) | With constant density, conservation of water mass is conservation of water volume; closed-domain changes must equal sources minus sinks. |
| Fire heat paths | [NIST Fire Dynamics](https://www.nist.gov/el/fire-research-division-73300/firegov-fire-service/fire-dynamics) | Fire heat reaches surroundings by convection, radiation, and conduction; radiation is electromagnetic and is a major visible/thermal cue. Use an emitted-power term with distance and shielding factors, plus local exchange/cooling. |
| Water suppression | [NIST Fire Fighting Properties, NISTIR 6191](https://www.nist.gov/publications/fire-fighting-properties-nistir-6191) | Water suppresses through fuel/flame cooling, oxygen displacement, and reduced radiation feedback; its high latent heat supports an evaporation sink. Model wetness/standing water as fire suppression and water temperature as transported heat. |
| Solar incidence | [NASA Earth Observatory energy budget](https://science.nasa.gov/earth/earth-observatory/climate-and-earths-energy-budget/) | Irradiance depends on the angle of incoming sunlight; low-angle light produces longer shadows and lower incident energy. Use sun elevation/azimuth, surface normal, and a terrain horizon occlusion factor. |
| Terrain shadows | [NASA shadow geometry example](https://science.nasa.gov/resource/shadows-near-the-moons-south-pole/) | Terrain relief can block low-angle sunlight over distant/deep areas; horizon-ray sampling is an appropriate visual/thermal approximation. |

Numerical scope: finite-volume/pipe-like shallow-water fluxes with damping; explicit fire energy deposition and fuel burn; water advection and heat exchange; latent-heat-limited evaporation; ambient cooling; and solar direct irradiance multiplied by slope and cached horizon visibility. These are numerical approximations for an interactive tablet world.
