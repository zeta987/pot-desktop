import { describe, expect, it } from 'vitest';

import { buildLayout, findPausedRuns, reorderLayout, slotDraggableId } from './paused_runs';

type LayoutArgs = Parameters<typeof buildLayout>[0];
type Layout = ReturnType<typeof buildLayout>;

// Build the argument object with sensible defaults so each test only states
// what it actually cares about.
const layoutOf = (overrides: Partial<LayoutArgs>): Layout =>
    buildLayout({
        serviceList: [],
        pausedKeys: [],
        disabledKeys: [],
        collapseEnabled: true,
        expandedRunIds: [],
        ...overrides,
    });

const kinds = (layout: Layout) => layout.map((slot) => slot.kind);
const dragIndexes = (layout: Layout) =>
    layout.filter((slot) => slot.draggableIndex !== null).map((slot) => slot.draggableIndex);

describe('findPausedRuns', () => {
    it('finds nothing in a list with no paused services', () => {
        expect(findPausedRuns(['a', 'b', 'c'], new Set<string>())).toEqual([]);
    });

    it('ignores a run shorter than the minimum length', () => {
        expect(findPausedRuns(['a', 'b', 'c'], new Set(['b']))).toEqual([]);
    });

    it('finds a maximal run of adjacent paused services', () => {
        expect(findPausedRuns(['a', 'b', 'c', 'd'], new Set(['b', 'c']))).toEqual([{ runId: 'b', keys: ['b', 'c'] }]);
    });

    it('splits runs that are separated by an active service', () => {
        const runs = findPausedRuns(['p1', 'p2', 'a', 'p3', 'p4'], new Set(['p1', 'p2', 'p3', 'p4']));
        expect(runs).toEqual([
            { runId: 'p1', keys: ['p1', 'p2'] },
            { runId: 'p3', keys: ['p3', 'p4'] },
        ]);
    });

    it('treats a whole list of paused services as one run', () => {
        expect(findPausedRuns(['a', 'b'], new Set(['a', 'b']))).toEqual([{ runId: 'a', keys: ['a', 'b'] }]);
    });
});

describe('buildLayout', () => {
    it('gives every service its own draggable slot when collapsing is off', () => {
        const layout = layoutOf({
            serviceList: ['a', 'p1', 'p2'],
            pausedKeys: ['p1', 'p2'],
            collapseEnabled: false,
        });
        expect(kinds(layout)).toEqual(['service', 'service', 'service']);
        expect(dragIndexes(layout)).toEqual([0, 1, 2]);
    });

    it('leaves a lone paused service uncollapsed', () => {
        const layout = layoutOf({ serviceList: ['a', 'p1', 'b'], pausedKeys: ['p1'] });
        expect(kinds(layout)).toEqual(['service', 'service', 'service']);
    });

    it('collapses an adjacent pair into one draggable slot', () => {
        const layout = layoutOf({ serviceList: ['a', 'p1', 'p2', 'b'], pausedKeys: ['p1', 'p2'] });
        expect(kinds(layout)).toEqual(['service', 'collapsedRun', 'service']);
        expect(layout[1].keys).toEqual(['p1', 'p2']);
        expect(layout[1].runId).toBe('p1');
        expect(dragIndexes(layout)).toEqual([0, 1, 2]);
    });

    it('keeps runs in their original position rather than gathering them', () => {
        const layout = layoutOf({
            serviceList: ['a', 'p1', 'p2', 'b', 'p3', 'p4', 'c'],
            pausedKeys: ['p1', 'p2', 'p3', 'p4'],
        });
        expect(kinds(layout)).toEqual(['service', 'collapsedRun', 'service', 'collapsedRun', 'service']);
        expect(layout.flatMap((slot) => slot.keys)).toEqual(['a', 'p1', 'p2', 'b', 'p3', 'p4', 'c']);
    });

    it('expands a run into a non-draggable header plus draggable members', () => {
        const layout = layoutOf({
            serviceList: ['a', 'p1', 'p2'],
            pausedKeys: ['p1', 'p2'],
            expandedRunIds: ['p1'],
        });
        expect(kinds(layout)).toEqual(['service', 'runHeader', 'runMember', 'runMember']);
        expect(layout[1].draggableIndex).toBeNull();
        expect(layout[1].keys).toEqual([]);
        expect(dragIndexes(layout)).toEqual([0, 1, 2]);
        expect(layout[2].runId).toBe('p1');
    });

    it('keeps a disabled service out of the drag order but in the layout', () => {
        const layout = layoutOf({
            serviceList: ['a', 'off', 'b'],
            disabledKeys: ['off'],
        });
        expect(kinds(layout)).toEqual(['service', 'hidden', 'service']);
        expect(layout[1].draggableIndex).toBeNull();
        expect(dragIndexes(layout)).toEqual([0, 1]);
    });

    it('lets a run span a disabled service, which is not part of the window ordering', () => {
        const layout = layoutOf({
            serviceList: ['p1', 'off', 'p2'],
            pausedKeys: ['p1', 'p2'],
            disabledKeys: ['off'],
        });
        expect(kinds(layout)).toEqual(['collapsedRun']);
        expect(layout[0].memberKeys).toEqual(['p1', 'p2']);
        // The disabled key travels with the run so that reordering never loses it.
        expect(layout[0].keys).toEqual(['p1', 'off', 'p2']);
    });

    it('keeps a spanned disabled service undraggable when its run is expanded', () => {
        const layout = layoutOf({
            serviceList: ['p1', 'off', 'p2'],
            pausedKeys: ['p1', 'p2'],
            disabledKeys: ['off'],
            expandedRunIds: ['p1'],
        });
        expect(kinds(layout)).toEqual(['runHeader', 'runMember', 'hidden', 'runMember']);
        expect(dragIndexes(layout)).toEqual([0, 1]);
        expect(layout.flatMap((slot) => slot.keys)).toEqual(['p1', 'off', 'p2']);
    });

    it('does not stretch a run over a trailing disabled service', () => {
        const layout = layoutOf({
            serviceList: ['p1', 'p2', 'off'],
            pausedKeys: ['p1', 'p2'],
            disabledKeys: ['off'],
        });
        expect(kinds(layout)).toEqual(['collapsedRun', 'hidden']);
        expect(layout[0].keys).toEqual(['p1', 'p2']);
    });

    it('numbers draggable slots consecutively from zero', () => {
        const layout = layoutOf({
            serviceList: ['a', 'off', 'p1', 'p2', 'b'],
            pausedKeys: ['p1', 'p2'],
            disabledKeys: ['off'],
        });
        expect(dragIndexes(layout)).toEqual([0, 1, 2]);
    });
});

