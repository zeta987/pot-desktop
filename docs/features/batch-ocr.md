**Multi-service OCR results window**

The OCR window runs recognition across multiple configured service instances in parallel, rendering one independent result card per service. Services are referenced by full instance keys (legacy key or `backend@id`), so multiple instances of the same backend can run side by side.

Automatic OCR is driven by the persisted `recognize_auto_service_list`. A missing value falls back to the first configured service; an empty list disables automatic OCR entirely, and newly added services are never auto-added. The workspace mounts only after configuration hydration. On top of the pre-selected list, each window keeps its own selection: window-only services can be checked or unchecked without touching persisted settings, and the selection stays in effect for every screenshot until the window closes. Checking an additional service starts only that service's request; "Recognize selected" reruns the currently checked services only — never every configured service — and retry affects a single card. Each card owns its request guard, result, error, and edit state, and carries its own translate, copy, edit, and retry actions scoped to its current result.

A service is reported as unavailable when it currently lacks a built-in implementation or plugin metadata; lower-level loader errors are surfaced verbatim and separately.

Auto-copy targets exactly the service that was first in configuration order among the pre-selected services when the window opened. Unchecking that service in the window, or its recognition failing, never re-targets auto-copy to another service.

Every screenshot is treated as a new identity, even with identical bytes. Loading a new image immediately invalidates all previous card results and any pending auto-copy in the UI; in-flight provider requests are not guaranteed to be aborted, and their late results are discarded. Image load failures are shown with a localized prefix followed by the raw error. Translate and chat follow-up behavior are unchanged. Note: some legacy services read a shared PNG file, so filesystem snapshots are not guaranteed immutable even though the UI guards each generation.
