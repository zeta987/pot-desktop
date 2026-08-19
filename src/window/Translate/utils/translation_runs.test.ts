import { describe, expect, it } from 'vitest';

import { createTranslationRuns } from './translation_runs';

describe('createTranslationRuns', () => {
    it('lets the only run on a Target Area write to it', () => {
        const runs = createTranslationRuns();

        const run = runs.start(0);

        expect(run.isCurrent()).toBe(true);
    });

    it('takes the Target Area away from the run that was already there', () => {
        const runs = createTranslationRuns();

        const superseded = runs.start(0);
        const latest = runs.start(0);

        expect(superseded.isCurrent()).toBe(false);
        expect(latest.isCurrent()).toBe(true);
    });

    it('keeps a superseded run out for good, however late its reply lands', () => {
        const runs = createTranslationRuns();

        const superseded = runs.start(0);
        runs.start(0);
        runs.start(0);

        expect(superseded.isCurrent()).toBe(false);
    });

    it('leaves every other Target Area alone when one starts a run', () => {
        const runs = createTranslationRuns();

        const neighbour = runs.start(1);
        runs.start(0);

        expect(neighbour.isCurrent()).toBe(true);
    });

    it('gives each Target Area its own claim, so identical indexes are the only clash', () => {
        const runs = createTranslationRuns();

        const first = runs.start(0);
        const second = runs.start(1);
        runs.start(1);

        expect(first.isCurrent()).toBe(true);
        expect(second.isCurrent()).toBe(false);
    });
});
