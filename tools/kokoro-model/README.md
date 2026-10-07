# On-device Kokoro package

The Android app downloads this package after install to make Natural voices on the phone: free, unlimited and offline. It is never bundled in the app.

## Build and upload

```bash
cd tools/kokoro-model
python3 -m venv .venv && .venv/bin/pip install onnx numpy
.venv/bin/python build.py            # writes out/listenup-kokoro-v1.zip and out/listenup-kokoro-v1.json

cd ../../backend
pnpm kokoro:upload                   # uploads the zip to storage (R2 in production)
```

**v1 is built and uploaded** (sha256 `818a7203…`); there's no need to run these again for it. The build refuses to overwrite a released version, because phones and the backend check the checksum. Builds are reproducible: the same contents give the same checksum.

If you change `build.py`, raise `VERSION`, build, copy the numbers from `out/listenup-kokoro-v<N>.json` into [`backend/src/config/on-device-voice.ts`](../../backend/src/config/on-device-voice.ts), deploy the backend, and upload. Phones offer the update on the Natural voices page. `pnpm kokoro:upload` refuses a zip that doesn't match the config.

## Timing it on a phone

With a phone connected over USB (debugging on):

```bash
./bench-phone.sh                                  # the package's model at 2 and 4 threads
.venv/bin/python build.py --try-conv16            # a trial model with float16 convolutions
./bench-phone.sh out/model.conv16.onnx            # compare both; samples land in work/bench/
```

The script uses sherpa-onnx's command-line tool, the same engine as the app, and removes everything it copied to the phone when it's done. If the trial model is clearly faster and its samples sound right, set `CONV_FP16 = True` and raise `VERSION` in `build.py`, build, then update the backend config and upload.

### Pixel 6 Pro (Tensor G1), 7 October 2026

| Model | Threads | RTF (below 1 keeps up) |
|---|---|---|
| v1 (float16 weights, float32 maths) | 1 / 2 / 3 / **4** / 6 / 8 | 1.62 / 1.00 / 1.05 / **0.88** / 1.48 / 1.54 |
| v1, pinned to the fast cores | 2 / 4 | 1.06 / 1.08 |
| sherpa-onnx int8 | 2 / 4 / 8 | 2.16 / 1.74 / 2.09 |
| v1 with XNNPACK / NNAPI | 4 | 0.87 / 0.93 (no real change) |
| float16 convolutions (`--try-conv16`) | 2 / 4 | 0.89 / 0.86, the same as v1 (a second v1 run gave 0.91 / 0.86), so it stays off |

Convolutions are 77% of the work (ONNX Runtime profile). Running them in float16 didn't help: ONNX Runtime 1.28 in sherpa-onnx doesn't seem to speed up these convolutions on the phone's CPU.

## What's in it (v1)

| | |
|---|---|
| Source | sherpa-onnx `kokoro-multi-lang-v1_0` (Kokoro-82M v1.0, Apache-2.0) |
| Model | float16 weights, each cast back to float32 when the model loads. Half the size of float32 at the same speed. |
| Download | 165 MB (191 MB unpacked) |
| Voices | The 18 Natural voices in [`voice-catalog.ts`](../../backend/src/modules/voices/voice-catalog.ts), without Japanese |
| Languages | English (US, UK), Hindi, Spanish, Portuguese (Brazil), French, Italian, Mandarin |

### Why not sherpa-onnx's int8 model (132 MB)?

On a Ryzen 7 7700 it was about 3× slower than float32 (0.62 against 0.19 seconds of work per second of speech, 4 threads). The weights-only float16 file keeps float32 speed at 163 MB. The Voice lab in the app (long-press the intro on the Natural voices page) measures this on real phones.

### Checked (Oct 2026)

Whisper `small` heard the expected words in every language, and the float16 file read them exactly as float32 did. Japanese failed: espeak-ng can't read kanji ("記事" came out as "地主"), so Japanese voices stay on the server.

### Things to know

- **Numbers in Chinese:** sherpa-onnx's Chinese number rules (`*.fst`) rewrite numbers in every language ("42" in English came out in Chinese), so they're switched off. The app writes digits out in Chinese text before speaking (`frontend/modules/kokoro-voice/chinese-numbers.ts`).
- **English lexicons** aren't used by this sherpa-onnx version for Kokoro v1.0 (espeak-ng reads English), so they're left out.
- **Licence:** sherpa-onnx and Kokoro are Apache-2.0, but sherpa-onnx includes espeak-ng, which is GPL-3.0. Have this checked before release.
