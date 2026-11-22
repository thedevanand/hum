// Downloads the starter sound library, then rebuilds sounds/index.json.
// Run from the project root: node tools/fetch-sounds.mjs
// To add your own sounds later: drop files in sounds/<Category>/ and run: node tools/fetch-sounds.mjs --index
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// CC0 samples shipped with Sonic Pi (see CREDITS.md)
const SONIC = 'https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/dev/etc/samples/';
const LIB = {
  Kicks: 'bd_808 bd_haus bd_boom bd_tek bd_klub bd_fat bd_zum drum_heavy_kick drum_bass_hard elec_soft_kick',
  Snares: 'sn_dolf sn_dub sn_generic sn_zome drum_snare_hard drum_snare_soft elec_snare elec_hi_snare perc_snap perc_snap2',
  Hats: 'drum_cymbal_closed drum_cymbal_open drum_cymbal_pedal hat_snap hat_tap hat_zild hat_cab hat_raw elec_cymbal ride_tri drum_splash_hard',
  Percussion: 'drum_tom_hi_hard drum_tom_mid_hard drum_tom_lo_hard drum_cowbell elec_tick elec_wood elec_bong elec_blip elec_bell elec_triangle elec_pop tabla_na tabla_ghe1 tabla_tun1 tabla_te1 perc_bell',
  Bass: 'bass_hit_c bass_hard_c bass_thick_c bass_drop_c bass_woodsy_c bass_dnb_f bass_trance_c',
  Loops: 'loop_amen loop_breakbeat loop_compus loop_industrial loop_mika loop_safari loop_tabla loop_perc1 loop_perc2 loop_electric loop_garzul',
  Textures: 'ambi_choir ambi_piano ambi_swoosh ambi_soft_buzz guit_harmonics guit_e_fifths guit_em9 vinyl_scratch vinyl_backspin vinyl_rewind tbd_pad_1 tbd_voctone perc_swash misc_cineboom',
};

// CC BY 3.0 FluidR3_GM notes, one every minor third (the sampler repitches the gaps)
const FLUID = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
const NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const INST = { piano: ['acoustic_grand_piano', 36, 84], flute: ['flute', 60, 96] };

const jobs = [];
for (const [cat, names] of Object.entries(LIB))
  for (const n of names.split(' ')) jobs.push([`sounds/${cat}/${n}.flac`, `${SONIC}${n}.flac`]);
for (const [dir, [gm, lo, hi]] of Object.entries(INST))
  for (let m = lo; m <= hi; m += 3) jobs.push([`sounds/_inst/${dir}/${m}.mp3`, `${FLUID}${gm}-mp3/${NOTE[m % 12]}${Math.floor(m / 12) - 1}.mp3`]);

if (!process.argv.includes('--index')) {
  let failed = 0;
  await Promise.all(jobs.map(async ([path, url]) => {
    if (await stat(path).catch(() => null)) return;
    const res = await fetch(url);
    if (!res.ok) { failed++; return console.error(`FAIL ${res.status} ${url}`); }
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }));
  console.log(`${jobs.length - failed}/${jobs.length} files present`);
  if (failed) process.exitCode = 1;
}

// duration + 40 loudness bars per sound, so the library can draw waveforms without downloading audio (needs ffmpeg; skipped without it)
function peaks(path) {
  try {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)), n = 40, out = []; // slice: Buffer offsets are not always 4-byte aligned
    for (let i = 0; i < n; i++) { let p = 0; for (let j = Math.floor((i * x.length) / n), e = Math.floor(((i + 1) * x.length) / n); j < e; j++) p = Math.max(p, Math.abs(x[j])); out.push(p); }
    const top = Math.max(...out, 1e-6);
    return { dur: +(x.length / 8000).toFixed(2), peaks: out.map(p => Math.round((p / top) * 9)).join('') };
  } catch { return {}; }
}

// index.json = every audio file in sounds/<Category>/ (folders starting with _ are instrument samples, not library)
const index = [];
for (const cat of (await readdir('sounds', { withFileTypes: true })).filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name).sort())
  for (const f of (await readdir(`sounds/${cat}`)).filter(f => /\.(flac|mp3|wav|ogg|m4a)$/i.test(f)).sort())
    index.push({ cat, file: `${cat}/${f}`, ...peaks(`sounds/${cat}/${f}`) });
await writeFile('sounds/index.json', JSON.stringify(index));
console.log(`index.json: ${index.length} sounds`);
