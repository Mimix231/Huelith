# Huelith v0.2 — Order 2 Smart Transform Follow-up

## Behavior corrected
- `Ctrl+T`: select the **whole active layer** and activate on-canvas Move & Transform handles, without opening the numeric transform dialog.
- `Ctrl+Alt+T`: open the existing optional numeric Precision Transform dialog.
- Snapping now defaults to **ON**; toolbar snapping button toggles it and Alt temporarily bypasses it.
- Side and corner resize snapping operates on the **result of `resizedTransform`**, not merely on the raw mouse position.
- Respect Shift free-scale / default proportional-scale rules; snap only when the actual final rectangle meets the matching guide.
- Canvas boundary, canvas center and nearby-layer alignment guides remain native zoom-scaled lines.
- A dual-axis snap intersection receives a visible cyan (+) badge.
- New canvas pointer interactions must start inside the white document sheet; background panning is still allowed.
- The Move tool cannot drag the active layer from empty workspace or an empty portion of the canvas.
- Marquee drag endpoints are restricted to the document bounds.

## Automated tests
- `tests/order2-snap-fix.test.cjs`: shortcut wiring, final scaled-geometry alignment, aspect ratio, side handle constraints, and sheet-only hit testing.
- Existing Order 1 Gradient pixel tests and Order 2 transform tests remain in the release suite.

## Limits
- Performance at high zoom or with numerous visible layers depends on host hardware.
- Automated geometry and native pixel tests do not replace actual Windows/WebView2 pointer testing.
- The default document canvas rectangle is authoritative even if imported artwork has pixels beyond its visible boundaries.
