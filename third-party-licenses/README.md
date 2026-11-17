# Runtime redistribution notices

These notices are intentionally distinct from the BiRefNet model's MIT notice.

* `onnxruntime-MIT.txt`: Microsoft ONNX Runtime, MIT, https://github.com/microsoft/onnxruntime/blob/main/LICENSE
* `transformers-js-APACHE-2.0.txt`: Hugging Face Transformers.js, Apache 2.0, https://github.com/huggingface/transformers.js/blob/main/LICENSE

The build prefers the corresponding license from the installed npm package when available and uses these officially sourced copies if the package omits a standalone license file. The build copies the notices to `dist/models/runtime/` when it includes the offline model runtime.

These notices do not replace `src-tauri/resources/models/birefnet/LICENSE`, which covers the model itself. Huelith preserves other upstream third-party notices required for distribution.
