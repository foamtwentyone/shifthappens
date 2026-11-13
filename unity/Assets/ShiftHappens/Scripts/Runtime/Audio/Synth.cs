// Fully synthesized audio: SFX, gibberish voices, machine loops and two music loops,
// rendered into AudioClips at startup. No audio files needed.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace ShiftHappens
{
    public class Synth
    {
        const int SR = 44100;
        readonly Dictionary<string, AudioClip> sfx = new Dictionary<string, AudioClip>();
        readonly List<AudioClip> voices = new List<AudioClip>();
        readonly AudioSource[] pool = new AudioSource[12];
        int poolIdx;
        readonly AudioSource music, beltLoop, fanLoop, boilerLoop;
        AudioClip lounge, funk;
        string mood = "off";
        public Vector3 listener;
        static readonly System.Random rng = new System.Random(7);

        public Synth(Transform parent)
        {
            var go = new GameObject("Audio");
            go.transform.SetParent(parent, false);
            for (int i = 0; i < pool.Length; i++) { pool[i] = go.AddComponent<AudioSource>(); pool[i].playOnAwake = false; }
            music = go.AddComponent<AudioSource>(); music.loop = true; music.playOnAwake = false;
            beltLoop = Loop(go, Render(2f, t => Noise() * 0.25f * Lp(t) + Mathf.Sin(t * 48 * Mathf.PI * 2) * 0.15f));
            fanLoop = Loop(go, Render(2f, t => Noise() * 0.3f));
            boilerLoop = Loop(go, Render(2f, t => Mathf.Sin(t * 38 * Mathf.PI * 2) * 0.5f + Noise() * 0.06f));
            Build();
        }

        static float lpState;
        static float Lp(float t) { return 1; }
        static float Noise() => (float)(rng.NextDouble() * 2 - 1);

        static AudioSource Loop(GameObject go, AudioClip clip)
        {
            var s = go.AddComponent<AudioSource>();
            s.clip = clip; s.loop = true; s.volume = 0; s.playOnAwake = false; s.Play();
            return s;
        }

        static AudioClip Render(float seconds, Func<float, float> f, string name = "clip")
        {
            int n = Mathf.CeilToInt(seconds * SR);
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(f(i / (float)SR), -1, 1);
            var c = AudioClip.Create(name, n, 1, SR, false);
            c.SetData(data, 0);
            return c;
        }

        // ── tiny DSP helpers (time-domain, per-sample) ──
        static float Env(float t, float a, float d) => t < a ? t / a : Mathf.Exp(-(t - a) / Mathf.Max(0.001f, d) * 4) * (t < a + d * 1.6f ? 1 : 0);
        static float Sq(float ph) => (ph % 1) < 0.5f ? 1 : -1;
        static float Saw(float ph) => (ph % 1) * 2 - 1;
        static float Tri(float ph) => 1 - 4 * Mathf.Abs((ph % 1) - 0.5f);

        // tone with exponential frequency slide
        static Func<float, float> Tone(float f0, float f1, float dur, string wave = "sine", float vol = 0.3f, float delay = 0)
        {
            float ph = 0, lastT = -1;
            return t =>
            {
                t -= delay;
                if (t < 0 || t > dur) return 0;
                float f = f0 * Mathf.Pow(f1 / f0, t / dur);
                float dt = lastT < 0 ? 0 : t - lastT; lastT = t;
                ph += f * dt;
                float s = wave == "square" ? Sq(ph) * 0.5f : wave == "saw" ? Saw(ph) * 0.5f : wave == "tri" ? Tri(ph) : Mathf.Sin(ph * Mathf.PI * 2);
                return s * vol * Env(t, 0.005f, dur);
            };
        }

        // filtered noise burst (one-pole low/high pass approximations)
        static Func<float, float> NoiseHit(float dur, float vol, float bright, float delay = 0)
        {
            float lp = 0;
            return t =>
            {
                t -= delay;
                if (t < 0 || t > dur) return 0;
                float n = Noise();
                lp += (n - lp) * bright;
                return (bright > 0.5f ? n - lp * 0.5f : lp) * vol * Env(t, 0.003f, dur);
            };
        }

        static Func<float, float> Mix(params Func<float, float>[] parts) => t => { float s = 0; foreach (var p in parts) s += p(t); return s; };

        void Add(string name, float dur, params Func<float, float>[] parts) => sfx[name] = Render(dur, Mix(parts), name);

        void Build()
        {
            Add("ui", 0.06f, Tone(1400, 1400, 0.04f, "square", 0.08f));
            Add("button", 0.15f, Tone(520, 520, 0.08f, "tri", 0.3f), Tone(1040, 1040, 0.05f, "sine", 0.15f, 0.03f));
            Add("lever", 0.2f, NoiseHit(0.04f, 0.3f, 0.7f), Tone(170, 80, 0.12f, "square", 0.15f, 0.03f));
            Add("breaker", 0.4f, NoiseHit(0.09f, 0.6f, 0.15f), Tone(70, 40, 0.35f, "saw", 0.25f));
            Add("estop", 0.35f, Tone(120, 60, 0.3f, "square", 0.3f), NoiseHit(0.15f, 0.4f, 0.1f));
            Add("grab", 0.1f, Tone(420, 760, 0.07f, "sine", 0.3f));
            Add("drop", 0.1f, Tone(320, 150, 0.08f, "sine", 0.25f));
            Add("throw", 0.3f, NoiseHit(0.28f, 0.35f, 0.3f));
            Add("thud", 0.22f, Tone(110, 38, 0.18f, "sine", 0.5f), NoiseHit(0.07f, 0.3f, 0.1f));
            var brk = new List<Func<float, float>> { NoiseHit(0.35f, 0.5f, 0.9f) };
            for (int i = 0; i < 6; i++) { float f = 1800 + (float)rng.NextDouble() * 2600; brk.Add(Tone(f, f, 0.15f + (float)rng.NextDouble() * 0.2f, "sine", 0.1f, i * 0.035f)); }
            Add("break", 0.6f, brk.ToArray());
            Add("jump", 0.16f, Tone(260, 520, 0.14f, "square", 0.08f));
            Add("knock", 0.65f, Tone(220, 120, 0.08f, "square", 0.18f), Tone(1400, 260, 0.55f, "sine", 0.12f, 0.05f));
            Add("alarm", 0.9f, Tone(660, 880, 0.22f, "saw", 0.12f), Tone(880, 660, 0.22f, "saw", 0.12f, 0.22f), Tone(660, 880, 0.22f, "saw", 0.12f, 0.45f), Tone(880, 660, 0.22f, "saw", 0.12f, 0.67f));
            Add("klaxon", 1.0f, Tone(330, 330, 0.25f, "saw", 0.15f), Tone(330, 330, 0.25f, "saw", 0.15f, 0.32f), Tone(330, 330, 0.25f, "saw", 0.15f, 0.64f), Tone(415, 415, 0.9f, "square", 0.05f));
            Add("burst", 2.2f, NoiseHit(1.6f, 0.9f, 0.08f), Tone(60, 25, 0.8f, "sine", 0.8f), NoiseHit(2f, 0.25f, 0.9f, 0.2f));
            Add("ship", 0.9f, NoiseHit(0.35f, 0.3f, 0.4f), Tone(1320, 1320, 0.6f, "sine", 0.2f, 0.3f), Tone(1980, 1980, 0.5f, "sine", 0.1f, 0.32f));
            Add("paid", 0.35f, Tone(1600, 1600, 0.06f, "square", 0.08f), Tone(2400, 2400, 0.25f, "square", 0.07f, 0.07f), NoiseHit(0.15f, 0.12f, 0.9f, 0.06f));
            Add("reject", 0.45f, Tone(110, 110, 0.4f, "saw", 0.25f), Tone(116, 116, 0.4f, "saw", 0.2f));
            Add("scan", 0.2f, Tone(1500, 1500, 0.06f, "sine", 0.15f), Tone(1900, 1900, 0.08f, "sine", 0.15f, 0.09f));
            Add("dispense", 0.4f, NoiseHit(0.3f, 0.4f, 0.12f), Tone(90, 50, 0.2f, "sine", 0.35f, 0.12f));
            Add("tube", 0.65f, NoiseHit(0.6f, 0.45f, 0.35f));
            Add("tubeout", 0.3f, NoiseHit(0.25f, 0.35f, 0.5f), Tone(300, 600, 0.1f, "sine", 0.12f));
            var q = new List<Func<float, float>>();
            int[] arp = { 0, 4, 7, 12, 16 };
            for (int i = 0; i < arp.Length; i++) { float f = Note(72 + arp[i]); q.Add(Tone(f, f, 0.35f, "square", 0.08f, i * 0.09f)); }
            foreach (int n in new[] { 0, 4, 7 }) { float f = Note(60 + n); q.Add(Tone(f, f, 0.9f, "tri", 0.14f, 0.45f)); }
            Add("quota", 1.5f, q.ToArray());
            Add("fail", 1.0f, Tone(Note(67), Note(67), 0.3f, "square", 0.08f), Tone(Note(64), Note(64), 0.3f, "square", 0.08f, 0.18f), Tone(Note(60), Note(60), 0.3f, "square", 0.08f, 0.36f), Tone(Note(55), Note(55), 0.4f, "square", 0.08f, 0.54f));
            var ph = new List<Func<float, float>>();
            for (int i = 0; i < 10; i++) ph.Add(Tone(i % 2 == 1 ? 480 : 440, i % 2 == 1 ? 480 : 440, 0.05f, "square", 0.08f, i * 0.05f));
            Add("phone", 0.55f, ph.ToArray());
            Add("beep", 0.14f, Tone(880, 880, 0.12f, "square", 0.1f));
            Add("horn", 1.4f, Tone(220, 220, 1.3f, "saw", 0.12f), Tone(277, 277, 1.3f, "saw", 0.12f), Tone(330, 330, 1.3f, "saw", 0.12f));
            Add("powerdown", 1f, Tone(420, 30, 0.9f, "saw", 0.15f), NoiseHit(0.5f, 0.3f, 0.1f));
            Add("powerup", 0.8f, Tone(40, 420, 0.7f, "saw", 0.12f), Tone(1200, 1200, 0.1f, "sine", 0.1f, 0.6f));
            Add("hop", 0.14f, Tone(200, 500, 0.12f, "sine", 0.15f));
            Add("slosh", 0.4f, NoiseHit(0.35f, 0.35f, 0.15f));
            Add("fixed", 0.7f, NoiseHit(0.03f, 0.3f, 0.8f), NoiseHit(0.03f, 0.3f, 0.8f, 0.06f), NoiseHit(0.03f, 0.3f, 0.8f, 0.12f), Tone(1046, 1046, 0.4f, "sine", 0.15f, 0.26f), Tone(1568, 1568, 0.4f, "sine", 0.1f, 0.3f));
            Add("wrench", 0.05f, NoiseHit(0.03f, 0.2f, 0.8f));
            Add("paper", 0.14f, NoiseHit(0.12f, 0.25f, 0.9f));
            Add("punch", 0.6f, NoiseHit(0.05f, 0.6f, 0.1f), Tone(1760, 1760, 0.5f, "sine", 0.12f, 0.05f));
            Add("locker", 0.45f, Tone(523, 523, 0.4f, "square", 0.04f), Tone(731, 731, 0.4f, "square", 0.04f), Tone(1110, 1110, 0.4f, "square", 0.04f), NoiseHit(0.1f, 0.4f, 0.5f));
            Add("vend", 0.9f, NoiseHit(0.1f, 0.5f, 0.1f), NoiseHit(0.6f, 0.12f, 0.9f, 0.25f));
            Add("spray", 0.26f, NoiseHit(0.25f, 0.2f, 0.95f));
            Add("valve", 0.22f, NoiseHit(0.2f, 0.18f, 0.6f));
            Add("shove", 0.15f, NoiseHit(0.12f, 0.35f, 0.3f), Tone(150, 90, 0.1f, "square", 0.1f));
            Add("burn", 0.65f, NoiseHit(0.6f, 0.4f, 0.2f), Tone(80, 50, 0.3f, "saw", 0.12f));
            Add("airlock", 1.05f, NoiseHit(1.0f, 0.35f, 0.08f), Tone(55, 55, 1.0f, "saw", 0.08f));
            Add("denied", 0.3f, Tone(180, 180, 0.12f, "square", 0.15f), Tone(140, 140, 0.15f, "square", 0.15f, 0.13f));
            sfx["bigbutton"] = sfx["button"];
            // a handful of gibberish syllable strings at different pitches
            for (int v = 0; v < 8; v++)
            {
                float f0 = 160 + v * 28;
                var parts = new List<Func<float, float>>();
                for (int s = 0; s < 3; s++) { float f = f0 * (1 + (float)(rng.NextDouble() - 0.5) * 0.3f); parts.Add(Tone(f, f * (v % 2 == 0 ? 1.2f : 0.7f), 0.12f, "saw", 0.18f, s * 0.11f)); }
                voices.Add(Render(0.4f, Mix(parts.ToArray()), "voice" + v));
            }
            lounge = RenderMusic(false);
            funk = RenderMusic(true);
        }

        static float Note(int n) => 440f * Mathf.Pow(2, (n - 69) / 12f);

        AudioClip RenderMusic(bool fast)
        {
            float bpm = fast ? 116 : 90;
            float step = 60f / bpm / 4;
            int steps = 64;
            float dur = step * steps;
            var parts = new List<Func<float, float>>();
            if (!fast)
            {
                int[][] chords = { new[] { 62, 65, 69, 72 }, new[] { 55, 59, 62, 65 }, new[] { 60, 64, 67, 71 }, new[] { 57, 61, 64, 67 } };
                int[] roots = { 38, 43, 36, 45 };
                for (int bar = 0; bar < 4; bar++)
                {
                    float b0 = bar * 16 * step;
                    foreach (int s in new[] { 0, 10 }) foreach (int n in chords[bar]) parts.Add(Tone(Note(n), Note(n), step * 6, "tri", 0.035f, b0 + s * step));
                    for (int s = 0; s < 16; s += 4) { int w = new[] { 0, 7, 12, 10 }[s / 4]; parts.Add(Tone(Note(roots[bar] + w), Note(roots[bar] + w), step * 3.5f, "tri", 0.16f, b0 + s * step)); }
                    foreach (int s in new[] { 0, 8 }) parts.Add(Tone(140, 40, 0.22f, "sine", 0.22f, b0 + s * step));
                    for (int s = 1; s < 16; s += 2) parts.Add(NoiseHit(0.04f, 0.03f, 0.95f, b0 + s * step));
                }
            }
            else
            {
                int?[] bass = { 0, null, 0, 12, null, 10, null, 7, 0, null, 3, null, 5, null, 7, 10 };
                int[] roots = { 36, 36, 41, 43 };
                int?[] riff = { 72, null, 75, 77, null, 79, null, 77, 75, null, 72, null, 70, null, 72, null };
                for (int bar = 0; bar < 4; bar++)
                {
                    float b0 = bar * 16 * step;
                    for (int s = 0; s < 16; s++)
                    {
                        float t0 = b0 + s * step;
                        if (s % 4 == 0) parts.Add(Tone(140, 40, 0.22f, "sine", 0.4f, t0));
                        if (s == 4 || s == 12) parts.Add(NoiseHit(0.16f, 0.2f, 0.6f, t0));
                        if (s % 2 == 0) parts.Add(NoiseHit(s == 6 || s == 14 ? 0.18f : 0.04f, 0.05f, 0.95f, t0));
                        if (bass[s].HasValue) { float f = Note(roots[bar] + bass[s].Value); parts.Add(Tone(f, f, step * 1.6f, "saw", 0.12f, t0)); }
                        if (riff[s].HasValue && (bar != 3 || s < 8)) { float f = Note(riff[s].Value); parts.Add(Tone(f, f, step * 1.5f, "sine", 0.08f, t0)); }
                    }
                }
            }
            // render: sum all parts (cheap enough for a 8-10 s loop with a few hundred notes)
            int n2 = Mathf.CeilToInt(dur * SR);
            var data = new float[n2];
            foreach (var p in parts)
            {
                for (int i = 0; i < n2; i++) data[i] += p(i / (float)SR);
            }
            for (int i = 0; i < n2; i++) data[i] = Mathf.Clamp(data[i], -1, 1);
            var c = AudioClip.Create(fast ? "funk" : "lounge", n2, 1, SR, false);
            c.SetData(data, 0);
            return c;
        }

        public void Play(string name, Vector3? viewPos = null, float vol = 1)
        {
            if (!sfx.TryGetValue(name ?? "", out var clip)) return;
            var s = pool[poolIdx = (poolIdx + 1) % pool.Length];
            float att = 1, pan = 0;
            if (viewPos.HasValue)
            {
                var d = viewPos.Value - listener;
                att = Mathf.Clamp(1.4f - new Vector2(d.x, d.z).magnitude / 26f, 0.08f, 1);
                pan = Mathf.Clamp(d.x / 18f, -0.8f, 0.8f);
            }
            s.panStereo = pan;
            s.pitch = 1 + UnityEngine.Random.Range(-0.04f, 0.04f);
            s.PlayOneShot(clip, Settings.Master * Settings.Sfx * vol * att);
        }

        public void Voice(int pid, string kind, Vector3? viewPos)
        {
            var s = pool[poolIdx = (poolIdx + 1) % pool.Length];
            s.pitch = kind == "oof" ? 0.75f : kind == "wee" ? 1.35f : kind == "yelp" ? 1.5f : 1.1f;
            s.panStereo = viewPos.HasValue ? Mathf.Clamp((viewPos.Value.x - listener.x) / 18f, -0.8f, 0.8f) : 0;
            s.PlayOneShot(voices[Mathf.Abs(pid) % voices.Count], Settings.Master * Settings.Sfx * 0.9f);
        }

        public void SetMood(string m)
        {
            music.volume = Settings.Master * Settings.Music * 0.5f;
            if (m == mood) return;
            mood = m;
            if (m == "off") { music.Stop(); return; }
            var clip = m == "shift" || m == "overtime" ? funk : lounge;
            music.pitch = m == "overtime" ? 1.12f : 1;
            if (music.clip != clip) { music.clip = clip; music.Play(); }
            else if (!music.isPlaying) music.Play();
        }

        public void Loops(float belt, float fan, float boiler)
        {
            float m = Settings.Master * Settings.Sfx;
            beltLoop.volume = Mathf.Lerp(beltLoop.volume, belt * m, 0.1f);
            fanLoop.volume = Mathf.Lerp(fanLoop.volume, fan * m, 0.1f);
            boilerLoop.volume = Mathf.Lerp(boilerLoop.volume, boiler * m, 0.1f);
        }
    }
}
