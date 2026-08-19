/**
 * Layout maths for collapsing Paused Runs in the translate window.
 *
 * A Paused Run is a maximal stretch of consecutive Paused service instances in the
 * window's ordering. Disabled instances are not part of that ordering, so a run may
 * span one without being broken by it — but the disabled key still travels inside the
 * run's ordering payload so that reordering never drops or displaces it.
 *
 * See CONTEXT.md ("Paused Run") and docs/adr/0001-paused-runs-are-derived-not-stored.md.
 */

/** A Paused Run shorter than this stays as ordinary panels: folding one costs more room than it saves. */
export const MIN_PAUSED_RUN_LENGTH = 2;

export type SlotKind = 'service' | 'collapsedRun' | 'runHeader' | 'runMember' | 'hidden';

export interface LayoutSlot {
    kind: SlotKind;
    /** Service instance keys this slot owns, in order. Used to rebuild the stored list. */
    keys: string[];
    /** The keys this slot actually renders. Differs from `keys` only when a run spans a disabled instance. */
    memberKeys: string[];
    /** Position in the drag order, or null when the slot cannot be dragged. */
    draggableIndex: number | null;
    /** The Paused Run this slot belongs to, or null. */
    runId: string | null;
}

export interface PausedRun {
    runId: string;
    keys: string[];
}

export interface BuildLayoutArgs {
    serviceList: string[];
    pausedKeys: Iterable<string>;
    disabledKeys: Iterable<string>;
    collapseEnabled: boolean;
    expandedRunIds: Iterable<string>;
}

/**
 * Group adjacent paused keys into runs, dropping any run below the fixed minimum
 * length. `serviceList` must already exclude disabled instances.
 */
export function findPausedRuns(serviceList: string[], pausedKeys: ReadonlySet<string>): PausedRun[] {
    const runs: PausedRun[] = [];
    let current: string[] = [];

    const flush = () => {
        if (current.length >= MIN_PAUSED_RUN_LENGTH) {
            runs.push({ runId: current[0], keys: current });
        }
        current = [];
    };

    for (const key of serviceList) {
        if (pausedKeys.has(key)) {
            current.push(key);
        } else {
            flush();
        }
    }
    flush();

    return runs;
}

/**
 * Turn the stored service list into the rows the translate window renders, assigning
 * consecutive drag indexes to exactly the rows @hello-pangea/dnd may move.
 */
export function buildLayout({
    serviceList,
    pausedKeys,
    disabledKeys,
    collapseEnabled,
    expandedRunIds,
}: BuildLayoutArgs): LayoutSlot[] {
    const paused = new Set(pausedKeys);
    const disabled = new Set(disabledKeys);
    const expanded = new Set(expandedRunIds);

    const visible = serviceList.filter((key) => !disabled.has(key));
    const runs = collapseEnabled ? findPausedRuns(visible, paused) : [];

    // Map each run to the slice of the stored list it owns: first member through last.
    const runSpans = runs.map((run) => ({
        run,
        start: serviceList.indexOf(run.keys[0]),
        end: serviceList.indexOf(run.keys[run.keys.length - 1]),
    }));
    const spanStarts = new Map(runSpans.map((span) => [span.start, span]));

    const slots: LayoutSlot[] = [];
    let cursor = 0;

    const push = (slot: Omit<LayoutSlot, 'draggableIndex'>, draggable: boolean) => {
        slots.push({ ...slot, draggableIndex: draggable ? cursor++ : null });
    };

    for (let index = 0; index < serviceList.length; index += 1) {
        const span = spanStarts.get(index);

        if (span) {
            const owned = serviceList.slice(span.start, span.end + 1);
            const { runId, keys: members } = span.run;

            if (expanded.has(runId)) {
                push({ kind: 'runHeader', keys: [], memberKeys: members, runId }, false);
                for (const key of owned) {
                    const isMember = !disabled.has(key);
                    push(
                        {
                            kind: isMember ? 'runMember' : 'hidden',
                            keys: [key],
                            memberKeys: isMember ? [key] : [],
                            runId: isMember ? runId : null,
                        },
                        isMember
                    );
                }
            } else {
                push({ kind: 'collapsedRun', keys: owned, memberKeys: members, runId }, true);
            }

            index = span.end;
            continue;
        }

        const key = serviceList[index];
        if (disabled.has(key)) {
            push({ kind: 'hidden', keys: [key], memberKeys: [], runId: null }, false);
        } else {
            push({ kind: 'service', keys: [key], memberKeys: [key], runId: null }, true);
        }
    }

    return slots;
}

/**
 * The id a slot is registered under with @hello-pangea/dnd. A collapsed run is
 * prefixed so it can never collide with the instance key of one of its members.
 */
export function slotDraggableId(slot: LayoutSlot): string {
    return slot.kind === 'collapsedRun' ? `run:${slot.runId}` : slot.keys[0];
}

/**
 * Apply a drag result to the layout and return the rebuilt service list. Slots that
 * cannot be dragged keep their position relative to the rows around them, and a
 * collapsed run moves as a single block.
 */
export function reorderLayout(layout: LayoutSlot[], sourceDraggableId: string, destinationIndex: number): string[] {
    const moved = layout.find((slot) => slot.draggableIndex !== null && slotDraggableId(slot) === sourceDraggableId);

    if (!moved) {
        return layout.flatMap((slot) => slot.keys);
    }

    const rest = layout.filter((slot) => slot !== moved);
    const restDraggables = rest.filter((slot) => slot.draggableIndex !== null);
    const anchor = restDraggables[destinationIndex];
    const insertAt = anchor ? rest.indexOf(anchor) : rest.length;

    rest.splice(insertAt, 0, moved);

    return rest.flatMap((slot) => slot.keys);
}