describe('slotDraggableId', () => {
    it('identifies a plain service by its instance key', () => {
        const layout = layoutOf({ serviceList: ['a'] });
        expect(slotDraggableId(layout[0])).toBe('a');
    });

    it('identifies a collapsed run by its run id, not by a member key', () => {
        const layout = layoutOf({ serviceList: ['p1', 'p2'], pausedKeys: ['p1', 'p2'] });
        expect(slotDraggableId(layout[0])).toBe('run:p1');
    });

    it('gives every draggable slot a distinct id', () => {
        const layout = layoutOf({
            serviceList: ['a', 'p1', 'p2', 'b', 'p3', 'p4'],
            pausedKeys: ['p1', 'p2', 'p3', 'p4'],
        });
        const ids = layout.filter((slot) => slot.draggableIndex !== null).map(slotDraggableId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('buildLayout on a real-world list', () => {
    // The configuration that motivated the feature: 46 instances, 9 of them disabled,
    // leaving 37 in the window ordering as A1 P9 A1 P3 A1 P2 A1 P6 A1 P12.
    const pattern: Array<[boolean, number]> = [
        [false, 1],
        [true, 9],
        [false, 1],
        [true, 3],
        [false, 1],
        [true, 2],
        [false, 1],
        [true, 6],
        [false, 1],
        [true, 12],
    ];

    const serviceList: string[] = [];
    const pausedKeys: string[] = [];
    const disabledKeys: string[] = [];

    pattern.forEach(([isPaused, count], group) => {
        for (let n = 0; n < count; n += 1) {
            const key = `svc${group}_${n}`;
            serviceList.push(key);
            if (isPaused) {
                pausedKeys.push(key);
            }
        }
    });
    // Nine disabled instances scattered through the list. One of them is also paused,
    // as in the real configuration: being disabled keeps it out of every run anyway.
    for (let n = 0; n < 9; n += 1) {
        const key = `off${n}`;
        disabledKeys.push(key);
        serviceList.splice(n * 5 + 2, 0, key);
    }
    pausedKeys.push('off0');

    it('describes the configuration the fixture is meant to mirror', () => {
        expect(serviceList).toHaveLength(46);
        expect(disabledKeys).toHaveLength(9);
        expect(pausedKeys).toHaveLength(33);
        expect(pausedKeys.filter((key) => !disabledKeys.includes(key))).toHaveLength(32);
    });

    it('folds thirty-three paused instances into five collapsed runs', () => {
        const layout = layoutOf({ serviceList, pausedKeys, disabledKeys });
        const runs = layout.filter((slot) => slot.kind === 'collapsedRun');
        expect(runs.map((slot) => slot.memberKeys.length)).toEqual([9, 3, 2, 6, 12]);
        // Five active panels plus five run headers.
        expect(dragIndexes(layout)).toHaveLength(10);
    });

    it('rebuilds the exact same order when nothing is dragged', () => {
        const layout = layoutOf({ serviceList, pausedKeys, disabledKeys });
        expect(layout.flatMap((slot) => slot.keys)).toEqual(serviceList);
    });

    it('loses no instance when a run block is moved to the end', () => {
        const layout = layoutOf({ serviceList, pausedKeys, disabledKeys });
        const firstRun = layout.find((slot) => slot.kind === 'collapsedRun');
        const result = reorderLayout(layout, slotDraggableId(firstRun!), 9);
        expect([...result].sort()).toEqual([...serviceList].sort());
    });
});

describe('reorderLayout', () => {
    it('moves a single service down the list', () => {
        const layout = layoutOf({ serviceList: ['a', 'b', 'c'] });
        expect(reorderLayout(layout, 'a', 2)).toEqual(['b', 'c', 'a']);
    });

    it('moves a single service up the list', () => {
        const layout = layoutOf({ serviceList: ['a', 'b', 'c'] });
        expect(reorderLayout(layout, 'c', 0)).toEqual(['c', 'a', 'b']);
    });

    it('moves every member of a collapsed run together', () => {
        const layout = layoutOf({ serviceList: ['a', 'p1', 'p2', 'b'], pausedKeys: ['p1', 'p2'] });
        expect(reorderLayout(layout, 'run:p1', 2)).toEqual(['a', 'b', 'p1', 'p2']);
    });

    it('moves a service into the gap before a collapsed run', () => {
        const layout = layoutOf({ serviceList: ['a', 'p1', 'p2', 'b'], pausedKeys: ['p1', 'p2'] });
        expect(reorderLayout(layout, 'b', 1)).toEqual(['a', 'b', 'p1', 'p2']);
    });

    it('keeps a disabled service in place while others move around it', () => {
        const layout = layoutOf({ serviceList: ['a', 'off', 'b'], disabledKeys: ['off'] });
        // Moving b to the front must not lose the disabled 'off'.
        const result = reorderLayout(layout, 'b', 0);
        expect(result).toHaveLength(3);
        expect(result).toContain('off');
        expect(result.filter((key) => key !== 'off')).toEqual(['b', 'a']);
    });

    it('moves an expanded member out of its run', () => {
        const layout = layoutOf({
            serviceList: ['a', 'p1', 'p2'],
            pausedKeys: ['p1', 'p2'],
            expandedRunIds: ['p1'],
        });
        expect(reorderLayout(layout, 'p2', 0)).toEqual(['p2', 'a', 'p1']);
    });

    it('returns the original order when the move is a no-op', () => {
        const layout = layoutOf({ serviceList: ['a', 'b', 'c'] });
        expect(reorderLayout(layout, 'b', 1)).toEqual(['a', 'b', 'c']);
    });

    it('returns the original order when the dragged row is unknown', () => {
        const layout = layoutOf({ serviceList: ['a', 'off', 'b'], disabledKeys: ['off'] });
        expect(reorderLayout(layout, 'nope', 0)).toEqual(['a', 'off', 'b']);
    });

    it('returns an empty list for an empty layout', () => {
        expect(reorderLayout([], 'a', 0)).toEqual([]);
    });

    it('still moves the row the user grabbed after the layout is rebuilt', () => {
        const args = {
            serviceList: ['p1', 'p2', 'a', 'b'],
            pausedKeys: ['p1', 'p2'],
        };
        // The row 'b' sits at drag index 2 while the run is collapsed, but at index 3
        // once the run expands. Identifying it by id survives the renumbering; an
        // index captured before the rebuild would move the wrong row.
        const collapsed = layoutOf(args);
        const expanded = layoutOf({ ...args, expandedRunIds: ['p1'] });

        expect(dragIndexes(collapsed)).toEqual([0, 1, 2]);
        expect(dragIndexes(expanded)).toEqual([0, 1, 2, 3]);
        expect(reorderLayout(expanded, 'b', 0)).toEqual(['b', 'p1', 'p2', 'a']);
    });
});
