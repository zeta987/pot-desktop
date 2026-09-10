export type ServiceInstanceConfig = Record<string, unknown>;

export type ServiceInstanceConfigMap = Record<string, ServiceInstanceConfig | undefined>;

export interface TemporaryServiceStateInput {
    serviceList?: string[] | null;
    serviceInstanceConfigMap?: ServiceInstanceConfigMap | null;
    pausedKeys?: string[] | null;
    selectedKeys?: string[] | null;
}

export interface TemporaryServiceState {
    /** Instances the user could switch on temporarily, in serviceList order. */
    candidateKeys: string[];
    /** The selection actually in force, in serviceList order. */
    activeTemporaryKeys: string[];
    /** Baseline paused set with the active selection lifted out. */
    effectivePausedKeys: string[];
    /** Baseline disabled set with the active selection lifted out. */
    effectiveDisabledKeys: string[];
}

const isBaselineDisabled = (instanceConfig: ServiceInstanceConfig | undefined): boolean =>
    ((instanceConfig ?? {}).enable ?? true) === false;

/**
 * Derive the Translate window's temporary activation state without changing either
 * persisted axis: an instance remains baseline Enabled/Paused exactly as configured.
 */
export const deriveTemporaryServiceState = ({
    serviceList,
    serviceInstanceConfigMap,
    pausedKeys,
    selectedKeys,
}: TemporaryServiceStateInput = {}): TemporaryServiceState => {
    const orderedKeys = serviceList ?? [];
    const configMap = serviceInstanceConfigMap ?? {};
    const baselinePaused = pausedKeys ?? [];
    const selected = selectedKeys ?? [];

    const candidateKeys: string[] = [];
    const activeTemporaryKeys: string[] = [];
    const effectivePausedKeys: string[] = [];
    const effectiveDisabledKeys: string[] = [];

    orderedKeys.forEach((key) => {
        const paused = baselinePaused.includes(key);
        const disabled = isBaselineDisabled(configMap[key]);

        if (!paused && !disabled) return;

        candidateKeys.push(key);

        if (selected.includes(key)) {
            activeTemporaryKeys.push(key);
            return;
        }

        if (paused) effectivePausedKeys.push(key);
        if (disabled) effectiveDisabledKeys.push(key);
    });

    return { candidateKeys, activeTemporaryKeys, effectivePausedKeys, effectiveDisabledKeys };
};

/** Keep the controlled picker from changing draggable membership during a drag. */
export const updateTemporaryServiceSelection = (
    currentKeys: string[],
    nextKeys: string[],
    isDragging: boolean
): string[] => (isDragging ? currentKeys : [...(nextKeys ?? [])]);

/**
 * Plugins historically expect enable='true' while running. Give them an ephemeral
 * config instead of mutating the object loaded from the persistent store.
 */
export const getTranslationRuntimeConfig = (
    instanceConfig: ServiceInstanceConfig,
    isPluginService: boolean
): ServiceInstanceConfig => (isPluginService ? { ...(instanceConfig ?? {}), enable: 'true' } : instanceConfig);
