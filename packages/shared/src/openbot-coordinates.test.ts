import { describe, expect, test } from "bun:test";
import {
  COMPUTER_VIEWPORT,
  letterboxedImageRect,
  pageCoordinates,
  screenshotToViewport,
  viewportToOverlay,
} from "./openbot-coordinates.js";

const VIEWPORT = { naturalWidth: 1280, naturalHeight: 800 };

describe("letterboxedImageRect", () => {
  test("fills a matching-aspect box", () => {
    expect(letterboxedImageRect(VIEWPORT, { width: 640, height: 400 })).toEqual({
      left: 0,
      top: 0,
      width: 640,
      height: 400,
    });
  });

  test("pillarboxes a wide stage (unused strips on the sides)", () => {
    const inner = letterboxedImageRect(VIEWPORT, { width: 1600, height: 800 });
    expect(inner.height).toBe(800);
    expect(inner.width).toBe(1280);
    expect(inner.left).toBe(160);
    expect(inner.top).toBe(0);
  });

  test("letterboxes a tall stage (unused strip top/bottom — not a dead footer)", () => {
    const inner = letterboxedImageRect(VIEWPORT, { width: 1280, height: 1000 });
    expect(inner.width).toBe(1280);
    expect(inner.height).toBe(800);
    expect(inner.left).toBe(0);
    expect(inner.top).toBe(100);
  });
});

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

  test("ignores clicks on the letterbox gutter", () => {
    expect(
      pageCoordinates(VIEWPORT, { left: 0, top: 0, width: 1600, height: 800 }, { clientX: 40, clientY: 40 }),
    ).toBeNull();
  });

  test("maps through pillarbox gutters onto viewport pixels", () => {
    const at = pageCoordinates(
      VIEWPORT,
      { left: 0, top: 0, width: 1600, height: 800 },
      { clientX: 160 + 640, clientY: 400 },
    );
    expect(at).toEqual({ x: 640, y: 400 });
  });

  test("returns nothing rather than NaN before the picture has loaded", () => {
    expect(
      pageCoordinates(VIEWPORT, { left: 0, top: 0, width: 0, height: 0 }, { clientX: 10, clientY: 10 }),
    ).toBeNull();
  });
});

describe("screenshotToViewport", () => {
  test("is identity when the screenshot reports viewport CSS pixels", () => {
    expect(screenshotToViewport({ x: 100, y: 50 }, COMPUTER_VIEWPORT)).toEqual({ x: 100, y: 50 });
  });

  test("scales device-pixel screenshots back to CSS viewport", () => {
    expect(screenshotToViewport({ x: 200, y: 100 }, { width: 2560, height: 1600 })).toEqual({
      x: 100,
      y: 50,
    });
  });

  test("clamps to the viewport so a rounding artefact cannot miss the page", () => {
    expect(screenshotToViewport({ x: 3000, y: -4 }, COMPUTER_VIEWPORT)).toEqual({
      x: COMPUTER_VIEWPORT.width - 1,
      y: 0,
    });
  });
});

describe("viewportToOverlay", () => {
  test("places the cursor on the contained image, not the gutter", () => {
    const at = viewportToOverlay({ x: 640, y: 400 }, VIEWPORT, { width: 1600, height: 800 });
    expect(at).toEqual({ x: 160 + 640, y: 400 });
  });

  test("round-trips with pageCoordinates on a letterboxed stage", () => {
    const overlay = viewportToOverlay({ x: 200, y: 100 }, VIEWPORT, { width: 640, height: 400 });
    expect(overlay).not.toBeNull();
    const back = pageCoordinates(VIEWPORT, { left: 0, top: 0, width: 640, height: 400 }, {
      clientX: overlay!.x,
      clientY: overlay!.y,
    });
    expect(back).toEqual({ x: 200, y: 100 });
  });
});
