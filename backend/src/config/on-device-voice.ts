/**
 * The Kokoro package the Android app downloads to voice Natural voices on the
 * phone, so they cost nothing and work offline. Built by
 * tools/kokoro-model/build.py (copy the values from its .json) and uploaded to
 * storage with `pnpm kokoro:upload`. Change the version to make phones download
 * a new package.
 */
export const ON_DEVICE_MODEL = {
  version: 1,
  key: 'models/listenup-kokoro-v1.zip',
  bytes: 165_495_317,
  unpackedBytes: 191_310_750,
  sha256: '818a72037ebc64010095b523f40de8687fc7551e158acc64663c969b0f09bbcb',
  /**
   * Kokoro voices in the package. Japanese isn't here: the phone's phonemizer
   * (espeak-ng) can't read kanji, so Japanese voices stay on the server.
   */
  speakers: [
    'af_heart', 'af_bella', 'am_michael', 'bf_emma', 'bm_george',
    'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi',
    'ef_dora', 'em_alex', 'pf_dora', 'pm_alex', 'ff_siwis',
    'if_sara', 'im_nicola', 'zf_xiaoxiao', 'zm_yunxi',
  ],
} as const
