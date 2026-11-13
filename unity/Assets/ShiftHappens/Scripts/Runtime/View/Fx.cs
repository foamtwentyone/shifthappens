// Particle effects built in code: puffs, steam, sparks, confetti, shards, flames, stars.
using UnityEngine;

namespace ShiftHappens
{
    public class Fx
    {
        readonly ParticleSystem soft, hard, confetti;
        static readonly Color[] ConfCols = { Pal.Yellow, Pal.Orange, Pal.Green, Pal.Blue, K.Hex("#ff5d8f"), Pal.Purple, Color.white };

        public Fx(Transform parent)
        {
            soft = Make(parent, "fx-soft", SoftDisc(), 600, 0);
            hard = Make(parent, "fx-hard", HardDot(), 600, 1);
            confetti = Make(parent, "fx-confetti", Square(), 500, 7);
        }

        static ParticleSystem Make(Transform parent, string name, Texture2D tex, int max, float gravity)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = false; main.playOnAwake = false; main.maxParticles = max;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = gravity / K.Gravity * 2f;
            main.startLifetime = 1; main.startSpeed = 0;
            var em = ps.emission; em.enabled = false;
            var shape = ps.shape; shape.enabled = false;
            var col = ps.colorOverLifetime; col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) }, new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(0.8f, 0.6f), new GradientAlphaKey(0, 1) });
            col.color = new ParticleSystem.MinMaxGradient(grad);
            var size = ps.sizeOverLifetime; size.enabled = true; size.size = new ParticleSystem.MinMaxCurve(1, AnimationCurve.Linear(0, 0.6f, 1, 1.6f));
            var r = go.GetComponent<ParticleSystemRenderer>();
            var mat = new Material(Shader.Find("Sprites/Default")) { mainTexture = tex };
            r.sharedMaterial = mat;
            r.renderMode = ParticleSystemRenderMode.Billboard;
            ps.Play();
            return ps;
        }

        static Texture2D SoftDisc()
        {
            var t = new Texture2D(32, 32, TextureFormat.RGBA32, false);
            for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) { float d = Vector2.Distance(new Vector2(x, y), new Vector2(15.5f, 15.5f)) / 16f; t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(1 - d) * Mathf.Clamp01(1 - d))); }
            t.Apply(); return t;
        }
        static Texture2D HardDot()
        {
            var t = new Texture2D(16, 16, TextureFormat.RGBA32, false);
            for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) { float d = Vector2.Distance(new Vector2(x, y), new Vector2(7.5f, 7.5f)) / 8f; t.SetPixel(x, y, new Color(1, 1, 1, d < 0.75f ? 1 : Mathf.Clamp01((1 - d) * 4))); }
            t.Apply(); return t;
        }
        static Texture2D Square() { var t = new Texture2D(4, 4); for (int i = 0; i < 16; i++) t.SetPixel(i % 4, i / 4, Color.white); t.Apply(); return t; }

        static void Emit(ParticleSystem ps, Vector3 pos, Vector3 vel, Color c, float size, float life)
        {
            var ep = new ParticleSystem.EmitParams { position = pos, velocity = vel, startColor = c, startSize = size, startLifetime = life, applyShapeToPosition = false };
            ps.Emit(ep, 1);
        }

        static Vector3 R(float s) => new Vector3(Random.Range(-s, s), Random.Range(-s, s), Random.Range(-s, s));

        // all positions here are VIEW space
        public void Puff(Vector3 p, int n = 6, Color? c = null, float size = 0.5f, float spread = 1.5f)
        {
            for (int i = 0; i < n; i++)
            {
                float a = Random.value * Mathf.PI * 2;
                Emit(soft, p, new Vector3(Mathf.Cos(a) * spread, 0.5f + Random.value, Mathf.Sin(a) * spread), c ?? Pal.Paper, size * Random.Range(0.6f, 1.2f), Random.Range(0.6f, 1f));
            }
        }
        public void Steam(Vector3 p, int n = 10, float up = 3)
        {
            for (int i = 0; i < n; i++) Emit(soft, p + new Vector3(Random.Range(-0.3f, 0.3f), 0, Random.Range(-0.3f, 0.3f)), new Vector3(Random.Range(-1f, 1f), up + Random.value * up, Random.Range(-1f, 1f)), new Color(1, 1, 1, 0.55f), Random.Range(0.6f, 1.1f), Random.Range(1f, 1.6f));
        }
        public void Sparks(Vector3 p, int n = 12, Color? c = null)
        {
            for (int i = 0; i < n; i++) Emit(hard, p, new Vector3(Random.Range(-3.5f, 3.5f), Random.Range(1f, 7f), Random.Range(-3.5f, 3.5f)), c ?? K.Hex("#ffd36b"), 0.12f, Random.Range(0.35f, 0.65f));
        }
        public void Flames(Vector3 p, int n = 6)
        {
            for (int i = 0; i < n; i++) Emit(soft, p + new Vector3(Random.Range(-0.5f, 0.5f), 0, Random.Range(-0.5f, 0.5f)), new Vector3(0, Random.Range(2.5f, 4.5f), 0), Random.value < 0.5f ? Pal.Orange : Pal.Yellow, 0.5f, Random.Range(0.5f, 0.9f));
        }
        public void Confetti(Vector3 p, int n = 30, float power = 5)
        {
            for (int i = 0; i < n; i++)
            {
                float a = Random.value * Mathf.PI * 2;
                Emit(confetti, p, new Vector3(Mathf.Cos(a) * power * Random.value, power * Random.Range(0.8f, 1.8f), Mathf.Sin(a) * power * Random.value), ConfCols[i % ConfCols.Length], 0.12f, 2.2f);
            }
        }
        public void Shards(Vector3 p, Color c, int n = 14)
        {
            for (int i = 0; i < n; i++) Emit(confetti, p, R(4) + Vector3.up * 5, c, 0.14f, 2f);
        }
        public void Stars(Vector3 p)
        {
            for (int i = 0; i < 3; i++) Emit(hard, p, new Vector3(Mathf.Cos(i * 2.1f) * 1.2f, 1.4f, Mathf.Sin(i * 2.1f) * 1.2f), Pal.Yellow, 0.3f, 1.2f);
        }
        public void Mote(Vector3 p, Vector3 v, Color c, float size, float life) => Emit(soft, p, v, c, size, life);
    }
}
