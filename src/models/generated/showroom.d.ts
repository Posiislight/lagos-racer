// Types for the generated showroom module (see scripts/sync-models.mjs).
import type { Group, Material, Texture, Mesh, BufferGeometry, Object3D } from 'three';

type Vec = [number, number, number];
export function buildOkada(body?: string): Group;
export function buildKeke(bodyColor?: string): Group;
export function buildDanfo(bodyColor?: string): Group;
export function buildBRT(lowerColor: string, number: string): Group;
export function person(o?: Record<string, unknown>): Group;
/** Moshood or Mama Put, ready to seat; `seat` carries pose options the vehicle owns (hands, ankle, pose, wave...). Throws for an unknown id. */
export function driverFigure(id: string, seat?: Record<string, unknown>): Group;
export function fixedChild(parent: Object3D, child: Object3D, x: number, y: number, z: number, ry?: number, lean?: number): Group;
export function mat(color: string, opts?: Record<string, unknown>): Material;
export function paint(color: string): Material;
export function glow(color: string, intensity?: number): Material;
export const MAT: Record<string, Material>;
export function ctex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: number): Texture;
export function textTex(text: string, o?: Record<string, unknown>): Texture;
export function plateTex(num: string): Texture;
export function raceNumberTex(num: string, o?: Record<string, unknown>): Texture;
export function speedTex(text: string, o?: Record<string, unknown>): Texture;
export function checkerTex(cols?: number, rows?: number, a?: string, b?: string): Texture;
export const ANKARA: Material, ANKARA2: Material, PLAID: Material, GELE: Material;
export const rustTex: Texture;
export function mesh(geo: BufferGeometry, m: Material, x?: number, y?: number, z?: number): Mesh;
export function rbox(w: number, h: number, d: number, r: number, m: Material, x?: number, y?: number, z?: number): Mesh;
export function rbGeo(w: number, h: number, d: number, r: number): BufferGeometry;
export function sph(r: number, m: Material, x?: number, y?: number, z?: number, seg?: number): Mesh;
export function cylm(rt: number, rb: number, h: number, m: Material, seg?: number): Mesh;
export function rod(a: Vec, b: Vec, r: number, m: Material, seg?: number): Mesh;
export function limb(a: Vec, b: Vec, r: number, m: Material): Mesh;
export function decal(w: number, h: number, tex: Texture, x: number, y: number, z: number, ry?: number, rz?: number, emissive?: boolean): Mesh;
export const FACE: { px: number; nx: number; pz: number; nz: number };
export function sportWheel(r: number, w: number, rimColor?: string, o?: Record<string, unknown>): Group;
export function carWheel(r: number, w: number, rimColor: string): Group;
export function spokedWheel(r: number): Group;
