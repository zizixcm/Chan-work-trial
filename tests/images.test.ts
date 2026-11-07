import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateFile } from "../lib/validation";
test("validates pictures by decoded content, including JPEG extension alias", async () => {
  const image = sharp({
    create: { width: 20, height: 20, channels: 3, background: "#f4f1e8" },
  });
  const jpeg = await image.clone().jpeg().toBuffer();
  assert.equal(await validateFile("scan.JPG", jpeg), "image/jpeg");
  assert.equal(await validateFile("scan.jpeg", jpeg), "image/jpeg");
  assert.equal(
    await validateFile("scan.png", await image.clone().png().toBuffer()),
    "image/png",
  );
  assert.equal(
    await validateFile("scan.webp", await image.clone().webp().toBuffer()),
    "image/webp",
  );
  await assert.rejects(validateFile("renamed.png", jpeg), /picture/);
  await assert.rejects(
    validateFile("fake.jpg", Buffer.from("not a picture")),
    /picture/,
  );
  await assert.rejects(
    validateFile("truncated.jpg", jpeg.subarray(0, 100)),
    /picture/,
  );
  await assert.rejects(validateFile("scan.heic", jpeg), /export a JPG/);
  const large = await sharp({
    create: { width: 6400, height: 6400, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(validateFile("large.png", large), /40 megapixels/);
});
