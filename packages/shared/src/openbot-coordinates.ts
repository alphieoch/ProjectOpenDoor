/**
 * Screenshot, Playwright mouse, and the live-screen cursor share one space:
 * viewport CSS pixels (default 1280×800). The PNG may be larger when
 * devicePixelRatio > 1 — always use shot.width/height, never raw PNG pixels.
 *
 * The live canvas is object-contain letterboxed. Map through the contained
 * image rect, not the full stage box, or clicks land in the unused margin.
 */

export const COMPUTER_VIEWPORT = { width: 1280, height: 800 } as const;

export type Size = { width: number; height: number };
export type Box = { left?: number; top?: number; width: number; height: number };
export type Point = { x: number; y: number };

export function letterboxedImageRect(
  image: { naturalWidth: number; naturalHeight: number },
  box: Size,
): { left: number; top: number; width: number; height: number } {
  if (!image.naturalWidth || !image.naturalHeight || !box.width || !box.height) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const boxRatio = box.width / box.height;
  if (boxRatio > imageRatio) {
    const height = box.height;
    const width = height * imageRatio;
    return { left: (box.width - width) / 2, top: 0, width, height };
  }
  const width = box.width;
  const height = width / imageRatio;
  return { left: 0, top: (box.height - height) / 2, width, height };
}

/** Map a pointer event on a letterboxed screenshot to viewport CSS pixels. */
export function pageCoordinates(
  image: { naturalWidth: number; naturalHeight: number },
  rect: Box,
  event: { clientX: number; clientY: number },
): Point | null {
  if (!rect.width || !rect.height) return null;
  if (!image.naturalWidth || !image.naturalHeight) return null;

  const inner = letterboxedImageRect(image, { width: rect.width, height: rect.height });
  if (!inner.width || !inner.height) return null;

  const originLeft = (rect.left ?? 0) + inner.left;
  const originTop = (rect.top ?? 0) + inner.top;
  const withinX = event.clientX - originLeft;
  const withinY = event.clientY - originTop;
  if (withinX < 0 || withinY < 0 || withinX > inner.width || withinY > inner.height) {
    return null;
  }

  return {
    x: Math.round((withinX / inner.width) * image.naturalWidth),
    y: Math.round((withinY / inner.height) * image.naturalHeight),
  };
}

/**
 * Map a model-supplied screenshot point onto the Playwright viewport.
 * Identity when shot.width/height already are the viewport.
 */
export function screenshotToViewport(
  point: Point,
  screenshot: Size,
  viewport: Size = COMPUTER_VIEWPORT,
): Point {
  if (!screenshot.width || !screenshot.height) {
    return {
      x: Math.min(Math.max(Math.round(point.x), 0), viewport.width - 1),
      y: Math.min(Math.max(Math.round(point.y), 0), viewport.height - 1),
    };
  }
  return {
    x: Math.min(
      Math.max(Math.round((point.x / screenshot.width) * viewport.width), 0),
      viewport.width - 1,
    ),
    y: Math.min(
      Math.max(Math.round((point.y / screenshot.height) * viewport.height), 0),
      viewport.height - 1,
    ),
  };
}

/** Place the bot cursor on a letterboxed live canvas (coordinates local to the box). */
export function viewportToOverlay(
  point: Point,
  image: { naturalWidth: number; naturalHeight: number },
  box: Size,
): Point | null {
  const inner = letterboxedImageRect(image, box);
  if (!inner.width || !image.naturalWidth || !image.naturalHeight) return null;
  return {
    x: inner.left + (point.x / image.naturalWidth) * inner.width,
    y: inner.top + (point.y / image.naturalHeight) * inner.height,
  };
}
