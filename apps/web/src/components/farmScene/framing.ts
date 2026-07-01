export type FarmViewportInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type FarmCameraFrameInput = {
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  insets: FarmViewportInsets;
  paddingPx: number;
};

export type FarmCameraFrame = {
  cameraPosition: [number, number, number];
  target: [number, number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
};

const cameraDistance = 15;
const screenRight: [number, number, number] = [Math.SQRT1_2, 0, -Math.SQRT1_2];
const screenUp: [number, number, number] = [-0.4082482904638631, 0.8164965809277261, -0.4082482904638631];

export function computeFarmCameraFrame({
  canvasWidth,
  canvasHeight,
  gridSize,
  insets,
  paddingPx,
}: FarmCameraFrameInput): FarmCameraFrame {
  const safeWidth = Math.max(260, canvasWidth - insets.left - insets.right - paddingPx * 2);
  const safeHeight = Math.max(220, canvasHeight - insets.top - insets.bottom - paddingPx * 2);
  const projectedWidth = gridSize * 1.5;
  const projectedHeight = gridSize * 1.08;
  const zoom = clamp(Math.min(safeWidth / projectedWidth, safeHeight / projectedHeight), 12, 44);
  const deltaX = (insets.left - insets.right) / 2;
  const deltaY = (insets.top - insets.bottom) / 2;
  const target = addVectors(
    scaleVector(screenRight, -deltaX / zoom),
    scaleVector(screenUp, deltaY / zoom),
  );

  return {
    cameraPosition: [
      target[0] + cameraDistance,
      target[1] + cameraDistance,
      target[2] + cameraDistance,
    ],
    target,
    zoom,
    minZoom: Math.max(8, zoom * 0.68),
    maxZoom: Math.max(48, zoom * 2.15),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scaleVector(vector: [number, number, number], scale: number): [number, number, number] {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function addVectors(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}
