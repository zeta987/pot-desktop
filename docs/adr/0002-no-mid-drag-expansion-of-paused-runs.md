# Paused Runs do not open mid-drag

A collapsed Paused Run is one row, so there is no way to drop an instance at an exact
position inside it. The obvious fix is a spring-loaded folder: park a drag over the
collapsed row for a moment and it opens. We built that, found it cannot work, and
removed it. A run now opens only outside a drag; to place something inside one, open
it first and then drag.

## Why it cannot work

Opening a run mid-drag replaces one `Draggable` with several, and react-beautiful-dnd
refuses that. Its dimension marshal checks the owning droppable's mode and bails out:

> You are attempting to add or remove a Draggable while a drag is occurring. This is
> only supported for virtual lists.

The registration is then dropped, so the library keeps dragging against its original
dimensions while the rendered list has changed underneath it. Nothing throws — the
drag simply lands somewhere other than where it looks like it will, which in this
window means silently reordering the user's service list.

The machinery exists (`publishWhileDragging`, with `additions` and `removals`) but is
gated on `mode="virtual"`, which requires rendering the list through the clone API and
owning virtualisation ourselves. Migrating to `@hello-pangea/dnd` would not help: it is
a fork of the same code with the same restriction.

## Consequences

An instance can be dropped before or after a collapsed run, never into the middle of
one. Dropping into an expanded run works normally and splits it, as does dropping an
Active instance between two paused ones.

Because a stale index is the failure mode this rules out, `reorderLayout` identifies
the moved row by its draggable id rather than by the source index the drag reported.
That is not needed for correctness today — nothing rebuilds the layout mid-drag any
more — but it means a future rebuild degrades into a no-op rather than moving the
wrong row.

## Update — 2026-08-20

The drag library named above is now `@hello-pangea/dnd`; `react-beautiful-dnd` was
archived and we moved onto the maintained fork (#2). That migration was for maintenance
alone and changes nothing here: as this ADR already predicted, the fork carries the same
dimension-marshal check, so mid-drag expansion is still out. The decision stands, and
the routes to reopening it are unchanged — `mode="virtual"` with the clone API, or a
different drag library.
