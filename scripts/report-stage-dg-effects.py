"""Turn the native effect audit into a reviewable, source-linked 221-row report.

Run tests/effect-progression.run.js in the native application first, save the CLI
result as output/stage-dg/effect-progression-native.json, then run this script.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
report = json.loads((ROOT / "output/stage-dg/effect-progression-native.json").read_text(encoding="utf-8"))
assert report["effects"] == 221 and report["immutable"] and not report["errors"]
owners = {}
for registry in ["src/editor/video/frame-effects.ts", "src/editor/video/effects/index.ts"]:
    text = (ROOT / registry).read_text(encoding="utf-8")
    imports = {}
    for names, filename in re.findall(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]", text):
        for name in names.split(","):
            imports[name.strip()] = filename.rsplit("/", 1)[-1] + ".ts"
    for kind, name in re.findall(r"\['([^']+)',\s*(\w+)\]", text):
        if name in imports:
            owners[kind] = imports[name]
owners.update(motionblur="motion-blur.ts", radialblur="radial-blur.ts", lensblur="lens-blur.ts")
assert len(owners) == 221 and len(set(owners.values())) == 221, (len(owners), len(set(owners.values())))
intentions = {}
for line in (ROOT / "Huelith_221_Effects_Comparison_2026-10-29.md").read_text(encoding="utf-8").splitlines():
    if re.match(r"\|\s*\d+\s*\|", line):
        columns = [column.strip() for column in line.strip("|").split("|")]
        intentions[columns[2].strip("`")] = columns[3]

lines = [
    "# Huelith v0.3-alpha: 221-effect native progression review",
    "",
    "Generated from real WebView2 Canvas rendering on 3 November 2026. All 221 existing names and IDs are preserved. Each image owner has an independent video copy under `src/editor/video/effects/`.",
    "",
    "This is a progression and integration audit, not a declaration of finished artistic fidelity. The intended behavior column comes from the owner's supplied 29 October comparison; its old implementation assessments are not treated as current proof.",
    "",
    "## Method and limits",
    "",
    "- Two 112×80 sources: opaque artwork with text, and isolated artwork with partial transparency and text. Values 0, 1, 5, 10, 25, 50, 75, 90 and 100, plus each declared minimum, maximum, initial value and midpoint, are rendered by the actual image processor.",
    "- Delta is mean absolute premultiplied RGBA difference from the immutable input, on a 0–255 scale. A large delta measures a change, not quality. Individual raw probes are in the JSON report.",
    "- Every video copy is compared with its image owner at amount 50 on both sources: maximum channel difference **0**. There were **0 processing errors**, and every source stayed unchanged.",
    "- All ten contact sheets were generated. Targeted visual review covers the repaired Emboss/Edges, signature strength changes, and outline width. The remaining rows are instrumented checks; they are not individual human art-direction approvals.",
    "- Native video H.264 frame comparisons and mixed/long worker stacks are documented in the implementation report. Individual H.264 exports of every one of the 221 effects, every secondary control, broad real-artwork coverage, and 4K playback are not certified.",
    "- Brightness, contrast, saturation and gamma have a neutral scale value; radius, threshold, palette count and spacing controls are not opacity. Box blur can still blur vertically when horizontal radius is zero. High-pass is an image representation, and palette quantization uses integer palette size. These cases must not be 'fixed' by fading every algorithm.",
    "- Sunburst Rays produced zero delta at the unlit default origin on these sources. A separate native check moved the origin onto a highlight: mean delta progressed 0, 0.18, 0.98, 4.96, 9.94, 19.88 at amounts 0, 1, 5, 25, 50, 100. The light-origin requirement is a conditional artistic behavior, not a claim of universal visible output.",
    "",
    "## Individual results",
    "",
    "Each owner filename below exists in both effect directories. The last column gives opaque / transparent mean delta at 1, 25, 50, 100; use it with the corresponding contact sheet and declared units.",
    "",
    "| # | ID / name | Implementation owner | Intended behavior | Declared range | Measured delta: 1 / 25 / 50 / 100 |",
    "|---:|---|---|---|---|---|",
]
for index, effect in enumerate(report["rows"], 1):
    kind = effect["id"]
    filename = owners[kind]
    for folder in ["src/editor/effects", "src/editor/video/effects"]:
        assert (ROOT / folder / filename).exists()
    deltas = []
    for case in effect["cases"]:
        values = {probe["value"]: probe["mean"] for probe in case["distances"]}
        deltas.append(" / ".join(f"{values[value]:.2f}" for value in [1, 25, 50, 100]))
    intention = intentions.get(kind, "See the individual algorithm and original comparison.").replace("|", "/")
    lines.append(f"| {index} | `{kind}` · {effect['name']} | [{filename}](../src/editor/effects/{filename}) | {intention} | {effect['min']}…{effect['max']} {effect['unit']} | {'; '.join(deltas)} |")
lines += ["", "## Reproducible evidence", "",
          "[Raw native report](../output/stage-dg/effect-progression-native.json) · [Native harness](../tests/effect-progression.run.js) · [Implementation and acceptance results](HUELITH_V03_STAGE_D_G_IMPLEMENTATION.md)", ""]
for index in range(1, 11):
    lines.append(f"- [Contact sheet {index}](../output/stage-dg/effect-progression-{index}.png)")
(ROOT / "docs/HUELITH_V03_221_EFFECT_REVIEW.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Reported {len(owners)} unique real owners and their video copies")
