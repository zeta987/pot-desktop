# Pot Desktop

A cross-platform translation and OCR desktop app. A single piece of source text is
sent to many translation backends at once, and every backend's answer is shown
side by side in one window.

## Language

### Services

**Service Instance**:
One configured use of a translation backend, identified by a `serviceName@randomId`
key. The same backend can appear many times with different settings, so "OpenAI"
is a backend but `openai@p0ms4y00ys` is a Service Instance.
_Avoid_: service, provider, engine, backend (when an instance is meant)

**Enabled**:
Whether a Service Instance appears in the translate window at all. Disabled
instances are configured but invisible.
_Avoid_: on, visible, shown

**Paused**:
Whether an Enabled Service Instance is skipped when a translation runs. A Paused
instance still appears in the translate window and can be resumed there without
opening settings. Enabled and Paused are two independent axes: an instance can be
Enabled and Paused at the same time.
_Avoid_: disabled, off, muted, stopped

**Active**:
An Enabled Service Instance that is not Paused. These are the instances that
actually translate.
_Avoid_: running, live, working

**Translation Run**:
One attempt to translate the current source text with one Service Instance, from the
moment the text is handed over until a result, a stream of chunks, or a failure comes
back. A Paused Run is a stretch of Service Instances; a Translation Run is a single
attempt by one of them. The two share a word and nothing else.
_Avoid_: request, call, job, task

### Translate window layout

**Target Area**:
The panel for one Service Instance in the translate window — its header, its
result body, and its action row. One Target Area per Enabled Service Instance.
_Avoid_: card, result box, panel

**Paused Run**:
A maximal stretch of consecutive Paused Service Instances in the translate
window's ordering. The ordering is user-controlled by drag, so a Paused Run is
defined by adjacency in that order, never by gathering Paused instances from
across the list. A Paused Run has no membership of its own: it is recomputed
from the ordering and the Paused flags after every change, so instances are
never added to or removed from one directly. Disabled instances are not in the
window's ordering at all, so a run reaches across one rather than being broken
by it.
_Avoid_: paused group, paused section, cluster
