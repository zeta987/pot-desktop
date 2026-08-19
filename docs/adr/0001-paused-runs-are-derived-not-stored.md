# Paused Runs are derived, not stored

The translate window collapses stretches of Paused Service Instances so that a long
service list stays readable. We considered making those stretches a first-class,
user-managed entity — one the user could name, and move instances into and out of —
but chose instead to keep a Paused Run purely derived: recomputed from the window's
ordering and each instance's Paused flag every time either changes.

## Considered Options

**Derived (chosen).** A Paused Run is a maximal stretch of consecutive Paused
instances. It has no stored membership, no identity, and therefore no name. Resuming
one instance in the middle of a run splits it in two; dragging an Active instance
into a run splits it as well. Both happen automatically because there is nothing to
keep in sync.

**First-class entity (rejected).** Groups would carry their own name, membership list
and ordering, stored alongside `translate_service_list`, with Paused reduced to "does
this instance translate". This is the only model that can support naming, because a
name needs something stable to attach to.

## Consequences

Groups cannot be named, and the user cannot curate membership directly — the only way
to change what a run contains is to reorder instances or pause and resume them. That
limitation is deliberate: the first-class model buys naming at the cost of a stored
data structure with its own CRUD, its own migration story, and a second source of
truth that can drift out of sync with the ordering it shadows.

It also preserves a safety property the stored model would have lost. Because a Paused
Run contains only Paused instances by definition, a collapsed run can never hide an
Active instance — so the window never conceals a translation that is running and being
paid for.
