"""
Builds the Kokoro package the Android app downloads for on-device Natural voices.

It starts from sherpa-onnx's full-precision Kokoro v1.0 and:
- stores the weights as float16, each followed by a Cast to float32. ONNX Runtime
  folds the casts when it loads the model, so the phone runs it in float32. The
  file is half the size and as fast as float32. sherpa-onnx's own int8 model is
  smaller but about 3x slower (Ryzen 7 7700, Oct 2026).
- keeps only the voices ListenUp uses (SPEAKERS) and rewrites the model's
  speaker metadata to match
- keeps only the espeak-ng dictionaries for those languages, plus Chinese
  (lexicon and jieba), and drops the English lexicons, which this sherpa-onnx
  version doesn't use for Kokoro v1.0

Output, in ./out:
- listenup-kokoro-v<VERSION>.zip, to upload where the app can download it (R2)
- listenup-kokoro-v<VERSION>.json, the values for the backend's KOKORO_MODEL_* settings

Usage:
  python3 -m venv .venv && .venv/bin/pip install onnx numpy
  .venv/bin/python build.py
  .venv/bin/python build.py --try-conv16   # only writes out/model.conv16.onnx, to time on a phone (bench-phone.sh)
"""

import hashlib
import json
import sys
import shutil
import tarfile
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

# Bump when the package changes, so phones download the new one
VERSION = 1

# Run the convolutions (77% of the work) in float16. Phones since about 2018
# (ARMv8.2) do float16 maths natively, which may make them much faster. Turn on
# only after bench-phone.sh shows it's faster and the samples sound right.
CONV_FP16 = False

SOURCE_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2"

# Natural voices voiced on the phone: backend/src/modules/voices/voice-catalog.ts.
# Japanese (jf_*, jm_*) is left out: espeak-ng can't read kanji, so those voices
# stay on the server, where misaki reads Japanese properly.
SPEAKERS = [
    "af_heart", "af_bella", "am_michael", "bf_emma", "bm_george",
    "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
    "ef_dora", "em_alex", "pf_dora", "pm_alex", "ff_siwis",
    "if_sara", "im_nicola", "zf_xiaoxiao", "zm_yunxi",
]

# espeak-ng dictionaries for the languages above (Chinese uses its own lexicon)
ESPEAK_DICTS = ["en_dict", "es_dict", "fr_dict", "hi_dict", "it_dict", "pt_dict"]

# Kokoro's style vectors: 510 lengths x 256 values (float32) per voice
STYLE_FLOATS = 510 * 256

HERE = Path(__file__).parent
WORK = HERE / "work"
OUT = HERE / "out"


def fetch_source() -> Path:
    src = WORK / "kokoro-multi-lang-v1_0"
    if (src / "model.onnx").exists():
        return src
    WORK.mkdir(exist_ok=True)
    archive = WORK / "source.tar.bz2"
    if not archive.exists():
        print(f"Downloading {SOURCE_URL}")
        urllib.request.urlretrieve(SOURCE_URL, archive)
    with tarfile.open(archive) as tar:
        tar.extractall(WORK, filter="data")
    return src


def read_meta(model: onnx.ModelProto) -> dict[str, str]:
    return {p.key: p.value for p in model.metadata_props}


def set_meta(model: onnx.ModelProto, values: dict[str, str]):
    del model.metadata_props[:]
    for key, value in values.items():
        model.metadata_props.add(key=key, value=value)


def half_weights(model: onnx.ModelProto) -> int:
    """float16 storage, float32 compute: each large float initializer gets a Cast"""
    graph = model.graph
    kept, casts = [], []
    for init in graph.initializer:
        if init.data_type == TensorProto.FLOAT and np.prod(init.dims) >= 1024:
            values = numpy_helper.to_array(init)
            if np.abs(values).max() < 65000:
                half = numpy_helper.from_array(values.astype(np.float16), f"{init.name}_fp16")
                kept.append(half)
                casts.append(helper.make_node("Cast", [half.name], [init.name], to=TensorProto.FLOAT, name=f"{init.name}_cast"))
                continue
        kept.append(init)
    del graph.initializer[:]
    graph.initializer.extend(kept)
    nodes = list(graph.node)
    del graph.node[:]
    graph.node.extend(casts + nodes)
    return len(casts)


