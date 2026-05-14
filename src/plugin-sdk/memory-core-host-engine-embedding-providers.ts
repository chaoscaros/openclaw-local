// Lightweight memory embedding provider primitives for the bundled memory-core plugin.
// Keep capability-provider discovery out of this surface so memory-core can register
// built-in adapters without recursively loading plugins during startup.

export {
  getRegisteredMemoryEmbeddingProvider,
  listRegisteredMemoryEmbeddingProviders,
} from "../plugins/memory-embedding-providers.js";
export type {
  MemoryEmbeddingBatchChunk,
  MemoryEmbeddingBatchOptions,
  MemoryEmbeddingProvider,
  MemoryEmbeddingProviderAdapter,
  MemoryEmbeddingProviderCreateOptions,
  MemoryEmbeddingProviderCreateResult,
  MemoryEmbeddingProviderRuntime,
} from "../plugins/memory-embedding-providers.js";
export { createLocalEmbeddingProvider, DEFAULT_LOCAL_MODEL } from "../memory-host-sdk/host/embeddings.js";
export {
  createGeminiEmbeddingProvider,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  buildGeminiEmbeddingRequest,
} from "../memory-host-sdk/host/embeddings-gemini.js";
export {
  createLmstudioEmbeddingProvider,
  DEFAULT_LMSTUDIO_EMBEDDING_MODEL,
} from "../memory-host-sdk/host/embeddings-lmstudio.js";
export {
  createMistralEmbeddingProvider,
  DEFAULT_MISTRAL_EMBEDDING_MODEL,
} from "../memory-host-sdk/host/embeddings-mistral.js";
export {
  createOllamaEmbeddingProvider,
  DEFAULT_OLLAMA_EMBEDDING_MODEL,
} from "../memory-host-sdk/host/embeddings-ollama.js";
export {
  createOpenAiEmbeddingProvider,
  DEFAULT_OPENAI_EMBEDDING_MODEL,
} from "../memory-host-sdk/host/embeddings-openai.js";
export {
  createVoyageEmbeddingProvider,
  DEFAULT_VOYAGE_EMBEDDING_MODEL,
} from "../memory-host-sdk/host/embeddings-voyage.js";
export { runGeminiEmbeddingBatches, type GeminiBatchRequest } from "../memory-host-sdk/host/batch-gemini.js";
export {
  OPENAI_BATCH_ENDPOINT,
  runOpenAiEmbeddingBatches,
  type OpenAiBatchRequest,
} from "../memory-host-sdk/host/batch-openai.js";
export { runVoyageEmbeddingBatches, type VoyageBatchRequest } from "../memory-host-sdk/host/batch-voyage.js";
export { hasNonTextEmbeddingParts, type EmbeddingInput } from "../memory-host-sdk/host/embedding-inputs.js";
