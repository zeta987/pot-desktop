/**
 * When a Target Area is open, for the whole life of one Translation Run.
 *
 * A run collapses its Target Area on the way out and opens it again as soon as there
 * is something worth reading — a streamed chunk, a finished result, or the reason the
 * run failed. Every one of those outcomes goes through the same handle, so a failure
 * arriving after a partial result cannot fight the Target Area back shut.
 *
 * See CONTEXT.md ("Target Area", "Translation Run").
 */

export type HideSetter = (hide: boolean) => void;

export interface TargetAreaReveal {
    /** A run is starting: collapse the Target Area until it has something to show. */
    collapse: () => void;
    /** Open the Target Area so the run's result or its error is readable. */
    open: () => void;
    /** The run finished: open the Target Area unless it came back with nothing to show. */
    settle: (result: unknown) => void;
}

/** An empty string is the one result a service can return with nothing worth opening for. */
const hasSomethingToShow = (result: unknown): boolean => result !== '';

export function createTargetAreaReveal(setHide: HideSetter): TargetAreaReveal {
    let isOpen = false;

    const open = () => {
        // Streamed runs call this per chunk, so only the first one is worth a state update.
        if (isOpen) {
            return;
        }
        isOpen = true;
        setHide(false);
    };

    return {
        collapse() {
            isOpen = false;
            setHide(true);
        },
        open,
        settle(result: unknown) {
            if (hasSomethingToShow(result)) {
                open();
            }
        },
    };
}
