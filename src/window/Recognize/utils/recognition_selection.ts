/** Resolve full instance keys in configured order without enabling extra providers. */
export function getAutoRecognitionServices(configuredKeys: string[], storedAutoKeys: unknown): string[] {
    const selected = new Set(Array.isArray(storedAutoKeys) ? storedAutoKeys : configuredKeys.slice(0, 1));
    return [...new Set(configuredKeys)].filter((key) => selected.has(key));
}
