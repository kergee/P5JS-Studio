# Local ml5.js Models

Optional compatibility examples. Complete files do not prove offline execution.


ml5 examples can run offline when both the JavaScript library and the model files are stored in the sketch library paths. A common shared layout is:

```text
sketches/
  public/
    libraries/
      ml5.min.js
      ml5-models/
        sentiment_cnn_v1/
          model.json
          metadata.json
          group1-shard1of1
        ar_portrait_depth/
          model.json
          group1-shard1of3.bin
        selfie_segmentation_general/
          model.json
          group1-shard1of1.bin
```

Then declare ml5 in the sketch `meta.json`:

```json
{
  "files": ["sketch.js"],
  "libraries": ["libraries/ml5.min.js"]
}
```

For ml5 models that accept model URL options, point those options at local `model.json` files:

```js
const depth = await ml5.depthEstimation("ARPortraitDepth", {
  depthModelUrl: "libraries/ml5-models/ar_portrait_depth/model.json",
  segmentationModelUrl: "libraries/ml5-models/selfie_segmentation_general/model.json",
  applySegmentationMask: false
});
```

For MediaPipe-backed models such as FaceMesh or HandPose, keep the runtime on MediaPipe and set `solutionPath` to the local MediaPipe package folder:

```js
const faceMesh = await ml5.faceMesh({
  runtime: "mediapipe",
  maxFaces: 1,
  flipHorizontal: true,
  solutionPath: "libraries/mediapipe/face_mesh"
});
```

For `ml5.sentiment()`, keep the model name as `"MovieReviews"` rather than passing a folder path. P5JS Studio redirects ml5's default `sentiment_cnn_v1` model URL to `libraries/ml5-models/sentiment_cnn_v1/` when those files exist locally:

```js
const sentiment = await ml5.sentiment("MovieReviews");
const result = await sentiment.predict("I love this sketch");
```

For other ml5 models, use the same pattern: download the model's `model.json`, metadata files, and all weight shard files; preserve their relative filenames; put them under `public/libraries/ml5-models/<model-name>/`; then pass the local `model.json` through the ml5 option used by that model, such as `modelUrl`, `modelURL`, `detectorModelUrl`, `landmarkModelUrl`, or a model-specific URL option. If the model uses a MediaPipe solution package instead of TFJS weight shards, copy the whole MediaPipe package folder and use `solutionPath`.

### Offline-first

p5.js v1 and p5.sound are bundled into the app at build time through Vite raw imports, so sketches can run without an internet connection.
