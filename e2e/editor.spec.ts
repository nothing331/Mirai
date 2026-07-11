import { expect, test } from "@playwright/test";

test("upload, select, and recolor an image", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").evaluate(async (input: HTMLInputElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 20;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#2878b8";
    context.fillRect(0, 0, 20, 20);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "sample.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByText("20 × 20px")).toBeVisible();
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  const initialX = Number(await canvas.getAttribute("data-viewport-x"));
  const initialY = Number(await canvas.getAttribute("data-viewport-y"));
  await page.mouse.move(bounds.x + initialX + 3, bounds.y + initialY + 3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + initialX + 17, bounds.y + initialY + 3, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 17, bounds.y + initialY + 17, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 3, bounds.y + initialY + 17, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId("apply-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByLabel("Recolor").fill("#22cc66");
  await page.getByTestId("apply-edit").click();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("2 accepted edits", { exact: true })).toBeVisible();

  const scaleBefore = await canvas.getAttribute("data-viewport-scale");
  await canvas.hover({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await page.mouse.wheel(0, -300);
  await expect(canvas).not.toHaveAttribute("data-viewport-scale", scaleBefore!);
  await page.getByRole("radio", { name: "Pan" }).click();
  const viewportBefore = await canvas.getAttribute("data-viewport-x");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute("data-viewport-x", viewportBefore!);

  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(canvas).toHaveAttribute("data-viewport-scale", "1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current image" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.readUInt32BE(16)).toBe(20);
  expect(png.readUInt32BE(20)).toBe(20);
});
