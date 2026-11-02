/**
 * Locked public types for @ttrpg-engine/spatial.
 *
 * Conventions:
 * - Everything is 3D (`Vec3`, f64). 2D consumers keep `z = 0` (see `vec2`, `lockZ`).
 * - Z is "up". Walls are vertical: a segment in XY extruded between `bottom` and `top`.
 * - Units are whatever the consumer uses (feet, metres, pixels); the engine is unitless.
 *
 * Determinism contract (TS reference ⇄ Rust/wasm): only `+ - * /` and `Math.sqrt`
 * (IEEE-754 correctly rounded) are used on the numeric path, never transcendental
 * functions, so both implementations can be bit-identical. That is why cones take
 * `spread` (tangent of the half-angle) instead of an angle.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Points along the ray are `origin + dir * t` for `t >= 0`. `dir` need not be unit length. */
export interface Ray {
  readonly origin: Vec3;
  readonly dir: Vec3;
}

/** A true globe (a 20-ft fireball is a sphere, not a circle). */
export interface Sphere {
  readonly kind: "sphere";
  readonly center: Vec3;
  readonly radius: number;
}

/**
 * A finite right-circular cone. `axis` points from the apex to the centre of the
 * base and its length is the cone's length. `spread` is tan(half-angle): the base
 * radius equals `length * spread` (a 5e cone, as wide as it is long, has spread 0.5).
 */
export interface Cone {
  readonly kind: "cone";
  readonly apex: Vec3;
  readonly axis: Vec3;
  readonly spread: number;
}

/** Axis-aligned box (a "cube" template, a token's bounding box, a pillar). */
export interface Cuboid {
  readonly kind: "cuboid";
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Infinite plane `normal · p = offset`. As a volume it is the half-space `normal · p <= offset`. */
export interface Plane {
  readonly kind: "plane";
  readonly normal: Vec3;
  readonly offset: number;
}

/** Zero-thickness vertical wall: segment a→b in XY (z ignored), spanning z ∈ [bottom, top]. */
export interface Wall {
  readonly kind: "wall";
  readonly a: Vec3;
  readonly b: Vec3;
  readonly bottom: number;
  readonly top: number;
}

export type Shape = Sphere | Cone | Cuboid | Plane | Wall;
/** Anything a ray or sight line can be blocked by. */
export type Obstacle = Sphere | Cuboid | Plane | Wall;
/** Shapes usable as area-of-effect templates. */
export type Area = Sphere | Cone | Cuboid;

export interface RayHit {
  /** Ray parameter of the hit (distance in units of `|dir|`). */
  readonly t: number;
  readonly point: Vec3;
  /** Unit surface normal, facing back toward the ray origin. */
  readonly normal: Vec3;
  /** Index of the obstacle in the input array. */
  readonly index: number;
}

export interface LosResult {
  readonly visible: boolean;
  /** The first blocking hit, when not visible. */
  readonly blocker?: RayHit;
}

/** A token for spatial queries: a sphere of `radius` around `position` (0 = a point). */
export interface Token {
  readonly id: string;
  readonly position: Vec3;
  readonly radius: number;
}

export interface SlideResult {
  readonly position: Vec3;
  readonly collided: boolean;
  /** Indices of walls touched, in contact order (may repeat). */
  readonly contacts: readonly number[];
}

export type MeasureMode = "euclidean" | "horizontal" | "vertical";

export interface SelectOptions {
  /** If given, a token must also be in line of sight of `origin` (cover blocks it). */
  readonly obstacles?: readonly Obstacle[];
  /** LoS origin; defaults to the area's centre (sphere/cuboid) or apex (cone). */
  readonly origin?: Vec3;
}

export interface SlideOptions {
  /** Token height for wall z-overlap; walls apply if they overlap [z, z + height]. Default 2·radius. */
  readonly height?: number;
  /** Max collision/slide iterations. Default 4. */
  readonly maxIterations?: number;
}

/**
 * A point light. Within `bright` of `position` it gives bright light, out to
 * `dim` dim light (a 5e torch: bright 20, dim 40). `dim >= bright >= 0`.
 */
export interface LightSource {
  readonly id: string;
  readonly position: Vec3;
  readonly bright: number;
  readonly dim: number;
}

export type LightLevel = "dark" | "dim" | "bright";

export interface IlluminationOptions {
  /** Light everywhere regardless of sources (daylight = "bright"). Default "dark". */
  readonly ambient?: LightLevel;
}

export interface Illumination {
  /** The brightest of `ambient` and every source that reaches the point. */
  readonly level: LightLevel;
  /** Sources that reach the point, in input order, with the level each gives. */
  readonly sources: readonly { readonly id: string; readonly level: LightLevel }[];
}

/**
 * A light's lit region in the horizontal plane at its height: a
 * counter-clockwise polygon (z = light height). Clip it with the `dim`
 * circle around `center` when drawing; `bright` marks the inner band.
 */
export interface LightBoundary {
  readonly id: string;
  readonly center: Vec3;
  readonly bright: number;
  readonly dim: number;
  readonly points: readonly Vec3[];
}

/**
 * The backend contract. The TS reference implements it today; the wasm core
 * (spatial-wasm slice) implements the same contract and must match bit for bit.
 */
export interface SpatialBackend {
  readonly id: string;
  raycast(ray: Ray, obstacles: readonly Obstacle[], maxT?: number): RayHit | null;
  raycastAll(ray: Ray, obstacles: readonly Obstacle[], maxT?: number): RayHit[];
  los(from: Vec3, to: Vec3, obstacles: readonly Obstacle[]): LosResult;
  containsPoint(shape: Shape, p: Vec3): boolean;
  intersectShape(a: Shape, b: Shape): boolean;
  slide(
    position: Vec3,
    move: Vec3,
    radius: number,
    walls: readonly Wall[],
    options?: SlideOptions,
  ): SlideResult;
  measure(a: Vec3, b: Vec3, mode?: MeasureMode): number;
  selectTargets(area: Area, tokens: readonly Token[], options?: SelectOptions): string[];
  illumination(
    p: Vec3,
    lights: readonly LightSource[],
    obstacles: readonly Obstacle[],
    options?: IlluminationOptions,
  ): Illumination;
  lightBoundary(light: LightSource, obstacles: readonly Obstacle[]): LightBoundary;
}
