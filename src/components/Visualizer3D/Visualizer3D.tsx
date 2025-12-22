import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
  Suspense,
} from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import LEDStrip from "./LEDStrip";
import type { FixtureVisualConfig } from "../ModelLayoutEditor/modelTypes";
import type { Fixture } from "../ModelLayoutEditor/modelTypes";
import * as ModelTypes from "../ModelLayoutEditor/modelTypes";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";

type Visualizer3DProps = {
  config: FixtureVisualConfig[];
  fixtures: Fixture[];
  pixelColors?: Map<string, string[]>;
  onCameraResetRequest?: number; // Increment this to trigger reset
  showHeliReference?: boolean;
  heliReferenceMode?: "edges" | "mesh";
};

function HelicopterReferenceModel({
  show,
  mode,
  onCanopyMeshes,
}: {
  show: boolean;
  mode: "edges" | "mesh";
  onCanopyMeshes?: (meshes: THREE.Mesh[]) => void;
}) {
  if (!show) return null;

  const groupRef = useRef<THREE.Group | null>(null);

  // Files are served from Vite's `public/` directory.
  //   public/UI_Helicopter_Model_EditedStitched.obj
  //   public/UI_Helicopter_Model_EditedStitched.mtl
  const mtl = useLoader(
    MTLLoader,
    "/UI_Helicopter_Model_EditedStitched.mtl"
  ) as any;
  const obj = useLoader(
    OBJLoader,
    "/UI_Helicopter_Model_EditedStitched.obj",
    (loader) => {
      const l: any = loader;
      mtl?.preload?.();
      l?.setMaterials?.(mtl);
    }
  ) as THREE.Group;

  // OBJ export appears to be centimeters; scale to meters.
  const rootScale = 0.01;

  const lineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x777777,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
      }),
    []
  );

  const meshMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x777777,
        transparent: true,
        opacity: 0.16,
        depthTest: false,
      }),
    []
  );

  // Slightly stronger opacity for long smooth parts (e.g., tail boom) so they are visible in edges mode.
  const boomMeshMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x777777,
        transparent: true,
        opacity: 0.16,
        depthTest: false,
      }),
    []
  );

  // Center the imported model around the origin so camera + grid views are stable.
  const centeredObj = useMemo(() => {
    const clone = obj.clone(true);

    // Compute bounds of all geometry in the clone
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Recentre: move model so its geometric center is at (0,0,0)
    clone.position.sub(center);

    return clone;
  }, [obj]);

  const edgesGroup = useMemo(() => {
    const g = new THREE.Group();

    // Ensure world matrices are up to date so we can copy full transforms
    centeredObj.updateMatrixWorld(true);

    centeredObj.traverse((child: THREE.Object3D) => {
      // Only operate on meshes
      if (!(child as any).isMesh) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) return;

      // CAD-style feature edges. Lower angle = more edges.
      const edges = new THREE.EdgesGeometry(mesh.geometry, 22);
      const ls = new THREE.LineSegments(edges, lineMat);

      // Copy full transform (including any parent/root offsets)
      ls.matrixAutoUpdate = false;
      ls.matrix.copy(mesh.matrixWorld);

      // If this mesh is long/smooth (boom-like), EdgesGeometry may only show end caps.
      // In that case, render a very faint mesh silhouette to make the part visible.
      // Heuristic: high aspect ratio + low edge vertex count.
      const bb = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      bb.getSize(size);
      const longest = Math.max(size.x, size.y, size.z);
      const shortest = Math.max(1e-6, Math.min(size.x, size.y, size.z));
      const aspect = longest / shortest;
      const edgeVerts = edges.getAttribute("position")?.count ?? 0;

      // Heuristic tuned to reliably catch the tail boom from this OBJ export.
      if (aspect > 4 && edgeVerts < 2000) {
        const faint = new THREE.Mesh(mesh.geometry, boomMeshMat);
        faint.matrixAutoUpdate = false;
        faint.matrix.copy(mesh.matrixWorld);
        faint.renderOrder = 9;
        (faint.material as THREE.MeshBasicMaterial).depthTest = false;
        g.add(faint);
      }

      // Preserve names for later manual mapping (Body1, Body2, ...)
      ls.name = mesh.name || (mesh.parent ? mesh.parent.name : "");

      ls.renderOrder = 10;
      (ls.material as THREE.LineBasicMaterial).depthTest = false;

      g.add(ls);
    });

    return g;
  }, [centeredObj, lineMat, boomMeshMat]);

  const meshGroup = useMemo(() => {
    const clone = centeredObj.clone(true);
    clone.traverse((child: THREE.Object3D) => {
      if (!(child as any).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.material = meshMat;
      mesh.renderOrder = 9;
      (mesh.material as THREE.MeshBasicMaterial).depthTest = false;
    });
    return clone;
  }, [centeredObj, meshMat]);

  // Hidden mesh clone used for raycasting even in edges mode.
  const raycastMeshGroup = useMemo(() => {
    const clone = centeredObj.clone(true);
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      depthTest: false,
    });
    (rayMat as any).depthWrite = false;

    clone.traverse((child: THREE.Object3D) => {
      if (!(child as any).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.material = rayMat;
    });

    return clone;
  }, [centeredObj]);

  // Report canopy meshes (Body97) for surface-wrapping fixtures.
  useEffect(() => {
    if (!onCanopyMeshes) return;
    if (!groupRef.current) return;

    groupRef.current.updateMatrixWorld(true);

    const meshes: THREE.Mesh[] = [];
    groupRef.current.traverse((child: THREE.Object3D) => {
      if (!(child as any).isMesh) return;
      const m = child as THREE.Mesh;
      if ((m.name || "") === "Body97") meshes.push(m);
    });

    onCanopyMeshes(meshes);
  }, [onCanopyMeshes, raycastMeshGroup, mode]);

  const handleHeliPick = useCallback((e: any) => {
    // Prevent interference with other scene interactions
    e.stopPropagation?.();

    const obj: THREE.Object3D | undefined = e.object;

    const name = obj?.name || "(unnamed)";
    const parentName = obj?.parent?.name || "";

    const p: THREE.Vector3 | undefined = e.point;
    const point = p ? [p.x, p.y, p.z] : null;

    let normal: number[] | null = null;
    if (e.face?.normal && obj) {
      const n = e.face.normal.clone().transformDirection(obj.matrixWorld);
      normal = [n.x, n.y, n.z];
    }

    const zone = ModelTypes.bodyNameToZone(name);

    console.log("[HELI PICK]", {
      name,
      parentName,
      zone,
      point,
      normal,
    });
  }, []);

  return (
    <group
      ref={groupRef}
      scale={[rootScale, rootScale, rootScale]}
      renderOrder={10}
      onPointerDown={handleHeliPick}
    >
      {/* Always include an invisible mesh copy for raycasting/wrapping */}
      <primitive object={raycastMeshGroup} />

      {/* Visible representation */}
      {mode === "edges" ? (
        <primitive object={edgesGroup} />
      ) : (
        <primitive object={meshGroup} />
      )}
    </group>
  );
}

