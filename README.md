# hum

A small beat maker for the browser. Drums, piano, flute, synth, audio recording, clip editing, effects, `.hum` project files. No build step, no backend: projects live in your browser, and you can export or import them as `.hum` files.

## Run locally

```bash
python3 tools/serve.py 5173
```

Open http://localhost:5173. Any static server works; `tools/serve.py` just turns caching off.

## Test

```bash
for f in test/*.test.mjs; do node $f; done
```

## Deploy

`Dockerfile` serves the files with nginx on port 80. Point any Docker host at this repo (the Dockerfile is in the root).

## Credits

See [CREDITS.md](CREDITS.md). Sounds are CC0 (Sonic Pi samples) and CC BY 3.0 (FluidR3_GM notes).
