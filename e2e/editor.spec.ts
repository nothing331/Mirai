import { expect, test } from "@playwright/test";

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
  await expect.poll(async () => Number(await canvas.getAttribute("data-viewport-x"))).toBeGreaterThan(0);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  const initialX = Number(await canvas.getAttribute("data-viewport-x"));
  const initialY = Number(await canvas.getAttribute("data-viewport-y"));
  await page.getByRole("radio", { name: "Brush" }).click();
  await expect(canvas).toHaveClass(/tool-brush/);
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
  await page.getByRole("radio", { name: "Pan" }).click();
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
  await page.getByLabel("Open saved project").selectOption({ label: projectName });
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await expect(page.getByText(/20.+20px/)).toBeVisible();
});

test("fake provider supports generative success, retry, and failure states", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").evaluate(async (input: HTMLInputElement) => {
    const source = document.createElement("canvas");
    source.width = 20;
    source.height = 20;
    const context = source.getContext("2d")!;
    context.fillStyle = "#2878b8";
    context.fillRect(0, 0, 20, 20);
    const blob = await new Promise<Blob>((resolve) => source.toBlob((value) => resolve(value!), "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "sample.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await canvas.getAttribute("data-viewport-x"))).toBeGreaterThan(0);
  const imageX = Number(await canvas.getAttribute("data-viewport-x"));
  const imageY = Number(await canvas.getAttribute("data-viewport-y"));
  await page.getByRole("radio", { name: "Brush" }).click();
  await expect(canvas).toHaveClass(/tool-brush/);
  await canvas.locator("canvas").first().click({ position: { x: imageX + 10, y: imageY + 10 } });

  await page.getByRole("radio", { name: "Remove" }).click();
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

test("local transform, text, and watermark tools create reversible persisted versions", async ({ page }) => {
  const projectName = `Local tools ${Date.now()}`;
  const browserProblems: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") browserProblems.push(message.text()); });
  await page.goto("/");
  await page.getByTestId("file-input").evaluate(async (input: HTMLInputElement) => {
    const source = document.createElement("canvas");
    source.width = 320; source.height = 200;
    const context = source.getContext("2d")!;
    context.fillStyle = "#237497"; context.fillRect(0, 0, 320, 200);
    context.fillStyle = "#d8f441"; context.fillRect(40, 35, 130, 90);
    context.fillStyle = "#ef4b32"; context.beginPath(); context.arc(245, 110, 52, 0, Math.PI * 2); context.fill();
    const blob = await new Promise<Blob>((resolve) => source.toBlob((value) => resolve(value!), "image/png"));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], "local-tools.png", { type: "image/png" }));
    input.files = transfer.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByText("320 × 200px", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Transform", exact: true }).click();
  await page.getByLabel("Crop aspect ratio").selectOption("1:1");
  await expect(page.getByLabel("Crop x")).toHaveValue("60");
  await expect(page.getByLabel("Crop width")).toHaveValue("200");
  await page.getByTestId("review-local-edit").click();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("200 × 200px", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page.getByTestId("review-local-edit").click();
  await page.getByTestId("accept-preview").click();
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  await page.getByRole("button", { name: "Flip vertical", exact: true }).click();
  await page.getByTestId("review-local-edit").click();
  await page.getByTestId("accept-preview").click();

  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await page.getByLabel("Lock aspect ratio").uncheck();
  await page.getByLabel("Width").fill("120");
  await page.getByLabel("Height").fill("80");
  await page.getByTestId("review-local-edit").click();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("120 × 80px", { exact: true })).toBeVisible();
  await expect(page.getByText("4 accepted edits", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Text content").fill("MIRAI TEST");
  await page.getByLabel("Font", { exact: true }).selectOption("Georgia");
  await page.getByLabel("Font size", { exact: true }).fill("14");
  await page.getByTestId("review-local-edit").click();
  await page.getByTestId("accept-preview").click();

  await page.getByRole("button", { name: "Watermark", exact: true }).click();
  await page.getByLabel("Watermark text").fill("© TEST");
  await page.getByRole("button", { name: "Watermark center", exact: true }).click();
  await page.getByTestId("review-local-edit").click();
  await page.getByTestId("accept-preview").click();

  await page.getByRole("button", { name: "Add watermark", exact: true }).click();
  await page.getByRole("button", { name: "Logo", exact: true }).click();
  await page.locator('section[aria-label="Watermark controls"] input[type="file"]').evaluate(async (input: HTMLInputElement) => {
    const logo = document.createElement("canvas"); logo.width = 100; logo.height = 40;
    const context = logo.getContext("2d")!; context.fillStyle = "rgba(0,0,0,0)"; context.clearRect(0, 0, 100, 40);
    context.fillStyle = "white"; context.font = "bold 24px sans-serif"; context.fillText("MIRAI", 4, 29);
    const blob = await new Promise<Blob>((resolve) => logo.toBlob((value) => resolve(value!), "image/png"));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], "watermark.png", { type: "image/png" }));
    input.files = transfer.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByText("Replace PNG logo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Watermark south-east", exact: true }).click();
  await page.getByTestId("review-local-edit").click();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("7 accepted edits", { exact: true })).toBeVisible();

  await page.getByTestId("undo").click();
  await expect(page.getByTestId("redo")).toBeEnabled();
  await page.getByTestId("redo").click();

  await page.getByLabel("Project name").fill(projectName);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Open saved project").locator("option", { hasText: projectName })).toHaveCount(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current image", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.readUInt32BE(16)).toBe(120); expect(png.readUInt32BE(20)).toBe(80);

  await page.reload();
  await page.getByLabel("Open saved project").selectOption({ label: projectName });
  await expect(page.getByText("7 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByText("120 × 80px", { exact: true })).toBeVisible();
  expect(browserProblems).toEqual([]);
});
