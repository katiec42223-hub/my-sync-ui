import React, { useMemo, useRef } from "react";
import * as THREE from "three";
// import { useFrame } from "@react-three/fiber";
import { Fixture, LED_TYPES } from "../ModelLayoutEditor/modelTypes";

type LEDStripProps = {
  pixelCount: number;
  layout: "linear" | "circle" | "wrapped" | "spline";
  position: [number, number, number];
  rotation: [number, number, number];
  colors?: string[]; // RGB hex per pixel, e.g. ["#ff0000", "#00ff00"]
  scale?: number;
  circleRadius?: number;
  fixture: Fixture;
  splinePoints?: Array<[number, number, number]>;
  splineTension?: number;

  // If provided, overrides all layout/spline computations.
  // Must be length (pixelCount * 3), and is in LEDStrip LOCAL coordinates.
  overridePositions?: Float32Array;
};

export default function LEDStrip({
  pixelCount,
  layout,
  position,
  rotation,
  colors = [],
  scale = 1.0,
  circleRadius = 0.5,
  splinePoints,
  splineTension = 0.5,
  overridePositions,
  fixture,
}: LEDStripProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    if (overridePositions && overridePositions.length === pixelCount * 3) {
      return overridePositions;
    }

    const pos = new Float32Array(pixelCount * 3);

    // Get LED specs from fixture
    const ledSpec = LED_TYPES[fixture.ledType] || LED_TYPES.SK9822;
    const spacing = (fixture.customSpacing || ledSpec.pixelSpacing) / 1000; // mm to meters

    for (let i = 0; i < pixelCount; i++) {
      if (layout === "linear") {
        pos[i * 3] = i * spacing;
        pos[i * 3 + 1] = 0;
        pos[i * 3 + 2] = 0;
        continue;
      }

      if (layout === "circle") {
        const angle = (i / pixelCount) * Math.PI * 2;
        pos[i * 3] = Math.cos(angle) * circleRadius;
        pos[i * 3 + 1] = Math.sin(angle) * circleRadius;
        pos[i * 3 + 2] = 0;
        continue;
      }

      if (layout === "wrapped") {
        // Simple helical wrap around Y axis
        const angle = (i / pixelCount) * Math.PI * 4; // 2 wraps
        pos[i * 3] = Math.cos(angle) * circleRadius;
        pos[i * 3 + 1] = (i / pixelCount) * 2 - 1; // -1 to +1 on Y
        pos[i * 3 + 2] = Math.sin(angle) * circleRadius;
        continue;
      }

      if (layout === "spline") {
        if (!splinePoints || splinePoints.length < 2) {
          // Default linear fallback
          pos[i * 3] = i * spacing;
          pos[i * 3 + 1] = 0;
          pos[i * 3 + 2] = 0;
          continue;
        }

        if (splinePoints.length === 2) {
          // Just 2 points - linear interpolation with proper spacing
          const p1 = splinePoints[0];
          const p2 = splinePoints[1];
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const dz = p2[2] - p1[2];
          const totalLength = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

          const dirX = dx / totalLength;
          const dirY = dy / totalLength;
          const dirZ = dz / totalLength;

          const distance = i * spacing;
          pos[i * 3] = p1[0] + dirX * distance;
          pos[i * 3 + 1] = p1[1] + dirY * distance;
          pos[i * 3 + 2] = p1[2] + dirZ * distance;
          continue;
        }

        // Catmull-Rom with FIXED spacing between pixels
        const samples = 1000;
        const curvePoints: Array<[number, number, number]> = [];
        let totalCurveLength = 0;
        const segmentLengths: number[] = [0];

        for (let s = 0; s < samples; s++) {
          const t = s / (samples - 1);
          const segmentCount = splinePoints.length - 1;
          const segmentIndex = Math.min(
            Math.floor(t * segmentCount),
            segmentCount - 1
          );
          const localT = t * segmentCount - segmentIndex;

          const p0 =
            segmentIndex === 0
              ? splinePoints[0]
              : splinePoints[segmentIndex - 1];
          const p1 = splinePoints[segmentIndex];
          const p2 = splinePoints[segmentIndex + 1];
          const p3 =
            segmentIndex >= splinePoints.length - 2
              ? splinePoints[splinePoints.length - 1]
              : splinePoints[segmentIndex + 2];

          const tension = splineTension || 0.5;
          const t2 = localT * localT;
          const t3 = t2 * localT;

          const v0x = (p2[0] - p0[0]) * tension;
          const v1x = (p3[0] - p1[0]) * tension;
          const x =
            (2 * p1[0] - 2 * p2[0] + v0x + v1x) * t3 +
            (-3 * p1[0] + 3 * p2[0] - 2 * v0x - v1x) * t2 +
            v0x * localT +
            p1[0];

          const v0y = (p2[1] - p0[1]) * tension;
          const v1y = (p3[1] - p1[1]) * tension;
          const y =
            (2 * p1[1] - 2 * p2[1] + v0y + v1y) * t3 +
            (-3 * p1[1] + 3 * p2[1] - 2 * v0y - v1y) * t2 +
            v0y * localT +
            p1[1];

          const v0z = (p2[2] - p0[2]) * tension;
          const v1z = (p3[2] - p1[2]) * tension;
          const z =
            (2 * p1[2] - 2 * p2[2] + v0z + v1z) * t3 +
            (-3 * p1[2] + 3 * p2[2] - 2 * v0z - v1z) * t2 +
            v0z * localT +
            p1[2];

          curvePoints.push([x, y, z]);

          if (s > 0) {
            const prev = curvePoints[s - 1];
            const ddx = x - prev[0];
            const ddy = y - prev[1];
            const ddz = z - prev[2];
            const segLen = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
            totalCurveLength += segLen;
            segmentLengths.push(totalCurveLength);
          }
        }

        const targetDistance = i * spacing;

        if (targetDistance >= totalCurveLength) {
          const lastPt = curvePoints[curvePoints.length - 1];
          pos[i * 3] = lastPt[0];
          pos[i * 3 + 1] = lastPt[1];
          pos[i * 3 + 2] = lastPt[2];
          continue;
        }

        let segIdx = 0;
        for (let s = 0; s < segmentLengths.length - 1; s++) {
          if (
            targetDistance >= segmentLengths[s] &&
            targetDistance < segmentLengths[s + 1]
          ) {
            segIdx = s;
            break;
          }
        }

        const segStart = segmentLengths[segIdx];
        const segEnd = segmentLengths[segIdx + 1];
        const segT = (targetDistance - segStart) / (segEnd - segStart);

        const pt1 = curvePoints[segIdx];
        const pt2 = curvePoints[segIdx + 1];

        pos[i * 3] = pt1[0] + (pt2[0] - pt1[0]) * segT;
        pos[i * 3 + 1] = pt1[1] + (pt2[1] - pt1[1]) * segT;
        pos[i * 3 + 2] = pt1[2] + (pt2[2] - pt1[2]) * segT;
      }
    }

    return pos;
  }, [
    pixelCount,
    layout,
    circleRadius,
    splinePoints,
    splineTension,
    overridePositions,
    fixture,
  ]);


  const colorArray = useMemo(() => {
    const col = new Float32Array(pixelCount * 3);
    for (let i = 0; i < pixelCount; i++) {
      const hex = colors[i] || "#ffffff";
      const c = new THREE.Color(hex);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return col;
  }, [colors, pixelCount]);

  // Update colors when they change
  React.useEffect(() => {
    if (pointsRef.current) {
      pointsRef.current.geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(colorArray, 3)
      );
    }
  }, [colorArray]);

  const rotRad = rotation.map((deg) => (deg * Math.PI) / 180) as [
    number,
    number,
    number
  ];

  const pixelSize = useMemo(() => {
    const ledSpec = LED_TYPES[fixture.ledType] || LED_TYPES.SK9822;
    const diameter = (fixture.customDiameter || ledSpec.pixelDiameter) / 1000; // mm to meters
    return diameter * 5; // Scale for visibility
  }, [fixture]);

  return (
    <points ref={pointsRef} position={position} rotation={rotRad}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={pixelCount}
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          count={pixelCount}
          args={[colorArray, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={pixelSize} vertexColors sizeAttenuation />
      {/* Helper line to show strip path */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={pixelCount}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#666666" opacity={0.3} transparent />
      </line>
    </points>
  );
}
