// Camera, lights and URP post-processing for the whole game.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ShiftHappens
{
    public class Stage
    {
        public readonly Camera cam;
        readonly Light sun;
        readonly Light[] torches = new Light[4];
        Vector3 camPos, camTarget, goalPos, goalTarget;
        public float shake;
        float lightLevel = 1;
        static readonly Vector3 CamDir = new Vector3(0, 0.74f, -0.67f).normalized; // view space: camera sits on the -Z (south) side
        ColorAdjustments color;
        Vignette vignette;
        Bloom bloom;

        public Stage(Transform parent)
        {
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            camGo.transform.SetParent(parent, false);
            cam = camGo.AddComponent<Camera>();
            cam.fieldOfView = 40; cam.nearClipPlane = 0.3f; cam.farClipPlane = 400;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Pal.Night;
            cam.allowHDR = true;
            camGo.AddComponent<AudioListener>();
            var urp = cam.GetUniversalAdditionalCameraData();
            if (urp != null)
            {
                urp.renderPostProcessing = true;
                urp.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
                urp.antialiasingQuality = AntialiasingQuality.High;
                urp.renderShadows = true;
            }

            // soft sky + warm sun
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = K.Hex("#cfe4f2");
            RenderSettings.ambientEquatorColor = K.Hex("#9aa7a8");
            RenderSettings.ambientGroundColor = K.Hex("#5d5246");
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Pal.Night;
            RenderSettings.fogStartDistance = 60; RenderSettings.fogEndDistance = 130;
            var sunGo = new GameObject("Sun");
            sunGo.transform.SetParent(parent, false);
            sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = K.Hex("#ffe9c9");
            sun.intensity = 1.6f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.75f;
            sun.shadowBias = 0.03f; sun.shadowNormalBias = 0.3f;
            sunGo.transform.rotation = Quaternion.Euler(52, -28, 0);
            var fill = new GameObject("Fill").AddComponent<Light>();
            fill.transform.SetParent(parent, false);
            fill.type = LightType.Directional; fill.color = K.Hex("#9fd6ff"); fill.intensity = 0.35f; fill.shadows = LightShadows.None;
            fill.transform.rotation = Quaternion.Euler(30, 140, 0);
            for (int i = 0; i < 4; i++)
            {
                var t = new GameObject("Torch" + i).AddComponent<Light>();
                t.transform.SetParent(parent, false);
                t.type = LightType.Spot; t.range = 16; t.spotAngle = 60; t.intensity = 0; t.color = K.Hex("#fff4d6");
                torches[i] = t;
            }

            // post-processing volume
            var vgo = new GameObject("PostFX");
            vgo.transform.SetParent(parent, false);
            var vol = vgo.AddComponent<Volume>();
            vol.isGlobal = true; vol.priority = 10;
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var tm = profile.Add<Tonemapping>(true); tm.mode.Override(TonemappingMode.ACES);
            bloom = profile.Add<Bloom>(true); bloom.threshold.Override(1.1f); bloom.intensity.Override(0.7f); bloom.scatter.Override(0.6f);
            color = profile.Add<ColorAdjustments>(true); color.postExposure.Override(0.15f); color.contrast.Override(12f); color.saturation.Override(10f);
            var split = profile.Add<SplitToning>(true); split.shadows.Override(K.Hex("#2f6f78")); split.highlights.Override(K.Hex("#ffd9a0")); split.balance.Override(-10f);
            vignette = profile.Add<Vignette>(true); vignette.intensity.Override(0.28f); vignette.smoothness.Override(0.45f); vignette.color.Override(Color.black);
            var grain = profile.Add<FilmGrain>(true); grain.intensity.Override(0.12f);
            vol.profile = profile;

            camPos = goalPos = VS.P(-20, 30, 30); camTarget = goalTarget = VS.P(-20, 0, 0);
        }

        public void ApplyQuality(string q)
        {
            QualitySettings.shadowDistance = q == "high" ? 90 : 60;
            sun.shadows = q == "low" ? LightShadows.None : LightShadows.Soft;
            var urp = cam.GetUniversalAdditionalCameraData();
            if (urp != null) { urp.renderPostProcessing = q != "low"; urp.antialiasing = q == "low" ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.SubpixelMorphologicalAntiAliasing; }
        }

        public void Snap() { camPos = goalPos; camTarget = goalTarget; }

        public void MenuShot(float t)
        {
            float sway = Mathf.Sin(t * 0.15f) * 1.2f;
            goalPos = VS.P(-6 + sway, 19.5f, 31);
            goalTarget = VS.P(-4 + sway * 0.6f, 0, -4);
        }

        public void Follow(Snapshot st, List<int> localIds)
        {
            var pts = new List<SnapPlayer>();
            foreach (var p in st.pl) if (localIds.Contains(p.id) && p.state != PState.Gone) pts.Add(p);
            if (pts.Count == 0) pts.AddRange(st.pl);
            if (pts.Count == 0) return;
            float cx = 0, cz = 0, cy = 0;
            foreach (var p in pts) { cx += p.pos.x; cz += p.pos.z; cy += Mathf.Min(p.pos.y, 4); }
            cx /= pts.Count; cz /= pts.Count; cy /= pts.Count;
            float spread = 0;
            foreach (var a in pts) foreach (var b in pts) spread = Mathf.Max(spread, new Vector2(a.pos.x - b.pos.x, (a.pos.z - b.pos.z) * 1.6f).magnitude);
            float dist = Mathf.Min(42, 21 + spread * 0.8f);
            cx = Mathf.Clamp(cx, Level.MinX + 6, Level.MaxX - 6);
            cz = Mathf.Clamp(cz - 1, -18, 4);
            goalTarget = VS.P(cx, cy * 0.5f, cz);
            goalPos = goalTarget + CamDir * dist;
        }

        public void Lighting(Snapshot st, float dt)
        {
            bool dark = st.game.dark, black = !st.plant.main;
            float target = black ? 0.12f : dark ? 0.02f : 1;
            lightLevel += (target - lightLevel) * Mathf.Min(1, dt * 3);
            float L = lightLevel;
            sun.intensity = 0.05f + 1.55f * L;
            RenderSettings.ambientIntensity = 0.1f + 0.9f * L;
            RenderSettings.ambientSkyColor = black ? K.Hex("#ff9a9a") : K.Hex("#cfe4f2");
            int i = 0;
            foreach (var p in st.pl)
            {
                if (i >= 4) break;
                var tl = torches[i++];
                bool on = L < 0.6f && p.state != PState.Gone;
                tl.intensity = on ? 30 * (1 - L) : 0;
                if (on)
                {
                    var pos = VS.P(p.pos);
                    tl.transform.position = pos + Vector3.up * 1.6f;
                    var fwd = Quaternion.Euler(0, VS.Yaw(p.yaw), 0) * Vector3.forward;
                    tl.transform.rotation = Quaternion.LookRotation((pos + fwd * 4 - tl.transform.position).normalized);
                }
            }
            for (; i < 4; i++) torches[i].intensity = 0;
            bool alarm = black || st.plant.P > 88;
            vignette.color.Override(alarm ? Color.Lerp(Color.black, new Color(0.7f, 0.05f, 0.05f), 0.5f + 0.5f * Mathf.Sin(Time.time * 6)) : Color.black);
            vignette.intensity.Override(dark ? 0.45f : alarm ? 0.38f : 0.28f);
        }

        public void ResetLighting() { lightLevel = 1; sun.intensity = 1.6f; RenderSettings.ambientIntensity = 1; foreach (var t in torches) t.intensity = 0; vignette.color.Override(Color.black); }

        public void Tick(float dt, bool menu)
        {
            bool far = Vector3.Distance(camTarget, goalTarget) > 14;
            float k = 1 - Mathf.Exp(-dt * (menu ? 1.5f : far ? 9 : 4));
            camPos = Vector3.Lerp(camPos, goalPos, k);
            camTarget = Vector3.Lerp(camTarget, goalTarget, k);
            var pos = camPos;
            if (shake > 0 && Settings.Shake) { shake = Mathf.Max(0, shake - dt * 2.5f); pos += Random.insideUnitSphere * shake * 0.35f; }
            cam.transform.position = pos;
            cam.transform.LookAt(camTarget);
        }

        public Vector3 Target => camTarget;
    }
}
