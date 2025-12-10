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

import React, { useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import LEDStrip from "./LEDStrip";
import type { FixtureVisualConfig } from "../ModelLayoutEditor/modelTypes";
import type { Fixture } from "../ModelLayoutEditor/modelTypes";

type Visualizer3DProps = {
  config: FixtureVisualConfig[];
  fixtures: Fixture[];
  pixelColors?: Map<string, string[]>;
  onCameraResetRequest?: number; // Increment this to trigger reset
};

function Scene({
  config,
  fixtures,
  pixelColors,
  onCameraResetRequest,
}: {
  config: FixtureVisualConfig[];
  fixtures: Fixture[];
  pixelColors: Map<string, string[]>;
  onCameraResetRequest?: number;
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
      />
    </Canvas>
  );
}