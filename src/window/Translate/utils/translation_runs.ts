/**
 * Which Translation Run currently owns a Target Area.
 *
 * A Target Area has exactly one set of state — its result, its error, its loading flag
 * and whether it is collapsed — so only one Translation Run may write to it at a time.
 * Every run claims the Target Area when it starts, which supersedes whichever run held
 * it before, and each of the run's own callbacks asks whether it still holds the claim
 * before touching state. A reply that arrives from a superseded run is therefore
 * discarded instead of overwriting a newer run's output or forcing the Target Area open
 * underneath it.
 *
 * The claim is per Target Area and not per entry point, so an ordinary translation and a
 * translate-back of the same Target Area take the claim from each other in either order.
 *
 * A Translation Run is one attempt by one Service Instance; it has nothing to do with a
 * Paused Run, which is a stretch of Service Instances. See CONTEXT.md ("Target Area",
 * "Translation Run", "Service Instance").
 */

export interface TranslationRunClaim {
    /** Whether this run still owns its Target Area, or a later run has taken over. */
    isCurrent: () => boolean;
}

export interface TranslationRuns {
    /** Start a run on one Target Area, superseding whatever was running there. */
    start: (targetAreaIndex: number) => TranslationRunClaim;
}

export function createTranslationRuns(): TranslationRuns {
    // Identity is the whole of a run's name, so two runs can never collide on one.
    const holders = new Map<number, object>();

    return {
        start(targetAreaIndex: number): TranslationRunClaim {
            const holder = {};
            holders.set(targetAreaIndex, holder);

            return {
                isCurrent: () => holders.get(targetAreaIndex) === holder,
            };
        },
    };
}
