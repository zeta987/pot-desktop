/** The error shown when the selected OCR Service Instance cannot handle the language. */
export const LANGUAGE_NOT_SUPPORTED = 'Language not supported';

export interface RecognizeCallOptions {
    config: unknown;
}

/** The call every OCR Service Instance answers after plugin-specific utilities are bound. */
export type RecognizeCall = (
    base64: string,
    mappedLanguage: unknown,
    options: RecognizeCallOptions
) => unknown | Promise<unknown>;

export type RecognitionRunOutcome =
    | { status: 'unsupported' }
    | { status: 'load-failed'; error: unknown }
    | { status: 'resolved'; result: string }
    | { status: 'rejected'; error: unknown }
    | { status: 'superseded' };

/** The recognition Target Area, expressed as the three setters one run may touch. */
export interface RecognitionAreaHandles {
    setIsLoading: (loading: boolean) => void;
    setText: (text: string) => void;
    setError: (message: string) => void;
}

export interface RecognitionRunRequest {
    isLanguageSupported: boolean;
    /** Load a built-in call or a plugin call that already has its utilities bound. */
    load: () => RecognizeCall | Promise<RecognizeCall>;
    base64: string;
    /** The language value already mapped for the selected Service Instance. */
    language: unknown;
    config: unknown;
    deleteNewline?: boolean;
    /** True once the caller no longer owns the Target Area, such as after retry or unmount. */
    isSuperseded?: () => boolean;
    /**
     * Starts caller-owned effects such as auto-copy after text lands. The helper invokes
     * this callback synchronously and does not await asynchronous work it starts.
     */
    onResolved?: (text: string) => void;
}

const describeFailure = (failure: unknown): string => String(failure);

/**
 * Run one OCR request and update its Target Area while the caller still owns it.
 *
 * Provider and loader failures settle as outcomes. Errors thrown by Target Area setters
 * or `onResolved` remain caller-owned and are not reclassified as provider failures.
 */
export async function runRecognition(
    request: RecognitionRunRequest,
    area: RecognitionAreaHandles
): Promise<RecognitionRunOutcome> {
    const isSuperseded = request.isSuperseded ?? (() => false);

    if (isSuperseded()) {
        return { status: 'superseded' };
    }

    area.setText('');
    area.setError('');

    if (!request.isLanguageSupported) {
        area.setError(LANGUAGE_NOT_SUPPORTED);
        area.setIsLoading(false);
        return { status: 'unsupported' };
    }

    area.setIsLoading(true);

    const fail = (failure: unknown) => {
        area.setError(describeFailure(failure));
        area.setIsLoading(false);
    };

    let recognize: RecognizeCall;
    try {
        recognize = await request.load();
    } catch (failure) {
        if (isSuperseded()) {
            return { status: 'superseded' };
        }
        fail(failure);
        return { status: 'load-failed', error: failure };
    }

    if (isSuperseded()) {
        return { status: 'superseded' };
    }

    let providerResult: unknown;
    try {
        providerResult = await recognize(request.base64, request.language, { config: request.config });
    } catch (failure) {
        if (isSuperseded()) {
            return { status: 'superseded' };
        }
        fail(failure);
        return { status: 'rejected', error: failure };
    }

    if (isSuperseded()) {
        return { status: 'superseded' };
    }

    if (typeof providerResult !== 'string') {
        const failure = new TypeError('Recognition result must be a string');
        fail(failure);
        return { status: 'rejected', error: failure };
    }

    let result = providerResult.trim();
    if (request.deleteNewline) {
        result = result.replace(/\-\s+/g, '').replace(/\s+/g, ' ');
    }

    area.setText(result);
    area.setIsLoading(false);

    if (request.onResolved) {
        if (isSuperseded()) {
            return { status: 'superseded' };
        }
        request.onResolved(result);
    }

    return { status: 'resolved', result };
}
