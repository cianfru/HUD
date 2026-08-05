/**
 * Aircraft attitude — pitch and roll — as it would come from the phone's IMU
 * while the phone is mounted rigidly to the airframe (a portable-AHRS setup,
 * like a Sentry/Levil). Heading is deliberately absent: gyro yaw drifts and the
 * cockpit magnetometer is unreliable, so heading comes from GPS ground track.
 *
 * The real sensor path (CoreMotion / DeviceMotion) needs a one-time "straight
 * and level, tap to zero" leveling to learn the cradle-to-airframe offset, and
 * GPS-aided correction to reject the coordinated-turn / acceleration error. This
 * module holds the small maths pieces; the fusion itself lives on-device.
 */

const KT_TO_MPS = 0.514444;
const G = 9.80665;

export interface Attitude {
  /** Nose-up positive, degrees. */
  pitchDeg: number;
  /** Right-wing-down positive, degrees. */
  rollDeg: number;
}

export const LEVEL: Attitude = { pitchDeg: 0, rollDeg: 0 };

/**
 * Bank angle of a coordinated turn holding `turnRateDegPerSec` at ground speed
 * `gsKt`. This is the geometry a GPS-aided AHRS uses to sanity-check the
 * accelerometer during turns: bank = atan(V·ω / g).
 */
export function coordinatedBankDeg(gsKt: number, turnRateDegPerSec: number): number {
  const v = gsKt * KT_TO_MPS;
  const omega = (turnRateDegPerSec * Math.PI) / 180;
  return (Math.atan2(v * omega, G) * 180) / Math.PI;
}

/**
 * Roll of the world horizon as seen through the display, given the aircraft roll
 * (from the phone) and how far the head is rolled relative to the airframe (from
 * the glasses). With the head level it equals the aircraft roll; rolling the
 * head counter-rotates the horizon so it stays pinned to the real world.
 */
export function horizonRollDeg(aircraftRollDeg: number, headRollDeg: number): number {
  return aircraftRollDeg - headRollDeg;
}
