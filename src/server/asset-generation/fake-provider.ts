import sharp from "sharp";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import type { AssetGenerator, AssetGeneratorRequest, AssetGeneratorResult } from "./contracts";

/** Produces one stable local result for each creation mode without a paid model call. */
export class FakeAssetGenerator implements AssetGenerator {
  async generate(request: AssetGeneratorRequest, diagnostics?: ImageEditDiagnosticSink): Promise<AssetGeneratorResult> {
    await diagnostics?.beginProviderCall("asset-generator", "fake", "fake-asset-generator");
    await diagnostics?.event("provider-call", `Generating one local ${request.mode} result.`);
    const candidates = [{ ordinal: 0, png: new Uint8Array(await renderCandidate(request)) }];
    const providerRequestId = `fake-asset-${crypto.randomUUID()}`;
    await diagnostics?.completeProviderCall("asset-generator", providerRequestId, { candidates: candidates.length });
    return { candidates, providerRequestId };
  }
}

async function renderCandidate(request: AssetGeneratorRequest): Promise<Buffer> {
  if (request.mode === "transform" && request.sourcePng) {
    const wash = Buffer.from(`<svg width="${request.width}" height="${request.height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d8f441" stop-opacity=".18"/><stop offset="1" stop-color="#16c7df" stop-opacity=".10"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    return sharp(request.sourcePng).resize(request.width, request.height, { fit: "cover" }).modulate({ brightness: 1.04, saturation: 1.12 }).composite([{ input: wash }]).png().toBuffer();
  }
  if (request.mode === "image") {
    const width = request.width;
    const height = request.height;
    const svg = Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17324d"/><stop offset=".55" stop-color="#ef4b32"/><stop offset="1" stop-color="#f5b95f"/></linearGradient><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#283329"/><stop offset="1" stop-color="#101512"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#sky)"/><circle cx="${Math.round(width * .72)}" cy="${Math.round(height * .28)}" r="${Math.round(Math.min(width, height) * .1)}" fill="#fff4bf"/><path d="M0 ${Math.round(height * .68)} Q ${Math.round(width * .22)} ${Math.round(height * .42)} ${Math.round(width * .46)} ${Math.round(height * .68)} T ${width} ${Math.round(height * .58)} V ${height} H0Z" fill="#36483d"/><path d="M0 ${Math.round(height * .78)} Q ${Math.round(width * .3)} ${Math.round(height * .56)} ${Math.round(width * .58)} ${Math.round(height * .78)} T ${width} ${Math.round(height * .7)} V ${height} H0Z" fill="url(#land)"/></svg>`);
    return sharp(svg).png().toBuffer();
  }
  const primary = request.colors[0] ?? "#171714";
  const secondary = request.colors[1] ?? "#d8f441";
  const artwork = `<circle cx="512" cy="512" r="250" fill="${primary}"/><path d="M512 280 704 512 512 744 320 512Z" fill="${secondary}"/><circle cx="512" cy="512" r="74" fill="${primary}"/>`;
  const svg = Buffer.from(`<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${artwork}</svg>`);
  return sharp({ create: { width: request.width, height: request.height, channels: 4, background: request.matteColor ?? "#00ff66" } })
    .composite([{ input: svg }])
    .png()
    .toBuffer();
}
