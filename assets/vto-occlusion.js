/** Conservative foreground restoration. Geometry is NEVER cut by arm proxies.
 * A pixel must be both in the observed limb region and confidently classified
 * as skin/accessory. Clothes/background and uncertain pixels leave fabric intact.
 * Masks always travel with the exact source frame, never a previous video frame. */
export function foregroundAlpha(masks, width, height, points) {
  const alpha = new Uint8ClampedArray(width * height);
  if (!points?.[11] || !points?.[12] || masks.length < 6) return alpha;
  const valid = p => p && (p.visibility ?? 1) > .55 && (p.presence ?? 1) > .55;
  const px = p => [p.x * width, p.y * height];
  const shoulder = Math.hypot((points[11].x - points[12].x) * width, (points[11].y - points[12].y) * height);
  const sy = (points[11].y + points[12].y) * height / 2;
  const dist = (x, y, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  };
  const arms = [[13,15,19],[14,16,20]].filter(ids => ids.every(i => valid(points[i]))).map(([e,w,f]) => {
    const elbow = px(points[e]), wrist = px(points[w]), finger = px(points[f]);
    return {a: elbow.map((v,i) => v + (wrist[i] - v) * .15), b: wrist, finger};
  });
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const limb = arms.some(a => dist(x,y,a.a,a.b) < shoulder * .17 || dist(x,y,a.b,a.finger) < shoulder * .16);
    const head = y < sy - shoulder * .04 && Math.abs(x - (points[11].x + points[12].x) * width / 2) < shoulder * .6;
    if (!limb && !head) continue;
    const confidence = j => Math.max(limb ? masks[2][j] : 0, head ? masks[1][j] : 0,
      head ? masks[3][j] : 0, limb ? masks[5][j] : 0);
    // One-pixel conservative erosion prevents a segmentation fringe revealing
    // background or the original shirt around a hand. No skin-colour heuristic.
    const c = Math.min(confidence(i), confidence(i-1), confidence(i+1), confidence(i-width), confidence(i+width));
    alpha[i] = Math.round(Math.min(1, Math.max(0, (c - .8) / .16)) * 255);
  }
  return alpha;
}
