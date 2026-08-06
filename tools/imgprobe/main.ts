/**
 * Image-format discovery probe. Renders a recognisable test image into a
 * 288×144 image container, then cycles through candidate byte encodings on each
 * touchpad click. Drive it in the official simulator and screenshot the glasses
 * framebuffer after each click to see which encoding the firmware decodes
 * correctly. Once known, that encoding goes into hud/image.ts.
 */
import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  ImageContainerProperty,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
} from '@evenrealities/even_hub_sdk';

const W = 288;
const H = 144;
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d')!;

/** A test image that reveals orientation, mirroring, and value mapping at once. */
function drawTest(): Uint8ClampedArray {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  // Three value bands: dark / mid / bright (left→right).
  ctx.fillStyle = '#404040';
  ctx.fillRect(0, 0, W / 3, H);
  ctx.fillStyle = '#909090';
  ctx.fillRect(W / 3, 0, W / 3, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect((2 * W) / 3, 0, W / 3, H);
  // Bright square in the TOP-LEFT corner (orientation marker).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(4, 4, 22, 22);
  // Big dark asymmetric "R" (reveals flips/mirroring).
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 96px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('R', 120, 16);
  return ctx.getImageData(0, 0, W, H).data;
}

const lum = (d: Uint8ClampedArray, i: number): number =>
  0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;

function toB64(bytes: number[]): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.slice(i, i + CH));
  }
  return btoa(s);
}

type Fmt = { name: string; enc: (d: Uint8ClampedArray) => number[] | string };
const FORMATS: Fmt[] = [
  { name: 'base64png', enc: () => canvas.toDataURL('image/png').split(',')[1]! },
  { name: 'gray8', enc: (d) => bandGray8(d) },
  { name: 'gray8_b64', enc: (d) => toB64(bandGray8(d)) },
  { name: 'gray4_hi', enc: (d) => packed4(d, true) },
  { name: 'gray4_lo', enc: (d) => packed4(d, false) },
  { name: 'gray4_hi_b64', enc: (d) => toB64(packed4(d, true)) },
  { name: 'rgba', enc: (d) => Array.from(d) },
];

function bandGray8(d: Uint8ClampedArray): number[] {
  const out = new Array<number>(W * H);
  for (let p = 0; p < W * H; p++) out[p] = Math.round(lum(d, p * 4));
  return out;
}
function packed4(d: Uint8ClampedArray, hiFirst: boolean): number[] {
  const out: number[] = [];
  for (let p = 0; p < W * H; p += 2) {
    const a = Math.round(lum(d, p * 4) / 17);
    const b = Math.round(lum(d, (p + 1) * 4) / 17);
    out.push(hiFirst ? (a << 4) | b : (b << 4) | a);
  }
  return out;
}

let idx = 0;

async function push(bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>): Promise<void> {
  const f = FORMATS[idx % FORMATS.length]!;
  const data = drawTest();
  const encoded = f.enc(data);
  const label = `#${idx % FORMATS.length} ${f.name} len=${typeof encoded === 'string' ? 'b64:' + encoded.length : encoded.length}`;
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({ containerID: 2, contentOffset: 0, contentLength: label.length, content: label }),
  );
  const res = await bridge.updateImageRawData(
    new ImageRawDataUpdate({ containerID: 1, imageData: encoded }),
  );
  console.log('[probe]', label, '=> result', JSON.stringify(res));
}

async function boot(): Promise<void> {
  const bridge = await waitForEvenAppBridge();
  const page = new CreateStartUpPageContainer({
    containerTotalNum: 2,
    imageObject: [new ImageContainerProperty({ containerID: 1, xPosition: 0, yPosition: 0, width: W, height: H })],
    textObject: [
      new TextContainerProperty({
        containerID: 2,
        xPosition: 0,
        yPosition: 150,
        width: 576,
        height: 28,
        borderWidth: 0,
        isEventCapture: 1,
        content: 'probe ready',
      }),
    ],
  });
  const cr = await bridge.createStartUpPageContainer(page);
  console.log('[probe] createStartUpPageContainer =>', JSON.stringify(cr));
  await push(bridge);
  bridge.onEvenHubEvent((e) => {
    const t = e.sysEvent?.eventType ?? e.textEvent?.eventType ?? e.listEvent?.eventType;
    if (t !== undefined) {
      idx++;
      void push(bridge);
    }
  });
  const el = document.getElementById('status');
  if (el) el.textContent = 'probe running — click to cycle formats';
}

boot().catch((e) => console.error('[probe] fail', e));
