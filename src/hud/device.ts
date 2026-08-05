/**
 * Device-honesty helpers: make an idealised canvas look like what the G2 panel
 * can actually emit — a native-resolution, 16-level, monochrome-green image.
 *
 * Using these in the simulator turns the flattering 2x anti-aliased preview into
 * the real thing: quantised brightness, no glow, and (when composited additively
 * over a scene) the true see-through behaviour where faint marks wash out.
 */

/** The panel emits 16 discrete brightness levels of a single green phosphor. */
export const DEVICE_LEVELS = 16;

/**
 * Quantise RGBA pixel data in place to `levels` steps of G2 green.
 * Brightness is taken from perceptual luminance, snapped to the nearest level,
 * then re-emitted on a fixed green phosphor tint. Near-black stays black so it
 * reads as transparent when the frame is composited over the world.
 */
export function quantizeToDeviceGreen(data: Uint8ClampedArray, levels = DEVICE_LEVELS): void {
  const steps = levels - 1;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const q = Math.round(lum * steps) / steps; // snap to a level
    // G2-ish green phosphor: dominant green with a faint blue/red cast.
    data[i] = q * 46;
    data[i + 1] = q * 255;
    data[i + 2] = q * 92;
    data[i + 3] = 255;
  }
}
