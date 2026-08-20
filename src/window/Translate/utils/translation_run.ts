/**
 * The course one Translation Run takes, and the Target Area state it moves through.
 *
 * Every run follows the same course: turn down a language pair the Service Instance
 * cannot handle, or collapse the Target Area, resolve the instance's translate call,
 * hand the text over, and land whatever comes back — a stream of chunks, a final
 * result, or a failure. The translate window starts runs from four places (the
 * automatic run and the translate-back button, each over a plugin or a built-in
 * Service Instance), and everything that separates those four is a parameter here,
 * so the course itself is written once.
 *
 * See CONTEXT.md ("Translation Run", "Target Area", "Service Instance") and
 * `target_area_reveal.ts`, which owns when the panel is open.
 */

import type { TargetAreaReveal } from './target_area_reveal';

/** The error a Target Area shows when its Service Instance does not cover the language pair. */
export const LANGUAGE_NOT_SUPPORTED = 'Language not supported';

export interface TranslateCallOptions {
    config: unknown;
    detect: string;
    /** A chunk of a streamed result, pushed while the run is still in flight. */
    setResult: (chunk: unknown) => void;
}

/** The call every translation Service Instance answers, plugin and built-in alike. */
export type TranslateCall = (
    text: string,
    from: unknown,
    to: unknown,
    options: TranslateCallOptions
) => Promise<unknown>;

/** How a Translation Run ended. `superseded` means a newer run took the Target Area over first. */
export type TranslationRunOutcome =
    | { status: 'unsupported' }
    | { status: 'load-failed'; error: unknown }
    | { status: 'resolved'; result: unknown }
    | { status: 'rejected'; error: unknown }
    | { status: 'superseded' };

/** The Target Area a run writes into, as the four setters it actually touches. */
export interface TargetAreaHandles {
    setIsLoading: (loading: boolean) => void;
    setError: (message: string) => void;
    /** Show a streamed chunk. The final result goes through `applyResult` instead. */
    setResult: (chunk: unknown) => void;
    reveal: TargetAreaReveal;
}

export interface TranslationRunRequest {
    /** Whether the Service Instance covers this run's language pair at all. */
    isLanguagePairSupported: boolean;
    /** Resolve the instance's translate call. A plugin loads here, and loading can fail. */
    load: () => Promise<TranslateCall>;
    text: string;
    from: unknown;
    to: unknown;
    config: unknown;
    detect: string;
    /** Where the run's final value lands in the Target Area — runs settle differently. */
    applyResult: (result: unknown) => void;
    /** True once a newer run owns this Target Area. Runs nobody can supersede omit it. */
    isSuperseded?: () => boolean;
    /** Runs after the result has landed: history, auto-copy. */
    onResolved?: (result: unknown) => void;
    /** Called before the supersession check, so a superseded run still leaves a trace. */
    log?: {
        resolved?: (result: unknown) => void;
        rejected?: (error: unknown) => void;
    };
}

/**
 * Whatever the Service Instance threw, stringified by its own `toString` — kept as the
 * four call sites had it, so a failure that used to reach the panel still reaches it
 * with the same text.
 */
const describeFailure = (failure: unknown): string => (failure as { toString: () => string }).toString();

/**
 * Run one Translation Run against a Service Instance and drive its Target Area.
 *
 * The returned promise settles with the run's outcome once the Target Area has been
 * brought up to date; it never rejects, because a rejected translate call is one of
 * the outcomes.
 */
export async function runTranslation(
    request: TranslationRunRequest,
    area: TargetAreaHandles
): Promise<TranslationRunOutcome> {
    const { reveal } = area;
    const isSuperseded = request.isSuperseded ?? (() => false);

    if (!request.isLanguagePairSupported) {
        area.setError(LANGUAGE_NOT_SUPPORTED);
        // A run this one superseded may have left the spinner on, and its own
        // supersession guard keeps it from ever clearing it — settle loading here.
        area.setIsLoading(false);
        reveal.open();
        return { status: 'unsupported' };
    }

    area.setIsLoading(true);
    reveal.collapse();

    const fail = (failure: unknown) => {
        area.setError(describeFailure(failure));
        area.setIsLoading(false);
        reveal.open();
    };

    let translate: TranslateCall;
    try {
        translate = await request.load();
    } catch (failure) {
        if (isSuperseded()) {
            return { status: 'superseded' };
        }
        fail(failure);
        return { status: 'load-failed', error: failure };
    }

    return translate(request.text, request.from, request.to, {
        config: request.config,
        detect: request.detect,
        setResult: (chunk) => {
            if (isSuperseded()) {
                return;
            }
            area.setResult(chunk);
            reveal.open();
        },
    }).then(
        (result): TranslationRunOutcome => {
            request.log?.resolved?.(result);
            if (isSuperseded()) {
                return { status: 'superseded' };
            }
            request.applyResult(result);
            area.setIsLoading(false);
            reveal.settle(result);
            request.onResolved?.(result);
            return { status: 'resolved', result };
        },
        (failure): TranslationRunOutcome => {
            request.log?.rejected?.(failure);
            if (isSuperseded()) {
                return { status: 'superseded' };
            }
            fail(failure);
            return { status: 'rejected', error: failure };
        }
    );
}
