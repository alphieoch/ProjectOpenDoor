import { describe, expect, test } from "bun:test";
import { pageCoordinates, screenshotToViewport, viewportToOverlay } from "./take-the-wheel";

const VIEWPORT = { naturalWidth: 1280, naturalHeight: 800 };

describe("pageCoordinates", () => {
  test("maps a click through a half-size image", () => {
    const at = pageCoordinates(
      VIEWPORT,
      { left: 0, top: 0, width: 640, height: 400 },
      { clientX: 100, clientY: 50 },
    );
    expect(at).toEqual({ x: 200, y: 100 });
  });

  test("subtracts where the image sits on screen", () => {
    const at = pageCoordinates(
      VIEWPORT,
      { left: 200, top: 120, width: 1280, height: 800 },
      { clientX: 260, clientY: 140 },
    );
    expect(at).toEqual({ x: 60, y: 20 });
  });

  test("maps a letterboxed stage so screenshot space equals click space", () => {
    const overlay = viewportToOverlay({ x: 320, y: 200 }, VIEWPORT, { width: 1600, height: 800 });
    expect(overlay).not.toBeNull();
    expect(
      pageCoordinates(VIEWPORT, { left: 0, top: 0, width: 1600, height: 800 }, {
        clientX: overlay!.x,
        clientY: overlay!.y,
      }),
    ).toEqual({ x: 320, y: 200 });
  });

  test("returns nothing rather than NaN before the picture has loaded", () => {
    expect(
      pageCoordinates(VIEWPORT, { left: 0, top: 0, width: 0, height: 0 }, { clientX: 10, clientY: 10 }),
    ).toBeNull();
  });
});

describe("screenshotToViewport", () => {
  test("keeps click(x,y) in the same space as computer_screenshot width/height", () => {
    expect(screenshotToViewport({ x: 640, y: 400 }, { width: 1280, height: 800 })).toEqual({
      x: 640,
      y: 400,
    });
  });
});
