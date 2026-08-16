import { expect, test, type Page } from "@playwright/test";

test("fake asset generator creates a transparent, auto-saved project with no edit history", async ({ page }) => {
  const conceptName = `Orbital compass ${Date.now()}`;
  await page.goto("/");
  await expect(page.getByTestId("rail-asset-generator")).toBeVisible();
  const aiRailButtons = page.locator('[data-testid="rail-asset-generator"], [data-testid="open-lasso-edit"], [data-testid="open-transform"], [data-testid="open-extend"]');
  await expect(aiRailButtons).toHaveCount(4);
  await expect(page.getByTestId("rail-asset-generator")).toHaveClass(/bg-acid/);
  await expect(page.getByTestId("open-lasso-edit")).toHaveClass(/bg-ink/);
  await expect(page.getByTestId("open-transform")).toHaveClass(/bg-acid/);
  await expect(page.getByTestId("open-extend")).toHaveClass(/bg-acid/);
  const aiButtonPositions = await aiRailButtons.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
  expect(aiButtonPositions).toEqual([...aiButtonPositions].sort((left, right) => left - right));
  const brushTop = await page.getByRole("radio", { name: "Brush" }).evaluate((button) => button.getBoundingClientRect().top);
  expect(aiButtonPositions.at(-1)).toBeLessThan(brushTop);
  await expect(page.locator("header").getByRole("button", { name: "Create with AI" })).toHaveCount(0);
  await page.getByTestId("rail-asset-generator").click();
  const dialog = page.getByRole("dialog", { name: "Create with AI" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("One low-quality result", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Logo Mark" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { name: "Icon" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Create Image" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Transform/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("Color 1")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Custom" }).click();
  await expect(dialog.getByLabel("Color 1")).toBeVisible();
  await dialog.getByRole("button", { name: "Auto" }).click();
  await dialog.getByTestId("asset-description").fill(conceptName);
  await dialog.getByTestId("generate-assets").click();
  await expect(dialog.getByTestId("asset-candidate-1")).toBeVisible();
  await expect(dialog.getByTestId("asset-candidate-2")).toHaveCount(0);
  await expect(dialog.getByText("Transparent PNG")).toHaveCount(1);
  await dialog.getByTestId("use-generated-asset").click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("1024 × 1024px")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Open saved project").locator("option", { hasText: conceptName })).toHaveCount(1);
  await page.getByRole("button", { name: "Diagnostics" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(diagnostics.getByText(/fake · asset-generation · review/)).toBeVisible();
  await expect(diagnostics.getByText("A1 / Provider result")).toBeVisible();
  await expect(diagnostics.getByText("A1 / Ready result")).toBeVisible();
});

test("AI creator applies a treatment and destination format to one complete image", async ({ page }) => {
  const imageConcept = `Mount Everest at sunrise ${Date.now()}`;
  await page.goto("/");
  await page.getByTestId("rail-asset-generator").click();
  const dialog = page.getByRole("dialog", { name: "Create with AI" });

  await dialog.getByRole("tab", { name: "Create Image" }).click();
  await expect(dialog.getByRole("button", { name: /Auto/ })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: /Sketch/ }).click();
  await dialog.getByRole("button", { name: /Story \/ Reel/ }).click();
  await dialog.getByTestId("asset-description").fill(imageConcept);
  await expect(dialog.getByTestId("asset-description")).toHaveValue(imageConcept);
  await dialog.getByTestId("generate-assets").click();
  const generated = dialog.getByTestId("asset-candidate-1");
  await expect(generated).toBeVisible();
  await expect(generated.getByText("720 × 1280")).toBeVisible();
  await expect(generated.getByText("Complete PNG")).toBeVisible();
  await expect(dialog.getByTestId("asset-candidate-2")).toHaveCount(0);
  await expect(dialog.getByTestId("transform-source-input")).toHaveCount(0);

  await page.route("**/api/asset-generations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary provider failure.", retryable: true, imageGenerationAttempted: true }) });
      return;
    }
    await route.continue();
  });
  await dialog.getByTestId("generate-assets").click();
  await expect(dialog.getByRole("alert")).toContainText("Temporary provider failure. You can try again.");
  await expect(generated).toBeVisible();
  await page.unroute("**/api/asset-generations");

  await dialog.getByTestId("use-generated-asset").click();
  const savedOption = page.getByLabel("Open saved project").locator("option", { hasText: `${imageConcept} image` });
  await expect(savedOption).toHaveCount(1);
  const savedProjectId = await savedOption.getAttribute("value");
  const savedProject = await page.evaluate(async (projectId) => fetch(`/api/projects/${projectId}`).then((response) => response.json()), savedProjectId);
  expect(savedProject.origin).toMatchObject({ creationMode: "image", treatment: "sketch", format: "story-reel", width: 720, height: 1280 });
  expect(savedProject.operations).toHaveLength(0);
});

