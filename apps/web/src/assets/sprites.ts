import * as THREE from "three";

const textureCache = new Map<string, THREE.CanvasTexture>();

export function spriteTexture(label: string, fill: string, stroke = "#26352f"): THREE.CanvasTexture {
  const key = `${label}:${fill}:${stroke}`;
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas is unavailable");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 12;
  roundRect(ctx, 22, 34, 212, 176, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  roundRect(ctx, 48, 58, 160, 46, 18);
  ctx.fill();
  ctx.fillStyle = stroke;
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapLabel(ctx, label.toUpperCase(), 128, 142);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textureCache.set(key, texture);
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number) {
  const words = label.split(" ");
  if (words.length === 1) {
    ctx.fillText(label, x, y);
    return;
  }
  ctx.font = "bold 28px system-ui, sans-serif";
  words.slice(0, 2).forEach((word, index) => {
    ctx.fillText(word, x, y - 18 + index * 36);
  });
}

export function colorForItem(itemId: string): string {
  switch (itemId) {
    case "wheat":
      return "#e2c85a";
    case "corn":
      return "#f0b744";
    case "soybean":
      return "#7bb86d";
    case "carrot":
      return "#e9873a";
    case "bread":
      return "#c68a4a";
    case "corn_bread":
      return "#dcae52";
    case "egg":
      return "#f4eee2";
    case "milk":
      return "#dbeefe";
    default:
      return "#9cc7a1";
  }
}