function buildCanopyOverridePositions(args: {
  fixture: Fixture;
  visualConfig: FixtureVisualConfig;
  attachment: Extract<ModelTypes.Attachment, { kind: "surface" }>;
  canopyMeshes: THREE.Mesh[];
}): Float32Array {
  const { fixture, visualConfig, attachment, canopyMeshes } = args;

  const ledSpec =
    ModelTypes.LED_TYPES[fixture.ledType] || ModelTypes.LED_TYPES.SK9822;
  const spacingM = (fixture.customSpacing ?? ledSpec.pixelSpacing) / 1000;

  const pixelCount = fixture.pixelCount || 0;
  const out = new Float32Array(pixelCount * 3);
  if (pixelCount <= 0 || canopyMeshes.length === 0) return out;

  canopyMeshes.forEach((m) => m.updateMatrixWorld(true));

  // World-space bounds of the canopy meshes
  const box = new THREE.Box3();
  canopyMeshes.forEach((m) => box.union(new THREE.Box3().setFromObject(m)));

  const size = new THREE.Vector3();
  box.getSize(size);

  // IMPORTANT: For this project we treat the helicopter model as having a stable world frame.
  // This avoids “axis inference” flipping on slightly different canopy bounds.
  //
  // World frame convention (matches our UI triad / earlier pick data):
  //   +X = lateral (left/right)
  //   +Y = up/down (approx canopy normal)
  //   +Z = longitudinal (nose/tail; tail boom direction)
  //
  // Therefore:
  //   U (0..1) maps along +Z (longitudinal)
  //   V (0..1) maps along +X (lateral)
  const longIdx: 0 | 1 | 2 = 2;   // Z
  const latIdx: 0 | 1 | 2 = 0;    // X
  const normalIdx: 0 | 1 | 2 = 1; // Y

  const longMin = box.min.getComponent(longIdx);
  const longMax = box.max.getComponent(longIdx);
  const latMin = box.min.getComponent(latIdx);
  const latMax = box.max.getComponent(latIdx);
  const normMin = box.min.getComponent(normalIdx);
  const normMax = box.max.getComponent(normalIdx);

  const longRange = Math.max(1e-6, longMax - longMin);
  const latRange = Math.max(1e-6, latMax - latMin);
  const normRange = Math.max(1e-6, normMax - normMin);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  // Default canopy anchor: use the most recent known canopy nose pick point so initial
  // placement is close without relying on fragile Y-bias + reprojection.
  // Latest pick point you logged:
  //   point: [0.0011080822033865446, -0.014358431426282793, -0.6756741695032741]
  const DEFAULT_CANOPY_NOSE_WORLD = new THREE.Vector3(
    0.0011080822033865446,
    -0.014358431426282793,
    -0.6756741695032741
  );

  const defaultU = clamp01(
    (DEFAULT_CANOPY_NOSE_WORLD.getComponent(longIdx) - longMin) / longRange
  );
  const defaultV = clamp01(
    (DEFAULT_CANOPY_NOSE_WORLD.getComponent(latIdx) - latMin) / latRange
  );

  const centerU = clamp01(attachment.centerU ?? defaultU);
  const centerV = clamp01(attachment.centerV ?? defaultV);

  const centerLong = longMin + centerU * longRange;
  const centerLat = latMin + centerV * latRange;

  const tangentialOffsetM = (attachment.tangentialOffsetMm ?? 0) / 1000;
  const lateralOffsetM = (attachment.lateralOffsetMm ?? 0) / 1000;
  const normalOffsetM = (attachment.normalOffsetMm ?? 0) / 1000;

  // Angle rotates the strip direction within the (long,lat) plane.
  // Convention: angleDeg=0 => +Z (longitudinal), angleDeg=90 => +X (lateral).
  //
  // Default canopy attachment: rotate the strip 90° from the prior baseline so
  // the default placement matches the expected orientation when switching
  // "Attach to Surface: Canopy" on.
  const angleDeg = (attachment.angleDeg ?? 0) + 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);

  // Canonical world axes for this project:
  //   +X = lateral (left/right)
  //   +Y = up/down
  //   +Z = longitudinal (nose/tail)
  const normalAxis = new THREE.Vector3(0, 0, 0).setComponent(normalIdx, 1);
  const longAxis = new THREE.Vector3(0, 0, 0).setComponent(longIdx, 1);
  const latAxis = new THREE.Vector3(0, 0, 0).setComponent(latIdx, 1);

  const raycaster = new THREE.Raycaster();

  const getHitNormalWorld = (hit: THREE.Intersection): THREE.Vector3 | null => {
    if (!hit.face || !hit.object) return null;

    const n = hit.face.normal
      .clone()
      .transformDirection((hit.object as THREE.Object3D).matrixWorld)
      .normalize();

    // Stabilize normals: OBJ exports can contain inconsistent winding.
    // For canopy wrapping we prefer the normal that generally points along +Y (our global up).
    if (n.dot(normalAxis) < 0) n.multiplyScalar(-1);

    return n;
  };

  // --- Anchor: use centerU/centerV mapping to get a first hit.
  // We pin the CENTER pixel at the anchor so it never drifts.
  // Then we do a one-sided (k>=0) surface “march” so the strip can wrap around the nose.

  // Convert world points -> LEDStrip local coordinates so Visualizer3D can still apply position/rotation.
  const pos = new THREE.Vector3(...visualConfig.position);
  const rotRad = visualConfig.rotation.map((deg) => (deg * Math.PI) / 180) as [
    number,
    number,
    number
  ];
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotRad[0], rotRad[1], rotRad[2], "XYZ")
  );
  const mWorld = new THREE.Matrix4().compose(
    pos,
    quat,
    new THREE.Vector3(1, 1, 1)
  );
  const mInv = mWorld.clone().invert();

  const writeOutLocal = (i: number, pWorld: THREE.Vector3) => {
    const p = pWorld.clone().applyMatrix4(mInv);
    out[i * 3 + 0] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  };

  type ProjectNearResult = {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    snapped: boolean;
  };

  // Helper: raycast near a guess point.
  // We try multiple directions (preferred normal, global axes, and optional local frame dirs)
  // and pick the closest hit to the guess point.
  const projectNear = (
    guessPoint: THREE.Vector3,
    preferredNormal?: THREE.Vector3,
    extraDirs?: THREE.Vector3[]
  ): ProjectNearResult => {
    const probe = Math.max(normRange * 8, spacingM * 12, 0.35);
    const maxSnapDist = Math.max(spacingM * 10.0, 0.18);

    const candidates: THREE.Intersection[] = [];

    const tryDir = (dir: THREE.Vector3) => {
      const d = dir.clone().normalize();
      if (d.lengthSq() < 1e-9) return;
      const o = guessPoint.clone().add(d.clone().multiplyScalar(probe));
      raycaster.set(o, d.clone().multiplyScalar(-1));
      const hits = raycaster.intersectObjects(canopyMeshes, true);
      if (hits && hits.length > 0) candidates.push(hits[0]);
    };

    const uniqDirs: THREE.Vector3[] = [];
    const pushDir = (d?: THREE.Vector3) => {
      if (!d) return;
      const v = d.clone();
      if (v.lengthSq() < 1e-9) return;
      v.normalize();
      for (const u of uniqDirs) {
        if (Math.abs(u.dot(v)) > 0.999) return; // near-duplicate
      }
      uniqDirs.push(v);
    };

    // Preferred normal first (both polarities)
    if (preferredNormal && preferredNormal.lengthSq() > 1e-9) {
      pushDir(preferredNormal);
      pushDir(preferredNormal.clone().multiplyScalar(-1));
    }

    // Optional local frame directions (e.g., tangent / binormal) help around the nose
    // where global +/-Y rays can miss.
    (extraDirs || []).forEach((d) => {
      pushDir(d);
      pushDir(d.clone().multiplyScalar(-1));
    });

    // Always include global axes (robust fallback)
    pushDir(normalAxis);
    pushDir(normalAxis.clone().multiplyScalar(-1));
    pushDir(longAxis);
    pushDir(longAxis.clone().multiplyScalar(-1));
    pushDir(latAxis);
    pushDir(latAxis.clone().multiplyScalar(-1));

    // Cast
    uniqDirs.forEach(tryDir);

    if (candidates.length === 0) {
      return { point: guessPoint.clone(), normal: normalAxis.clone(), snapped: false };
    }

    candidates.sort(
      (a, b) =>
        a.point.distanceToSquared(guessPoint) -
        b.point.distanceToSquared(guessPoint)
    );

    const best = candidates[0];
    if (best.point.distanceTo(guessPoint) > maxSnapDist) {
      return { point: guessPoint.clone(), normal: normalAxis.clone(), snapped: false };
    }

    const n = (getHitNormalWorld(best) || normalAxis.clone()).normalize();
    return { point: best.point.clone(), normal: n, snapped: true };
  };

  // Anchor raycast at (centerU, centerV).
  // IMPORTANT: even if the initial hit is imperfect, the marching logic will stabilize.
  let anchorHit: THREE.Intersection | null = null;

  const originDown = new THREE.Vector3();
  originDown.setComponent(longIdx, centerLong);
  originDown.setComponent(latIdx, centerLat);
  originDown.setComponent(normalIdx, normMax + normRange * 2);
  raycaster.set(originDown, normalAxis.clone().multiplyScalar(-1));
  const downHits = raycaster.intersectObjects(canopyMeshes, true);
  if (downHits && downHits.length > 0) anchorHit = downHits[0];

  if (!anchorHit) {
    const originUp = new THREE.Vector3();
    originUp.setComponent(longIdx, centerLong);
    originUp.setComponent(latIdx, centerLat);
    originUp.setComponent(normalIdx, normMin - normRange * 2);
    raycaster.set(originUp, normalAxis.clone());
    const upHits = raycaster.intersectObjects(canopyMeshes, true);
    if (upHits && upHits.length > 0) anchorHit = upHits[0];
  }

  const anchorGuess = new THREE.Vector3();
  anchorGuess.setComponent(longIdx, centerLong);
  anchorGuess.setComponent(latIdx, centerLat);
  anchorGuess.setComponent(normalIdx, (normMin + normMax) / 2);

  // Start at anchor point, then apply user offsets and re-project.
  let P0 = anchorHit ? anchorHit.point.clone() : anchorGuess.clone();
  let N0 = anchorHit
    ? (getHitNormalWorld(anchorHit) || normalAxis.clone())
    : normalAxis.clone();
  N0.normalize();
  if (N0.dot(normalAxis) < 0) N0.multiplyScalar(-1);


  // Desired direction in world-space (in the long/lat plane, rotated by angle).
  const desiredDirWorld = longAxis
    .clone()
    .multiplyScalar(c)
    .add(latAxis.clone().multiplyScalar(s))
    .normalize();

  // Build tangent frame at the anchor.
  let T0 = desiredDirWorld.clone();
  T0.add(N0.clone().multiplyScalar(-T0.dot(N0))).normalize();
  if (T0.lengthSq() < 1e-9) T0 = latAxis.clone();
  let B0 = new THREE.Vector3().crossVectors(N0, T0).normalize();

  // Apply offsets at anchor.
  if (tangentialOffsetM !== 0) P0.add(T0.clone().multiplyScalar(tangentialOffsetM));
  if (lateralOffsetM !== 0) P0.add(B0.clone().multiplyScalar(lateralOffsetM));

  // Re-project anchor after offsets, and refresh normal.
  const reproj0 = projectNear(P0, N0, [T0, B0]);
  if (reproj0.snapped) {
    P0 = reproj0.point;
    N0 = reproj0.normal.clone().normalize();
    if (N0.dot(normalAxis) < 0) N0.multiplyScalar(-1);
  }

  // Re-orthonormalize T0/B0 on the updated normal.
  T0 = desiredDirWorld.clone();
  T0.add(N0.clone().multiplyScalar(-T0.dot(N0))).normalize();
  if (T0.lengthSq() < 1e-9) T0 = latAxis.clone();
  B0 = new THREE.Vector3().crossVectors(N0, T0).normalize();

  // Apply normal offset at the anchor if requested.
  if (normalOffsetM !== 0) {
    P0 = P0.clone().add(N0.clone().multiplyScalar(normalOffsetM));
  }

  // Centered strip: iMid is pinned at P0.
  const iMid = Math.floor((pixelCount - 1) / 2);
  writeOutLocal(iMid, P0);

  // LEFT SIDE (i<iMid): march using the SAME transported tangent as the right side,
  // but step with a NEGATIVE distance. This keeps behavior symmetric and avoids
  // degeneracy from flipping the direction vector.
  //
  // Key improvement: avoid “pile-up” when a projection misses by doing a small
  // local search (lateral/normal nudges) and, if still missing, advancing a
  // fallback guess so pixels do not collapse to the same position.
  {
    let P = P0.clone();
    let N = N0.clone().normalize();
    let T = T0.clone().normalize(); // keep the same "forward" tangent
    let B = new THREE.Vector3().crossVectors(N, T).normalize();

    for (let i = iMid - 1; i >= 0; i--) {
      let step = spacingM;
      let bestHit: ProjectNearResult | null = null;

      for (let attempt = 0; attempt < 6; attempt++) {
        // Base step "backwards" along tangent
        const base = P.clone().add(T.clone().multiplyScalar(-step));

        // Try a small set of nearby guesses to keep the march attached on tight curvature.
        // Offsets are proportional to step so the search naturally shrinks as we halve step.
        const lateral = Math.min(step * 0.75, spacingM * 1.25);
        const normalNudge = Math.min(step * 0.75, spacingM * 1.25);

        const guesses: THREE.Vector3[] = [
          base,
          base.clone().add(B.clone().multiplyScalar(+lateral)),
          base.clone().add(B.clone().multiplyScalar(-lateral)),
          base.clone().add(N.clone().multiplyScalar(+normalNudge)),
          base.clone().add(N.clone().multiplyScalar(-normalNudge)),
        ];

        let candidate: ProjectNearResult | null = null;
        let candidateDist = Infinity;

        for (const g of guesses) {
          const h = projectNear(g, N, [T, B]);
          if (!h.snapped) continue;
          const d = h.point.distanceToSquared(base);
          if (d < candidateDist) {
            candidate = h;
            candidateDist = d;
          }
        }

        if (candidate) {
          bestHit = candidate;
          break;
        }

        // If no candidate snapped, shrink step and try again.
        step *= 0.5;
      }

      if (!bestHit) {
        // Hard fallback: advance a guess so pixels don't stack.
        const Pfallback = P.clone().add(T.clone().multiplyScalar(-spacingM));
        writeOutLocal(i, Pfallback);
        P = Pfallback;
        continue;
      }

      let Pn = bestHit.point;
      let Nn = bestHit.normal.clone().normalize();

      // Keep normal orientation consistent.
      if (Nn.dot(N) < 0) Nn.multiplyScalar(-1);

      // Parallel transport the tangent: project previous tangent into the new tangent plane.
      let Tn = T.clone();
      Tn.add(Nn.clone().multiplyScalar(-Tn.dot(Nn)));

      if (Tn.lengthSq() < 1e-9) {
        // Fallback: re-project the original desired direction into the new plane.
        Tn = desiredDirWorld.clone();
        Tn.add(Nn.clone().multiplyScalar(-Tn.dot(Nn)));
        if (Tn.lengthSq() < 1e-9) Tn = latAxis.clone();
      }

      Tn.normalize();

      // Prevent occasional 180° flips from numerical noise.
      if (Tn.dot(T) < 0) Tn.multiplyScalar(-1);

      // Apply user normal offset if requested.
      if (normalOffsetM !== 0) {
        Pn = Pn.clone().add(Nn.clone().multiplyScalar(normalOffsetM));
      }

      writeOutLocal(i, Pn);

      // Advance.
      P = Pn;
      N = Nn;
      T = Tn;
      B = new THREE.Vector3().crossVectors(N, T).normalize();
    }
  }

  // RIGHT SIDE (k>=0): one-sided marching wrap.
  // We advance point-by-point, updating the tangent by parallel transport.
  let P = P0.clone();
  let N = N0.clone().normalize();
  let T = T0.clone().normalize();
  let B = new THREE.Vector3().crossVectors(N, T).normalize();

  for (let i = iMid + 1; i < pixelCount; i++) {
    // Step forward along current tangent.
    let step = spacingM;
    let hit: ProjectNearResult | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const guess = P.clone().add(T.clone().multiplyScalar(step));
      const h = projectNear(guess, N, [T, B]);
      if (h.snapped) {
        hit = h;
        break;
      }
      step *= 0.5;
    }

    if (!hit) {
      writeOutLocal(i, P);
      continue;
    }

    let Pn = hit.point;
    let Nn = hit.normal.clone().normalize();

    // Keep normal orientation consistent.
    if (Nn.dot(N) < 0) Nn.multiplyScalar(-1);

    // Parallel transport the tangent: project previous tangent into the new tangent plane.
    let Tn = T.clone();
    Tn.add(Nn.clone().multiplyScalar(-Tn.dot(Nn)));
    if (Tn.lengthSq() < 1e-9) {
      // Fallback if tangent degenerates: re-project desired dir into new plane.
      Tn = desiredDirWorld.clone();
      Tn.add(Nn.clone().multiplyScalar(-Tn.dot(Nn)));
    }
    Tn.normalize();

    // Apply user normal offset if requested.
    if (normalOffsetM !== 0) {
      Pn = Pn.clone().add(Nn.clone().multiplyScalar(normalOffsetM));
    }

    writeOutLocal(i, Pn);

    // Advance.
    P = Pn;
    N = Nn;
    T = Tn;
    B = new THREE.Vector3().crossVectors(N, T).normalize();
  }

  return out;
}

