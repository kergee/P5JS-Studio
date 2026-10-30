# 本地 ml5.js 模型

可选兼容示例；文件齐全不代表已通过离线运行验收。


ml5 示例要离线运行，需要把 JavaScript 库和模型文件都放进草图可访问的本地库路径。常见共享目录结构如下：

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

然后在草图 `meta.json` 中声明 ml5：

```json
{
  "files": ["sketch.js"],
  "libraries": ["libraries/ml5.min.js"]
}
```

对于支持模型 URL 选项的 ml5 模型，把这些选项指向本地 `model.json`：

```js
const depth = await ml5.depthEstimation("ARPortraitDepth", {
  depthModelUrl: "libraries/ml5-models/ar_portrait_depth/model.json",
  segmentationModelUrl: "libraries/ml5-models/selfie_segmentation_general/model.json",
  applySegmentationMask: false
});
```

FaceMesh、HandPose 这类 MediaPipe 后端模型，保持 `runtime: "mediapipe"`，并把 `solutionPath` 指向本地 MediaPipe 包目录：

```js
const faceMesh = await ml5.faceMesh({
  runtime: "mediapipe",
  maxFaces: 1,
  flipHorizontal: true,
  solutionPath: "libraries/mediapipe/face_mesh"
});
```

`ml5.sentiment()` 要继续使用 `"MovieReviews"` 作为模型名，不要直接传本地文件夹路径。P5JS Studio 会在本地存在 `libraries/ml5-models/sentiment_cnn_v1/` 时，把 ml5 默认访问的 `sentiment_cnn_v1` 模型地址重定向到本地：

```js
const sentiment = await ml5.sentiment("MovieReviews");
const result = await sentiment.predict("I love this sketch");
```

后续其它 ml5 模型也按同一思路迁移：下载该模型的 `model.json`、元数据文件和所有权重分片，保持原始相对文件名，放到 `public/libraries/ml5-models/<model-name>/`，然后在代码里通过对应模型支持的选项传入本地 `model.json`，常见选项名包括 `modelUrl`、`modelURL`、`detectorModelUrl`、`landmarkModelUrl` 或模型自己的 URL 选项。如果该模型使用的是 MediaPipe solution 包而不是 TFJS 权重分片，就复制整个 MediaPipe 包目录，并使用 `solutionPath`。

### 离线优先

p5.js v1 和 p5.sound 会在构建时通过 Vite raw import 打包进应用，因此草图运行不需要联网。