def conv_fp16(model: onnx.ModelProto) -> int:
    """Each Conv and ConvTranspose computes in float16, with casts in and out"""
    graph = model.graph
    nodes, count = [], 0
    for node in graph.node:
        if node.op_type not in ("Conv", "ConvTranspose"):
            nodes.append(node)
            continue
        count += 1
        inputs = []
        for i, name in enumerate(node.input):
            if not name:
                inputs.append(name)
                continue
            half = f"{name}__h{count}_{i}"
            nodes.append(helper.make_node("Cast", [name], [half], to=TensorProto.FLOAT16, name=f"{half}_cast"))
            inputs.append(half)
        out = node.output[0]
        attrs = {a.name: helper.get_attribute_value(a) for a in node.attribute}
        nodes.append(helper.make_node(node.op_type, inputs, [f"{out}__h"], name=node.name, **attrs))
        nodes.append(helper.make_node("Cast", [f"{out}__h"], [out], to=TensorProto.FLOAT, name=f"{out}_back"))
    del graph.node[:]
    graph.node.extend(nodes)
    return count


def main():
    trial = "--try-conv16" in sys.argv
    released = OUT / f"listenup-kokoro-v{VERSION}.zip"
    # A released package must never change under the same version: phones and
    # the backend check its checksum. Raise VERSION for a new one.
    if released.exists() and not trial and "--force" not in sys.argv:
        raise SystemExit(f"{released.name} already exists. Raise VERSION in build.py for a new package (or pass --force to rebuild it).")

    src = fetch_source()
    stage = WORK / f"stage-v{VERSION}"
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)

    model = onnx.load(src / "model.onnx")
    meta = read_meta(model)
    names = meta["speaker_names"].split(",")
    missing = [s for s in SPEAKERS if s not in names]
    if missing:
        raise SystemExit(f"Not in the model: {missing}")

    # Voices: only ours, in SPEAKERS order, so speaker id = index in SPEAKERS
    voices = np.fromfile(src / "voices.bin", dtype=np.float32).reshape(len(names), STYLE_FLOATS)
    voices[[names.index(s) for s in SPEAKERS]].tofile(stage / "voices.bin")
    meta.update(
        n_speakers=str(len(SPEAKERS)),
        speaker_names=",".join(SPEAKERS),
        id2speaker=",".join(f"{i}->{s}" for i, s in enumerate(SPEAKERS)),
        speaker2id=",".join(f"{s}->{i}" for i, s in enumerate(SPEAKERS)),
        comment=f"ListenUp on-device package v{VERSION}: Kokoro v1.0, float16 weights with float32 compute",
    )
    set_meta(model, meta)
    print(f"Halved {half_weights(model)} weights")
    if trial:
        trial = onnx.ModelProto()
        trial.CopyFrom(model)
        print(f"Trial: {conv_fp16(trial)} convolutions in float16")
        OUT.mkdir(exist_ok=True)
        onnx.save(trial, OUT / "model.conv16.onnx")
        # Only the trial model: the package (and its checksum) stays as it is
        return
    if CONV_FP16:
        print(f"{conv_fp16(model)} convolutions in float16")
    onnx.save(model, stage / "model.onnx")

    for name in ["tokens.txt", "lexicon-zh.txt", "date-zh.fst", "number-zh.fst", "phone-zh.fst", "LICENSE"]:
        shutil.copy(src / name, stage / name)
    shutil.copytree(src / "dict", stage / "dict")
    shutil.copytree(
        src / "espeak-ng-data",
        stage / "espeak-ng-data",
        ignore=lambda _, files: [f for f in files if f.endswith("_dict") and f not in ESPEAK_DICTS],
    )
    (stage / "speakers.txt").write_text("\n".join(SPEAKERS) + "\n")

    OUT.mkdir(exist_ok=True)
    zip_path = OUT / f"listenup-kokoro-v{VERSION}.zip"
    # Fixed dates and permissions, so the same contents always give the same checksum
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(stage.rglob("*")):
            if f.is_file():
                info = zipfile.ZipInfo(f.relative_to(stage).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                z.writestr(info, f.read_bytes(), compresslevel=9)

    sha = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    unpacked = sum(f.stat().st_size for f in stage.rglob("*") if f.is_file())
    manifest = {
        "version": VERSION,
        "file": zip_path.name,
        "bytes": zip_path.stat().st_size,
        "unpackedBytes": unpacked,
        "sha256": sha,
        "speakers": SPEAKERS,
    }
    (OUT / f"listenup-kokoro-v{VERSION}.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