function Scene({
  config,
  fixtures,
  pixelColors,
  onCameraResetRequest,
  showHeliReference,
  heliReferenceMode,
}: {
  config: FixtureVisualConfig[];
  fixtures: Fixture[];
  pixelColors: Map<string, string[]>;
  onCameraResetRequest?: number;
  showHeliReference?: boolean;
  heliReferenceMode?: "edges" | "mesh";
}) {
  const controlsRef = useRef<any>(null);
  const [canopyMeshes, setCanopyMeshes] = useState<THREE.Mesh[] | null>(null);

  useEffect(() => {
    if (controlsRef.current && onCameraResetRequest) {
      // Reset camera to default position
      controlsRef.current.object.position.set(3, 2, 3);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [onCameraResetRequest]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.6} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} />

      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#444"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#666"
        fadeDistance={50}
        fadeStrength={1}
        infiniteGrid
      />

      <Suspense fallback={null}>
        <HelicopterReferenceModel
          show={showHeliReference ?? true}
          mode={heliReferenceMode ?? "mesh"}
                    onCanopyMeshes={setCanopyMeshes}
        />
      </Suspense>

      {config.map((visualConfig) => {
        const fixture = fixtures.find((f) => f.id === visualConfig.fixtureId);
        if (!fixture || !fixture.pixelCount) return null;

        const colors = pixelColors.get(visualConfig.fixtureId) || [];
        const att = visualConfig.attachment as ModelTypes.Attachment | undefined;

        if (
          att &&
          att.kind === "surface" &&
          att.surfaceId === "CANOPY" &&
          canopyMeshes &&
          canopyMeshes.length > 0
        ) {
          const overridePositions = buildCanopyOverridePositions({
            fixture,
            visualConfig,
            attachment: att,
            canopyMeshes,
          });

          return (
            <LEDStrip
              key={visualConfig.fixtureId}
              fixture={fixture}
              pixelCount={fixture.pixelCount}
              layout={visualConfig.layout}
              position={visualConfig.position}
              rotation={visualConfig.rotation}
              circleRadius={visualConfig.circleRadius}
              splinePoints={visualConfig.splinePoints}
              splineTension={visualConfig.splineTension}
              overridePositions={overridePositions}
              colors={colors}
            />
          );
        }

        return (
          <LEDStrip
            key={visualConfig.fixtureId}
            fixture={fixture}
            pixelCount={fixture.pixelCount}
            layout={visualConfig.layout}
            position={visualConfig.position}
            rotation={visualConfig.rotation}
            circleRadius={visualConfig.circleRadius}
            splinePoints={visualConfig.splinePoints}
            splineTension={visualConfig.splineTension}
                        colors={colors}
            // colors={pixelColors.get(visualConfig.fixtureId) || []}
          />
        );
      })}

      <OrbitControls ref={controlsRef} makeDefault />
            {/* Axis helper in bottom-right */}

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#ff4444", "#44ff44", "#4444ff"]}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
}

export default function Visualizer3D({
  config,
  fixtures,
  pixelColors = new Map(),
  onCameraResetRequest,
  showHeliReference = true,
  heliReferenceMode = "mesh",
}: Visualizer3DProps) {
  return (
    <Canvas
      camera={{ position: [3, 2, 3], fov: 50 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Scene
        config={config}
        fixtures={fixtures}
        pixelColors={pixelColors}
        onCameraResetRequest={onCameraResetRequest}
        showHeliReference={showHeliReference}
        heliReferenceMode={heliReferenceMode}
      />
    </Canvas>
  );
}
