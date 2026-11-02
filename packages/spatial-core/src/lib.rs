//! `ttrpg-engine-spatial-core` — WebAssembly spatial geometry core.
//!
//! Scaffold slice: the full geometry API (vectors, rays, volumetric shapes,
//! raycasting, line of sight) lands in the `spatial-wasm` slice, feature-identical
//! to the TypeScript reference implementation in `@ttrpg-engine/spatial`.
//! Determinism contract: bit-identical `f64` IEEE-754 results on every platform.

/// Adds two `f64` vectors componentwise.
///
/// Foreshadows the Vec3 core type; kept minimal in the scaffold.
pub fn vec3_add(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec3_add_works() {
        assert_eq!(vec3_add([1.0, 2.0, 3.0], [4.0, 5.0, 6.0]), [5.0, 7.0, 9.0]);
        assert_eq!(
            vec3_add([-1.0, 0.5, 0.0], [1.0, -0.5, 0.0]),
            [0.0, 0.0, 0.0]
        );
    }
}
