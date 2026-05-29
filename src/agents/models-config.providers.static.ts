import path from "node:path";
import { pathToFileURL } from "node:url";
import { listBundledPluginMetadata } from "../plugins/bundled-plugin-metadata.js";
import { resolveBundledPluginPublicSurfacePath } from "../plugins/public-surface-runtime.js";

const PROVIDER_CATALOG_ARTIFACT_BASENAME = "provider-catalog.js";
const DEFAULT_PROVIDER_CATALOG_ROOT = path.resolve(import.meta.dirname, "../..");

export type BundledProviderCatalogEntry = {
  dirName: string;
  pluginId: string;
  providers: readonly string[];
  artifactPath: string;
};

type ProviderCatalogModule = Record<string, unknown>;
type ProviderCatalogExportMap = Record<string, unknown>;
type BundledProviderCatalogMetadata = {
  dirName: string;
  publicSurfaceArtifacts?: readonly string[];
  manifest: {
    id: string;
    providers?: readonly string[];
  };
};
type BundledProviderCatalogDeps = {
  listMetadata?: (
    params?: Parameters<typeof listBundledPluginMetadata>[0],
  ) => readonly BundledProviderCatalogMetadata[];
  resolvePublicSurfacePath?: typeof resolveBundledPluginPublicSurfacePath;
};

let providerCatalogEntriesCache: ReadonlyArray<BundledProviderCatalogEntry> | null = null;
let providerCatalogModulesPromise: Promise<Readonly<Record<string, ProviderCatalogModule>>> | null =
  null;
let providerCatalogExportMapPromise: Promise<Readonly<ProviderCatalogExportMap>> | null = null;

export function resolveBundledProviderCatalogEntries(params?: {
  rootDir?: string;
  deps?: BundledProviderCatalogDeps;
}): ReadonlyArray<BundledProviderCatalogEntry> {
  const rootDir = params?.rootDir ?? DEFAULT_PROVIDER_CATALOG_ROOT;
  const deps = params?.deps;
  const useCache = rootDir === DEFAULT_PROVIDER_CATALOG_ROOT && !deps;
  if (useCache && providerCatalogEntriesCache) {
    return providerCatalogEntriesCache;
  }

  const entries: BundledProviderCatalogEntry[] = [];
  const listMetadata = deps?.listMetadata ?? listBundledPluginMetadata;
  const resolvePublicSurfacePath =
    deps?.resolvePublicSurfacePath ?? resolveBundledPluginPublicSurfacePath;
  for (const entry of listMetadata({ rootDir })) {
    if (!entry.publicSurfaceArtifacts?.includes(PROVIDER_CATALOG_ARTIFACT_BASENAME)) {
      continue;
    }
    const artifactPath = resolvePublicSurfacePath({
      rootDir,
      dirName: entry.dirName,
      artifactBasename: PROVIDER_CATALOG_ARTIFACT_BASENAME,
    });
    if (!artifactPath) {
      continue;
    }
    entries.push({
      dirName: entry.dirName,
      pluginId: entry.manifest.id,
      providers: entry.manifest.providers ?? [],
      artifactPath,
    });
  }
  entries.sort((left, right) => left.dirName.localeCompare(right.dirName));

  if (useCache) {
    providerCatalogEntriesCache = entries;
  }
  return entries;
}

export async function loadBundledProviderCatalogModules(params?: {
  rootDir?: string;
  deps?: BundledProviderCatalogDeps;
}): Promise<Readonly<Record<string, ProviderCatalogModule>>> {
  const rootDir = params?.rootDir ?? DEFAULT_PROVIDER_CATALOG_ROOT;
  const deps = params?.deps;
  const useCache = rootDir === DEFAULT_PROVIDER_CATALOG_ROOT && !deps;
  if (useCache && providerCatalogModulesPromise) {
    return providerCatalogModulesPromise;
  }

  const loadPromise = (async () => {
    const entries = resolveBundledProviderCatalogEntries({ rootDir, deps });
    const modules = await Promise.all(
      entries.map(async (entry) => {
        const module = (await import(
          pathToFileURL(entry.artifactPath).href
        )) as ProviderCatalogModule;
        return [entry.dirName, module] as const;
      }),
    );
    return Object.freeze(Object.fromEntries(modules));
  })();

  if (useCache) {
    providerCatalogModulesPromise = loadPromise;
  }
  return loadPromise;
}

export async function loadBundledProviderCatalogExportMap(params?: {
  rootDir?: string;
  deps?: BundledProviderCatalogDeps;
}): Promise<Readonly<ProviderCatalogExportMap>> {
  const rootDir = params?.rootDir ?? DEFAULT_PROVIDER_CATALOG_ROOT;
  const deps = params?.deps;
  const useCache = rootDir === DEFAULT_PROVIDER_CATALOG_ROOT && !deps;
  if (useCache && providerCatalogExportMapPromise) {
    return providerCatalogExportMapPromise;
  }

  const loadPromise = (async () => {
    const modules = await loadBundledProviderCatalogModules({ rootDir, deps });
    const exports: ProviderCatalogExportMap = {};
    const exportOwners = new Map<string, string>();

    for (const [dirName, module] of Object.entries(modules)) {
      for (const [exportName, exportValue] of Object.entries(module)) {
        if (exportName === "default") {
          continue;
        }
        const existingOwner = exportOwners.get(exportName);
        if (existingOwner && existingOwner !== dirName) {
          throw new Error(
            `Duplicate provider catalog export "${exportName}" from folders "${existingOwner}" and "${dirName}"`,
          );
        }
        exportOwners.set(exportName, dirName);
        exports[exportName] = exportValue;
      }
    }

    return Object.freeze(exports);
  })();

  if (useCache) {
    providerCatalogExportMapPromise = loadPromise;
  }
  return loadPromise;
}
