// Visual actors: Kenney skinned workers (Playables, split arm/leg layers) and cargo.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace ShiftHappens
{
    public class WorkerView
    {
        public const float CharScale = 1.9f;
        public static float FacingOffset = 0f; // flip to 180 if a model import faces backwards

        public readonly GameObject root;
        public readonly string key;
        readonly Transform inner;
        readonly GameObject ring, blob;
        PlayableGraph graph;
        bool hasGraph;
        AnimationMixerPlayable baseMix, armMix;
        AnimationLayerMixerPlayable layers;
        readonly string[] baseNames = { "idle", "walk", "sprint", "jump", "fall", "die" };
        readonly string[] armNames = { "holding-both", "interact-right" };
        AnimationClipPlayable[] basePl, armPl;
        float[] baseW, armW;
        float armLayerW, squash = 1, squashV, lastVy;
        bool wasGrounded = true;
        int lastBase = -1;
        float yaw;

        public WorkerView(Outfit o, Transform parent)
        {
            key = $"{o.model}|{o.hat}|{o.color}";
            root = new GameObject("worker");
            root.transform.SetParent(parent, false);
            inner = new GameObject("inner").transform;
            inner.SetParent(root.transform, false);
            var model = Kit.Spawn("characters", "character-" + o.model, CharScale, inner);
            if (model == null) model = Kit.Spawn("characters", "character-worker", CharScale, inner);
            if (model != null)
            {
                model.transform.localRotation = Quaternion.Euler(0, FacingOffset, 0);
                var head = FindDeep(model.transform, "head");
                GameObject hat = o.hat == "hardhat" ? Kit.Spawn("prototype", "hat-hard", 1.8f) : o.hat == "cap" ? Kit.Spawn("prototype", "hat-cap", 1.8f) : null;
                if (o.hat == "cone")
                {
                    hat = new GameObject("cone-hat");
                    Shapes.Cone(hat.transform, Vector3.zero, 0.26f, 0.34f, Mats.Color(Pal.Orange, 0.6f));
                    Shapes.Cyl(hat.transform, new Vector3(0, 0.15f, 0), 0.1f, 0.05f, Mats.Color(Color.white));
                }
                if (hat != null && head != null)
                {
                    // place in world space just above the head bone, then attach keeping world scale
                    hat.transform.position = head.position + Vector3.up * 0.26f;
                    hat.transform.rotation = model.transform.rotation;
                    hat.transform.SetParent(head, true);
                }
                else if (hat != null) Object.Destroy(hat);
                BuildAnimation(model, o.model);
            }
            // team ring + blob shadow
            ring = new GameObject("ring");
            ring.transform.SetParent(root.transform, false);
            var rm = ring.AddComponent<MeshFilter>(); rm.sharedMesh = RingMesh();
            var rr = ring.AddComponent<MeshRenderer>(); rr.sharedMaterial = Mats.Color(K.Hex(o.color), 0.2f, 0, K.Hex(o.color) * 0.6f);
            rr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            ring.transform.localPosition = new Vector3(0, 0.03f, 0);
            blob = null;
        }

        static Transform FindDeep(Transform t, string name)
        {
            if (t.name == name) return t;
            foreach (Transform c in t) { var r = FindDeep(c, name); if (r) return r; }
            return null;
        }

        static Mesh ringMesh;
        static Mesh RingMesh()
        {
            if (ringMesh) return ringMesh;
            const int n = 32;
            var v = new Vector3[n * 2]; var t = new int[n * 6];
            for (int i = 0; i < n; i++)
            {
                float a = i / (float)n * Mathf.PI * 2;
                v[i * 2] = new Vector3(Mathf.Cos(a) * 0.42f, 0, Mathf.Sin(a) * 0.42f);
                v[i * 2 + 1] = new Vector3(Mathf.Cos(a) * 0.52f, 0, Mathf.Sin(a) * 0.52f);
                int j = (i + 1) % n;
                t[i * 6] = i * 2; t[i * 6 + 1] = i * 2 + 1; t[i * 6 + 2] = j * 2;
                t[i * 6 + 3] = j * 2; t[i * 6 + 4] = i * 2 + 1; t[i * 6 + 5] = j * 2 + 1;
            }
            ringMesh = new Mesh { vertices = v, triangles = t };
            ringMesh.RecalculateNormals();
            return ringMesh;
        }

        static string ClipKey(string n) { int i = n.LastIndexOf('|'); return (i >= 0 ? n.Substring(i + 1) : n).Trim(); }

        void BuildAnimation(GameObject model, string modelName)
        {
            var clips = Kit.Clips("characters", "character-" + modelName);
            if (clips.Count == 0) clips = Kit.Clips("characters", "character-worker");
            var byName = new Dictionary<string, AnimationClip>();
            foreach (var c in clips) byName[ClipKey(c.name)] = c;
            if (!byName.ContainsKey("idle")) return;
            var animator = model.GetComponentInChildren<Animator>();
            if (!animator) animator = model.AddComponent<Animator>();
            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;

            graph = PlayableGraph.Create("worker-" + modelName);
            graph.SetTimeUpdateMode(DirectorUpdateMode.Manual);
            var output = AnimationPlayableOutput.Create(graph, "anim", animator);
            layers = AnimationLayerMixerPlayable.Create(graph, 2);
            baseMix = AnimationMixerPlayable.Create(graph, baseNames.Length);
            armMix = AnimationMixerPlayable.Create(graph, armNames.Length);
            basePl = new AnimationClipPlayable[baseNames.Length]; baseW = new float[baseNames.Length];
            armPl = new AnimationClipPlayable[armNames.Length]; armW = new float[armNames.Length];
            for (int i = 0; i < baseNames.Length; i++)
            {
                byName.TryGetValue(baseNames[i], out var clip);
                basePl[i] = AnimationClipPlayable.Create(graph, clip ? clip : byName["idle"]);
                graph.Connect(basePl[i], 0, baseMix, i);
            }
            for (int i = 0; i < armNames.Length; i++)
            {
                byName.TryGetValue(armNames[i], out var clip);
                armPl[i] = AnimationClipPlayable.Create(graph, clip ? clip : byName["idle"]);
                graph.Connect(armPl[i], 0, armMix, i);
            }
            graph.Connect(baseMix, 0, layers, 0);
            graph.Connect(armMix, 0, layers, 1);
            layers.SetInputWeight(0, 1);
            layers.SetInputWeight(1, 0);
            // arms-only mask for the upper layer
            var mask = new AvatarMask();
            var paths = new List<(string path, bool arm)>();
            CollectPaths(animator.transform, "", paths);
            mask.transformCount = paths.Count;
            for (int i = 0; i < paths.Count; i++) { mask.SetTransformPath(i, paths[i].path); mask.SetTransformActive(i, paths[i].arm); }
            layers.SetLayerMaskFromAvatarMask(1, mask);
            output.SetSourcePlayable(layers);
            hasGraph = true;
            baseW[0] = 1;
        }

        static void CollectPaths(Transform t, string prefix, List<(string, bool)> outList)
        {
            foreach (Transform c in t)
            {
                string p = prefix.Length == 0 ? c.name : prefix + "/" + c.name;
                bool arm = p.Contains("arm-");
                outList.Add((p, arm));
                CollectPaths(c, p, outList);
            }
        }

        public void Update(SnapPlayer p, float dt, float t)
        {
            var tr = root.transform;
            tr.position = VS.P(p.pos) - new Vector3(0, K.PlayerRadius, 0);
            yaw += Mathf.DeltaAngle(yaw, VS.Yaw(p.yaw)) * Mathf.Min(1, dt * 18);
            tr.rotation = Quaternion.Euler(0, yaw, 0);
            bool tube = p.state == PState.Tube, down = p.state == PState.Down, carried = p.state == PState.Carried;
            tr.localScale = Vector3.one * (tube ? 0.7f : 1);
            ring.SetActive(!tube && p.pos.y < 3.6f);
            ring.transform.position = VS.P(p.pos.x, (p.pos.x > 19 && p.pos.z < -5 && p.pos.z > -10 ? Level.SkyDock.top : 0) + 0.03f, p.pos.z);

            // landing squash
            if (p.grounded && !wasGrounded && lastVy < -4) squashV -= Mathf.Min(5, -lastVy * 0.6f);
            wasGrounded = p.grounded; lastVy = p.vy;
            squashV += (1 - squash) * 170 * dt; squashV *= Mathf.Exp(-11 * dt); squash += squashV * dt;
            float sq = Mathf.Max(0.6f, squash);
            inner.localScale = new Vector3(1 / Mathf.Sqrt(sq), sq, 1 / Mathf.Sqrt(sq));
            inner.localRotation = Quaternion.Euler(0, 0, carried ? Mathf.Sin(t * 9) * 14 : tube ? Mathf.Sin(t * 10) * 25 : 0);

            if (!hasGraph) { inner.localPosition = new Vector3(0, Mathf.Abs(Mathf.Sin(t * 8)) * 0.06f * Mathf.Min(1, p.speed / 4), 0); return; }
            int baseIdx;
            if (down) baseIdx = 5;
            else if (carried || tube) baseIdx = 4;
            else if (!p.grounded) baseIdx = p.vy > 0.5f ? 3 : 4;
            else if (p.speed > 0.4f) baseIdx = p.speed > 5.3f ? 2 : 1;
            else baseIdx = 0;
            if (baseIdx != lastBase && (baseIdx == 3 || baseIdx == 5)) basePl[baseIdx].SetTime(0);
            lastBase = baseIdx;
            int armIdx = !down && !carried && !tube ? (p.hk > 0 ? 0 : (p.usingCtl || p.anim > 0) ? 1 : -1) : -1;

            float k = Mathf.Min(1, dt * 10);
            float total = 0;
            for (int i = 0; i < baseW.Length; i++) { baseW[i] += ((i == baseIdx ? 1 : 0) - baseW[i]) * k; total += baseW[i]; }
            for (int i = 0; i < baseW.Length; i++) baseMix.SetInputWeight(i, baseW[i] / Mathf.Max(0.001f, total));
            for (int i = 0; i < armW.Length; i++) { armW[i] += ((i == armIdx ? 1 : 0) - armW[i]) * k; armMix.SetInputWeight(i, armW[i]); }
            armLayerW += ((armIdx >= 0 ? 1 : 0) - armLayerW) * k;
            layers.SetInputWeight(1, armLayerW);

            float walkRate = Mathf.Max(0.6f, p.speed / 3.0f), runRate = Mathf.Max(0.8f, p.speed / 5.5f);
            Advance(basePl[0], dt, true); Advance(basePl[1], dt * walkRate, true); Advance(basePl[2], dt * runRate, true);
            Advance(basePl[3], dt, false); Advance(basePl[4], dt, true); Advance(basePl[5], dt * 1.5f, false);
            Advance(armPl[0], dt, true); Advance(armPl[1], dt * 1.4f, true);
            graph.Evaluate(0);
        }

        static void Advance(AnimationClipPlayable pl, float dt, bool loop)
        {
            var clip = pl.GetAnimationClip();
            float len = clip ? Mathf.Max(0.01f, clip.length) : 1;
            double tm = pl.GetTime() + dt;
            tm = loop ? tm % len : System.Math.Min(tm, len);
            pl.SetTime(tm);
        }

        public void SetGhost(bool ghost)
        {
            foreach (var r in root.GetComponentsInChildren<Renderer>()) r.enabled = !ghost || Time.unscaledTime % 0.6f < 0.4f;
        }

        public void Destroy()
        {
            if (hasGraph) graph.Destroy();
            Object.Destroy(root);
        }
    }

    public class CargoView
    {
        public readonly GameObject root;
        readonly Transform model;
        readonly GameObject badge;
        readonly TextMesh badgeText;
        readonly Material badgeMat, heatMat;
        string bay;
        public bool gone;
        readonly float badgeY;

        public CargoView(string type, string bay, Transform parent)
        {
            root = new GameObject("cargo-" + type);
            root.transform.SetParent(parent, false);
            model = new GameObject("model").transform;
            model.SetParent(root.transform, false);
            var m = model;
            switch (type)
            {
                case "crate":
                    Shapes.Box(m, Vector3.zero, Vector3.one * 1.03f, Mats.Color(K.Hex("#5d7480"), 0.45f, 0.4f));
                    foreach (var (x, z) in new[] { (-1, -1), (1, -1), (1, 1), (-1, 1) }) Shapes.Box(m, new Vector3(x * 0.47f, 0, z * 0.47f), new Vector3(0.16f, 1.08f, 0.16f), Mats.Color(Pal.Yellow, 0.4f));
                    foreach (float y in new[] { -0.38f, 0.38f }) Shapes.Box(m, new Vector3(0, y, 0), new Vector3(1.08f, 0.1f, 1.08f), Mats.Color(K.Hex("#3f525c"), 0.4f, 0.4f));
                    Shapes.Box(m, new Vector3(0, 0, 0.52f), new Vector3(0.6f, 0.3f, 0.02f), Mats.Color(Pal.Red));
                    badgeY = 0.95f; break;
                case "wobble":
                    Shapes.Cyl(m, Vector3.zero, 0.45f, 1.0f, Mats.Color(Pal.Orange, 0.55f));
                    foreach (float y in new[] { -0.32f, 0.32f }) Shapes.Cyl(m, new Vector3(0, y, 0), 0.465f, 0.06f, Mats.Color(K.Hex("#8c3a12")));
                    badgeY = 0.9f; break;
                case "gnome":
                    Shapes.Cone(m, new Vector3(0, -0.42f, 0), 0.25f, 0.5f, Mats.Color(Pal.Blue, 0.75f));
                    Shapes.Sphere(m, new Vector3(0, 0.12f, 0), 0.28f, Mats.Color(K.Hex("#f6cfb0"), 0.7f));
                    Shapes.Cone(m, new Vector3(0, 0.12f, 0.07f), 0.13f, 0.26f, Mats.Color(Color.white, 0.6f), new Vector3(180, 0, 0));
                    Shapes.Cone(m, new Vector3(0, 0.2f, -0.02f), 0.15f, 0.36f, Mats.Color(Pal.Red, 0.75f), new Vector3(-10, 0, 0));
                    badgeY = 0.75f; break;
                case "beans":
                    heatMat = Mats.Unique(Pal.Yellow, 0.6f);
                    Shapes.Cyl(m, Vector3.zero, 0.36f, 0.75f, heatMat);
                    Shapes.Cyl(m, Vector3.zero, 0.365f, 0.4f, Mats.Color(K.Hex("#7a3e1d")));
                    foreach (float y in new[] { -0.36f, 0.36f }) Shapes.Cyl(m, new Vector3(0, y, 0), 0.37f, 0.06f, Mats.Color(K.Hex("#c9c9c9"), 0.7f, 0.5f));
                    badgeY = 0.75f; break;
                case "balloon":
                    Shapes.Box(m, Vector3.zero, Vector3.one * 0.75f, Mats.Color(K.Hex("#c79a62"), 0.1f));
                    Shapes.Box(m, Vector3.zero, new Vector3(0.77f, 0.12f, 0.77f), Mats.Color(K.Hex("#a87b45"), 0.1f));
                    var cols = new[] { "#ff7eb6", "#7ee0ff", "#ffe066" };
                    for (int i = 0; i < 3; i++)
                    {
                        float a = i / 3f * Mathf.PI * 2;
                        var bp = new Vector3(Mathf.Cos(a) * 0.2f, 0.95f + i * 0.08f, Mathf.Sin(a) * 0.2f);
                        Shapes.Prim(PrimitiveType.Sphere, m, bp, new Vector3(0.48f, 0.55f, 0.48f), Mats.Color(K.Hex(cols[i]), 0.85f));
                        Shapes.Cyl(m, (bp + new Vector3(0, 0.38f, 0)) * 0.5f, 0.008f, bp.y - 0.38f, Mats.Color(Color.white));
                    }
                    badgeY = 1.55f; break;
                case "magnet":
                    Shapes.Sphere(m, Vector3.zero, 0.8f, Mats.Color(K.Hex("#3f4a52"), 0.7f, 0.6f));
                    Shapes.Prim(PrimitiveType.Sphere, m, new Vector3(0, 0.12f, 0), new Vector3(0.78f, 0.6f, 0.78f), Mats.Color(Pal.Red, 0.65f));
                    Shapes.Prim(PrimitiveType.Sphere, m, new Vector3(0, -0.12f, 0), new Vector3(0.78f, 0.6f, 0.78f), Mats.Color(Pal.Blue, 0.65f));
                    Shapes.Cyl(m, Vector3.zero, 0.42f, 0.06f, Mats.Color(K.Hex("#7af7ff"), 0.8f, 0, K.Hex("#3fd8ff") * 2f));
                    badgeY = 0.75f; break;
                case "mystery":
                    Shapes.Box(m, Vector3.zero, Vector3.one * 0.85f, Mats.Color(Pal.Purple, 0.5f));
                    Shapes.Box(m, Vector3.zero, new Vector3(0.87f, 0.12f, 0.87f), Mats.Color(Pal.Yellow, 0.5f));
                    Shapes.Text(m, "?", new Vector3(0, 0.06f, 0.44f), 0.55f, Pal.Yellow, null, new Vector3(0, 180, 0));
                    badgeY = 0.85f; break;
                case "duck":
                    Shapes.Prim(PrimitiveType.Sphere, m, new Vector3(0, -0.04f, 0), new Vector3(0.56f, 0.45f, 0.67f), Mats.Color(Pal.Yellow, 0.75f));
                    Shapes.Sphere(m, new Vector3(0, 0.2f, 0.16f), 0.32f, Mats.Color(Pal.Yellow, 0.75f));
                    Shapes.Cone(m, new Vector3(0, 0.18f, 0.3f), 0.06f, 0.14f, Mats.Color(Pal.Orange), new Vector3(90, 0, 0));
                    badgeY = -10; break;
                case "ball":
                    Shapes.Sphere(m, Vector3.zero, 0.5f, Mats.Color(Pal.Orange, 0.3f));
                    badgeY = -10; break;
                default:
                    Shapes.Cyl(m, Vector3.zero, 0.12f, 0.3f, Mats.Color(Pal.Red, 0.7f, 0.3f));
                    badgeY = -10; break;
            }
            if (badgeY > -5)
            {
                badge = new GameObject("badge");
                badge.transform.SetParent(parent, false);
                badgeMat = Mats.Unique(Bays.ColorOf(bay), 0.3f);
                Shapes.Prim(PrimitiveType.Sphere, badge.transform, Vector3.zero, new Vector3(0.42f, 0.42f, 0.08f), badgeMat);
                badgeText = Shapes.Text(badge.transform, bay == "?" ? "?" : bay, new Vector3(0, 0.01f, -0.06f), 0.28f, Color.white);
            }
            this.bay = bay;
        }

        public void Update(SnapCargo c, float dt, float t, Camera cam)
        {
            root.transform.SetPositionAndRotation(VS.P(c.pos), VS.Q(c.rot));
            float s = c.ship > 0 ? Mathf.Max(0.05f, 1 - c.ship) : 1;
            if ((c.flags & 2) != 0) s *= 0.8f;
            root.transform.localScale = Vector3.one * s;
            if (heatMat) { Mats.Emit(heatMat, new Color(1f, 0.25f, 0.05f) * (c.heat * 2.5f)); }
            if (badge)
            {
                if (bay != c.bay) { bay = c.bay; Mats.SetBase(badgeMat, Bays.ColorOf(bay)); badgeText.text = bay; }
                bool show = c.ship <= 0 && (c.flags & 2) == 0;
                badge.SetActive(show);
                if (show)
                {
                    badge.transform.position = VS.P(c.pos) + Vector3.up * (badgeY + Mathf.Sin(t * 4 + c.id) * 0.04f);
                    if (cam) badge.transform.rotation = Quaternion.LookRotation(badge.transform.position - cam.transform.position);
                }
            }
        }

        public void Destroy() { Object.Destroy(root); if (badge) Object.Destroy(badge); }
    }
}