async function uploadTestImage(page: Page, width = 20, height = 20) {
  await page.getByTestId("file-input").evaluate(async (input: HTMLInputElement, dimensions) => {
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#2878b8";
    context.fillRect(0, 0, 20, 20);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "sample.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { width, height });
  const editorCanvas = page.getByTestId("editor-canvas");
  await expect(editorCanvas).toBeVisible();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-viewport-x"))).toBeGreaterThan(0);
}

async function clickSourcePoint(page: Page, sourceX: number, sourceY: number) {
  const editorCanvas = page.getByTestId("editor-canvas");
  await editorCanvas.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const viewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const viewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const viewportScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  await editorCanvas.locator("canvas").first().click({
    position: {
      x: viewportX + sourceX * viewportScale,
      y: viewportY + sourceY * viewportScale,
    },
  });
}

async function drawSourceSelection(page: Page, left = 3, top = 3, right = 17, bottom = 17) {
  const editorCanvas = page.getByTestId("editor-canvas");
  await editorCanvas.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const bounds = await editorCanvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  const viewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const viewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const viewportScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const point = (x: number, y: number) => ({ x: bounds.x + viewportX + x * viewportScale, y: bounds.y + viewportY + y * viewportScale });
  const start = point(left, top);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [x, y] of [[right, top], [right, bottom], [left, bottom], [left, top]]) {
    const next = point(x, y);
    await page.mouse.move(next.x, next.y, { steps: 4 });
  }
  await page.mouse.up();
}

test("upload, select, and recolor an image", async ({ page }) => {
  const projectName = `Playwright project ${Date.now()}`;
  await page.goto("/");
  const canvasRegion = page.getByRole("region", { name: "Image canvas" });
  const inspector = page.getByRole("complementary", { name: "Editor tools" });
  const canvasTop = (await canvasRegion.boundingBox())?.y;
  await inspector.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  expect((await canvasRegion.boundingBox())?.y).toBe(canvasTop);
  expect(await page.evaluate(() => ({ pageY: window.scrollY, viewportLocked: document.documentElement.scrollHeight === document.documentElement.clientHeight }))).toEqual({ pageY: 0, viewportLocked: true });
  await inspector.evaluate((element) => element.scrollTo({ top: 0 }));
  await uploadTestImage(page);
  await expect(page.getByText("20 × 20px")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose an edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Draw selection on canvas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add area" })).toHaveCount(0);
  const operationTop = (await page.getByText("Edit operation", { exact: true }).boundingBox())?.y;
  const selectionTop = (await page.getByText("Selection area", { exact: true }).boundingBox())?.y;
  if (operationTop === undefined || selectionTop === undefined) throw new Error("Lasso inspector sections are not visible.");
  expect(operationTop).toBeLessThan(selectionTop);
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  const initialX = Number(await canvas.getAttribute("data-viewport-x"));
  const initialY = Number(await canvas.getAttribute("data-viewport-y"));
  await expect(page.getByRole("heading", { name: "Mirai" })).toBeVisible();
  await expect(page.getByLabel("Size", { exact: true })).toHaveCount(0);
  await page.mouse.move(bounds.x + initialX + 2, bounds.y + initialY + 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + initialX + 17, bounds.y + initialY + 2, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 17, bounds.y + initialY + 17, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 2, bounds.y + initialY + 17, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 2, bounds.y + initialY + 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Edit selected area" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add area" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subtract area" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove selection" })).toBeVisible();
  await page.getByRole("button", { name: "Remove selection" }).click();
  await expect(page.getByRole("button", { name: "Remove selection" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Choose an edit" })).toBeVisible();
  await drawSourceSelection(page);
  await page.getByRole("button", { name: "Add area" }).click();
  await expect(page.getByLabel("Refine size", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Edge softness")).toBeVisible();
  await expect(canvas).toHaveClass(/tool-lasso/);
  await page.getByRole("button", { name: "Collapse inspector" }).click();
  await expect(page.getByTestId("editor-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(page.getByTestId("editor-inspector")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Lasso edit" })).toBeChecked();
  await canvas.locator("canvas").first().click({ position: { x: initialX + 10, y: initialY + 10 } });
  await page.getByTestId("apply-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("redo")).toBeEnabled();
  await page.getByTestId("redo").click();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Open saved project").locator("option", { hasText: projectName })).toHaveCount(1);
  await page.getByLabel("Recolor").fill("#22cc66");
  await page.getByTestId("apply-edit").click();
  await expect(page.getByText("Draw a closed selection before previewing the edit.").first()).toBeVisible();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();

  const scaleBefore = await canvas.getAttribute("data-viewport-scale");
  await canvas.hover({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await page.mouse.wheel(0, -300);
  await expect(canvas).not.toHaveAttribute("data-viewport-scale", scaleBefore!);
  await page.getByRole("radio", { name: "Hand" }).click();
  await expect(page.getByLabel("Size", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Softness")).toHaveCount(0);
  const viewportBefore = await canvas.getAttribute("data-viewport-x");
  const panBounds = await canvas.boundingBox();
  if (!panBounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(panBounds.x + panBounds.width / 2, panBounds.y + panBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(panBounds.x + panBounds.width / 2 + 60, panBounds.y + panBounds.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute("data-viewport-x", viewportBefore!);

  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(canvas).toHaveAttribute("data-viewport-scale", "1");
  await page.keyboard.press("l");
  await expect(page.getByRole("radio", { name: "Lasso edit" })).toBeChecked();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current image" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.readUInt32BE(16)).toBe(20);
  expect(png.readUInt32BE(20)).toBe(20);

  await page.reload();
  await page.route(/\/api\/projects\/[^/]+$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.getByLabel("Open saved project").selectOption({ label: projectName });
  await expect(page.getByTestId("project-loading-overlay")).toBeVisible();
  await expect(page.getByText("Opening project")).toBeVisible();
  await expect(page.getByText("Opening…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await expect(page.getByText(/20.+20px/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Diagnostics" })).toBeEnabled();
});

test("brush paint is draft-only until applied and eraser only clears that draft", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page);
  await page.getByRole("radio", { name: "Brush" }).click();
  await expect(page.getByRole("heading", { name: "Brush" })).toBeVisible();
  await expect(page.getByTestId("generate-edit")).toHaveCount(0);
  await page.getByLabel("Brush color").fill("#ff0000");
  await clickSourcePoint(page, 5, 5);
  await expect(page.getByText("1 pending gesture")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Eraser" }).click();
  await expect(page.getByText(/original image is never erased/i)).toBeVisible();
  await clickSourcePoint(page, 5, 5);
  await expect(page.getByText("2 pending gestures")).toBeVisible();
  await page.getByTestId("discard-paint").click();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByTestId("apply-paint")).toBeDisabled();

  await page.getByRole("radio", { name: "Brush" }).click();
  await clickSourcePoint(page, 5, 5);
  await clickSourcePoint(page, 15, 15);
  await page.getByTestId("apply-paint").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("redo")).toBeEnabled();

  await page.getByRole("radio", { name: "Hand" }).click();
  await expect(page.getByTestId("editor-inspector")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open inspector" })).toHaveCount(0);
  await page.keyboard.press("l");
  await expect(page.getByRole("radio", { name: "Lasso edit" })).toBeChecked();
  await expect(page.getByTestId("editor-inspector")).toBeVisible();
});

test("text, watermark, and crop stay live on canvas and apply without comparison", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page, 320, 200);
  await expect(page.getByText("320 × 200px", { exact: true })).toBeVisible();
  const editorCanvas = page.getByTestId("editor-canvas");
  const sceneCanvas = editorCanvas.locator("canvas").first();

  await page.getByTestId("open-text").click();
  await expect(editorCanvas).toHaveAttribute("data-local-draft", "text");
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  const initialTextCanvas = await sceneCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByLabel("Text content").fill("VISIBLE NOW");
  await expect.poll(() => sceneCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(initialTextCanvas);
  const textX = Number(await editorCanvas.getAttribute("data-draft-x"));
  const textY = Number(await editorCanvas.getAttribute("data-draft-y"));
  const textWidth = Number(await editorCanvas.getAttribute("data-draft-width"));
  const textHeight = Number(await editorCanvas.getAttribute("data-draft-height"));
  const textViewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const textViewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const textScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const textBounds = await editorCanvas.boundingBox();
  if (!textBounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(textBounds.x + textViewportX + (textX + textWidth / 2) * textScale, textBounds.y + textViewportY + (textY + textHeight / 2) * textScale);
  await page.mouse.down();
  await page.mouse.move(textBounds.x + textViewportX + (textX + textWidth / 2 + 45) * textScale, textBounds.y + textViewportY + (textY + textHeight / 2 + 20) * textScale, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-draft-x"))).not.toBe(textX);
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByTestId("open-watermark").click();
  await expect(page.getByRole("dialog", { name: "Save your text?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(editorCanvas).toHaveAttribute("data-local-draft", "text");
  await page.getByTestId("open-watermark").click();
  await page.getByTestId("save-local-edit").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);

  await expect(editorCanvas).toHaveAttribute("data-local-draft", "watermark");
  await page.getByRole("button", { name: "Watermark center" }).click();
  const initialX = Number(await editorCanvas.getAttribute("data-draft-x"));
  const initialY = Number(await editorCanvas.getAttribute("data-draft-y"));
  const viewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const viewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const scale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const bounds = await editorCanvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(bounds.x + viewportX + (initialX + 40) * scale, bounds.y + viewportY + (initialY + 6) * scale);
  await page.mouse.down();
  await page.mouse.move(bounds.x + viewportX + (initialX + 80) * scale, bounds.y + viewportY + (initialY + 30) * scale, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-draft-x"))).not.toBe(initialX);
  await expect(editorCanvas).toHaveAttribute("data-draft-anchor", "free");
  await page.getByRole("button", { name: "Watermark center" }).click();
  await page.getByTestId("open-size-position").click();
  await expect(page.getByRole("dialog", { name: "Save your watermark?" })).toBeVisible();
  await page.getByTestId("save-local-edit").click();
  await expect(page.getByText("2 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);

  await expect(editorCanvas).toHaveAttribute("data-local-draft", "crop");
  await page.getByLabel("Crop aspect ratio").selectOption("1:1");
  await expect(page.getByLabel("Crop width")).toHaveValue("200");
  const cropX = Number(await editorCanvas.getAttribute("data-draft-x"));
  const cropY = Number(await editorCanvas.getAttribute("data-draft-y"));
  const cropWidth = Number(await editorCanvas.getAttribute("data-draft-width"));
  const cropHeight = Number(await editorCanvas.getAttribute("data-draft-height"));
  const cropViewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const cropViewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const cropScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const cropBounds = await editorCanvas.boundingBox();
  if (!cropBounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(cropBounds.x + cropViewportX + (cropX + cropWidth) * cropScale, cropBounds.y + cropViewportY + (cropY + cropHeight) * cropScale);
  await page.mouse.down();
  await page.mouse.move(cropBounds.x + cropViewportX + (cropX + cropWidth - 50) * cropScale, cropBounds.y + cropViewportY + (cropY + cropHeight - 50) * cropScale, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-draft-width"))).toBeLessThan(cropWidth);
  await page.getByRole("radio", { name: "Lasso edit" }).click();
  await expect(page.getByRole("dialog", { name: "Save your crop?" })).toBeVisible();
  await page.getByTestId("save-local-edit").click();
  await expect(page.getByText("150 × 150px", { exact: true })).toBeVisible();
  await expect(page.getByText("3 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
});

test("Transform works without a selection for local and generative presets", async ({ page }) => {
  const projectName = `Transform project ${Date.now()}`;
  await page.goto("/");
  await uploadTestImage(page);

  const toolRail = page.getByRole("complementary", { name: "Editor tools" });
  for (const label of ["Lasso edit", "Brush", "Eraser", "Hand", "AI Transform"]) {
    await toolRail.getByLabel(label, { exact: true }).hover();
    await expect(toolRail.locator(`[data-tooltip="${label}"]`)).toBeVisible();
  }
  await toolRail.getByLabel("Collapse inspector").hover();
  await expect(toolRail.locator('[data-tooltip="Collapse inspector"]')).toBeVisible();
  await toolRail.getByTestId("open-transform").click();
  const transform = page.getByTestId("transform-inspector");
  await expect(transform).toBeVisible();
  await expect(transform.getByText("5 presets + custom")).toBeVisible();
  await expect(transform.getByRole("radio", { name: "Faithful" })).toBeChecked();
  await transform.getByRole("radio", { name: /Monochrome/ }).click();
  await expect(transform.getByText(/no model call/i)).toBeVisible();
  await transform.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();

  await page.getByTestId("undo").click();
  await page.keyboard.press("t");
  await transform.getByRole("radio", { name: /Anime Theme/ }).click();
  await transform.getByLabel("Transformation prompt").fill("Warm nostalgic evening light");
  await transform.getByRole("radio", { name: "Faithful" }).click();
  await transform.getByLabel("Development scenario").selectOption("success");
  await transform.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(transform.getByTestId("generate-transform")).toBeDisabled();
  await expect(transform.getByText("Review on canvas")).toBeVisible();
  await page.getByRole("button", { name: "Adjust" }).click();
  await expect(transform).toBeVisible();
  await expect(transform.getByLabel("Transformation prompt")).toHaveValue("Warm nostalgic evening light");
  await transform.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();
  await page.reload();
  await page.getByLabel("Open saved project").selectOption({ label: projectName });
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
});

test("Extend plans a target frame before generating and accepts changed dimensions", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page);
  const toolRail = page.getByRole("complementary", { name: "Editor tools" });
  await toolRail.getByLabel("AI Extend", { exact: true }).hover();
  await expect(toolRail.locator('[data-tooltip="AI Extend"]')).toBeVisible();
  await page.getByTestId("open-extend").click();
  const inspector = page.getByTestId("extend-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("radio", { name: "Smart Reframe" })).toBeChecked();
  await inspector.getByRole("radio", { name: /Story \/ Reel/ }).click();
  await inspector.getByRole("button", { name: "Preview smart frame" }).click();
  await expect(page.getByTestId("extend-plan-canvas")).toBeVisible();
  await expect(page.getByTestId("extend-plan-summary")).toContainText("18 × 32px");
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await inspector.getByRole("button", { name: "Generate extension" }).click();
  await expect(page.getByTestId("extend-processing-overlay")).toBeVisible();
  await expect(page.getByText(/Generating surroundings|Preparing comparison/).first()).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("Complete AI extension")).toBeVisible();
  await expect(page.getByTestId("comparison-source")).toBeVisible();
  await expect(page.getByTestId("comparison-candidate")).toBeVisible();
  await expect(page.getByRole("img", { name: "Original image" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Generated preview" })).toBeVisible();
  await page.getByRole("button", { name: "Diagnostics" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(diagnostics.getByRole("img", { name: "11 / Final preview" })).toBeVisible();
  await expect(diagnostics.getByRole("link", { name: "Open Extend plan" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Adjust frame" }).click();
  await expect(page.getByTestId("extend-plan-canvas")).toBeVisible();
  await inspector.getByRole("button", { name: "Generate extension" }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("18 × 32px")).toBeVisible();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByTestId("undo").click();
  await expect(page.getByText("20 × 20px")).toBeVisible();
  await page.getByTestId("redo").click();
  await expect(page.getByText("18 × 32px")).toBeVisible();
});

test("fake provider supports generative success, retry, and failure states", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page);
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await drawSourceSelection(page);
  await expect(canvas).toHaveClass(/tool-lasso/);

  await page.getByRole("radio", { name: "Remove" }).click();
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByLabel("AI edit behavior")).toHaveValue("review");
  await expect(page.getByText("Fake provider scenario")).toBeVisible();
  const scenario = page.getByLabel("Fake provider scenario");
  await scenario.selectOption("success");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Diagnostics" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.getByText("Visual chain of custody")).toBeVisible();
  await expect(diagnostics.getByText("01 / Source")).toBeVisible();
  await expect(diagnostics.getByText("11 / Final preview")).toBeVisible();
  await expect(diagnostics.getByText("10 / Change map")).toBeVisible();
  await expect(diagnostics.getByText("Candidate scope diagnosis")).toBeVisible();
  await expect(diagnostics.getByText("Browser preserved the complete normalized provider candidate.")).toBeVisible();
  await diagnostics.getByRole("button", { name: "Pin evidence" }).click();
  await expect(diagnostics.getByRole("button", { name: "Unpin" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Unpin" }).click();
  await expect(diagnostics.getByRole("button", { name: "Pin evidence" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Copy for coding agent" }).click();
  await expect(diagnostics.getByRole("button", { name: "Copied" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Add / replace" }).click();
  await page.getByLabel("Edit instruction", { exact: true }).fill("add an Indian flag");
  await scenario.selectOption("success");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByRole("button", { name: "Diagnostics" }).click();
  await expect(diagnostics.getByText("2 recorded calls in this logical request.")).toBeVisible();
  await expect(diagnostics.getByText("Structured edit plan")).toBeVisible();
  await expect(diagnostics.getByText(/surface_graphic/).first()).toBeVisible();
  await expect(diagnostics.getByRole("link", { name: "Open edit plan" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Discard" }).click();

  await page.getByRole("radio", { name: "Restyle" }).click();
  await page.getByLabel("Edit instruction", { exact: true }).fill("brushed copper");
  await scenario.selectOption("slow");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByTestId("generate-edit")).toContainText("Processing…");
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Remove" }).click();
  await scenario.selectOption("retryable-error");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByText("The fake provider is temporarily unavailable.").first()).toBeVisible();
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page.getByRole("button", { name: "Retry same request" })).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await scenario.selectOption("fatal-error");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByText("The fake provider rejected this edit.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry same request" })).toHaveCount(0);
  await page.getByRole("button", { name: "View diagnostics" }).click();
  const reopenedDiagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(reopenedDiagnostics.getByText("The fake provider rejected this edit.").first()).toBeVisible();
  await expect(reopenedDiagnostics.getByText("failed", { exact: true }).first()).toBeVisible();

  const requestEntries = reopenedDiagnostics.getByRole("complementary", { name: "Diagnostic requests" }).locator("button:has(code)");
  await expect(requestEntries).toHaveCount(6);
  const olderRequestId = await requestEntries.nth(1).locator("code").innerText();
  await requestEntries.nth(1).click();
  await expect(reopenedDiagnostics.getByRole("button", { name: `Request ID ${olderRequestId}` })).toBeVisible();
  await reopenedDiagnostics.getByRole("button", { name: "Refresh" }).click();
  await expect(reopenedDiagnostics.getByRole("button", { name: `Request ID ${olderRequestId}` })).toBeVisible();
});

test("compact workspace preserves edit configuration when the inspector collapses", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 727 });
  await page.goto("/");
  await uploadTestImage(page);
  await page.getByRole("radio", { name: "Add / replace" }).click();
  await page.getByLabel("Edit instruction", { exact: true }).fill("add a small paper lantern");
  await page.getByRole("button", { name: "Collapse inspector" }).click();
  await expect(page.getByTestId("editor-inspector")).toHaveCount(0);
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(page.getByLabel("Edit instruction", { exact: true })).toHaveValue("add a small paper lantern");
  await expect(page.getByRole("radio", { name: "Add / replace" })).toBeChecked();
  await expect.poll(() => page.evaluate(() => ({ vertical: document.documentElement.scrollHeight === document.documentElement.clientHeight, horizontal: document.documentElement.scrollWidth === document.documentElement.clientWidth }))).toEqual({ vertical: true, horizontal: true });
});
