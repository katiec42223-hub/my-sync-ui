// import React from "react";
// import { Canvas } from "@react-three/fiber";
// import {
//   OrbitControls,
//   Grid,
//   GizmoHelper,
//   GizmoViewport,
// } from "@react-three/drei";
// import LEDStrip from "./LEDStrip";
// import type { FixtureVisualConfig } from "../ModelLayoutEditor/modelTypes";
// import type { Fixture } from "../ModelLayoutEditor/modelTypes";

// type Visualizer3DProps = {
//   config: FixtureVisualConfig[];
//   fixtures: Fixture[]; // ADD THIS
//   pixelColors?: Map<string, string[]>;
// };

// export default function Visualizer3D({
//   config,
//   fixtures,
//   pixelColors = new Map(),
// }: Visualizer3DProps) {
//   return (
//     <Canvas
//       camera={{ position: [3, 2, 3], fov: 50 }}
//       style={{ width: "100%", height: "100%" }}
//     >
//       <ambientLight intensity={0.4} />
//       <pointLight position={[10, 10, 10]} intensity={0.6} />
//       <pointLight position={[-10, -10, -10]} intensity={0.3} />

//       <Grid
//         args={[20, 20]}
//         cellSize={0.5}
//         cellThickness={0.5}
//         cellColor="#444"
//         sectionSize={2}
//         sectionThickness={1}
//         sectionColor="#666"
//         fadeDistance={50}
//         fadeStrength={1}
//         infiniteGrid
//       />

//       {config.map((visualConfig) => {
//         const fixture = fixtures.find((f) => f.id === visualConfig.fixtureId);
//         if (!fixture || !fixture.pixelCount) return null; // Add null check for pixelCount

//         return (
//           <LEDStrip
//             key={visualConfig.fixtureId}
//             fixture={fixture}
//             pixelCount={fixture.pixelCount} // TypeScript now knows this is a number, not null
//             layout={visualConfig.layout}
//             position={visualConfig.position}
//             rotation={visualConfig.rotation}
//             circleRadius={visualConfig.circleRadius}
//             splinePoints={visualConfig.splinePoints}
//             splineTension={visualConfig.splineTension}
//             colors={pixelColors.get(visualConfig.fixtureId) || []}
//           />
//         );
//       })}

//       <OrbitControls makeDefault />

//       {/* Axis helper in bottom-right */}
//       <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
//         <GizmoViewport
//           axisColors={["#ff4444", "#44ff44", "#4444ff"]}
//           labelColor="white"
//         />
//       </GizmoHelper>
//     </Canvas>
//   );
// }

import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
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
}: {
  show: boolean;
  mode: "edges" | "mesh";
}) {
  if (!show) return null;

  // Files are served from Vite's `public/` directory.
  // Your current tree shows:
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
      // MTLLoader returns a MaterialCreator-like object; typings vary across Three builds.
      // Use optional chaining and `any` to avoid TS friction.
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
  }, [centeredObj, lineMat, meshMat, boomMeshMat]);

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
      scale={[rootScale, rootScale, rootScale]}
      renderOrder={10}
      onPointerDown={handleHeliPick}
    >
      {mode === "edges" ? (
        <primitive object={edgesGroup} />
      ) : (
        <primitive object={meshGroup} />
      )}
    </group>
  );
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
        />
      </Suspense>

      {config.map((visualConfig) => {
        const fixture = fixtures.find((f) => f.id === visualConfig.fixtureId);
        if (!fixture || !fixture.pixelCount) return null;

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
            colors={pixelColors.get(visualConfig.fixtureId) || []}
          />
        );
      })}

      <OrbitControls ref={controlsRef} makeDefault />

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
