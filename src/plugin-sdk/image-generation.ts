// Public image-generation helpers and types for provider plugins.

export {
  generatedImageAssetFromBase64,
  generatedImageAssetFromDataUrl,
  imageFileExtensionForMimeType,
  imageSourceUploadFileName,
  parseImageDataUrl,
  sniffImageMimeType,
  toImageDataUrl,
  type ImageMimeTypeDetection,
} from "../image-generation/image-assets.js";
export type {
  GeneratedImageAsset,
  ImageGenerationProvider,
  ImageGenerationProviderConfiguredContext,
  ImageGenerationResolution,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerationSourceImage,
} from "../image-generation/types.js";
