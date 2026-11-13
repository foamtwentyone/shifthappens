// Materials, procedural textures and the Kenney model library.
using System.Collections.Generic;
using UnityEngine;

namespace ShiftHappens
{
    public static class Pal
    {
        public static readonly Color Ink = K.Hex("#1b1f24"), Teal = K.Hex("#1f8a8a"), Teal2 = K.Hex("#2aa7a2"), TealDeep = K.Hex("#12353d"),
            Yellow = K.Hex("#ffc93c"), Orange = K.Hex("#ff7a2f"), Red = K.Hex("#e8423f"), Green = K.Hex("#49c46b"), Blue = K.Hex("#3b82d6"),
            Steel = K.Hex("#d9e2e4"), Steel2 = K.Hex("#b7c4c8"), Paper = K.Hex("#f4ebd9"), Cream = K.Hex("#ece4d0"), Wood = K.Hex("#b07a45"),
            Purple = K.Hex("#8b5cf6"), Dark = K.Hex("#3d4a50"), Night = K.Hex("#0f2a30");
    }

    public static class Mats
    {
        static Shader lit, unlit;
        static readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();

        public static Shader Lit => lit ? lit : lit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
        public static Shader Unlit => unlit ? unlit : unlit = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Unlit/Color");

        public static Material Color(Color c, float smooth = 0.35f, float metal = 0.05f, Color? emission = null)
        {
            string key = $"{c}|{smooth}|{metal}|{emission}";
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(Lit) { name = "sh-" + ColorUtility.ToHtmlStringRGB(c) };
            SetBase(m, c);
            m.SetFloat("_Smoothness", smooth);
            m.SetFloat("_Glossiness", smooth);
            m.SetFloat("_Metallic", metal);
            if (emission.HasValue) Emit(m, emission.Value);
            cache[key] = m;
            return m;
        }

        public static Material Unique(Color c, float smooth = 0.35f, float metal = 0.05f)
        {
            var m = new Material(Lit);
            SetBase(m, c);
            m.SetFloat("_Smoothness", smooth); m.SetFloat("_Glossiness", smooth); m.SetFloat("_Metallic", metal);
            return m;
        }

        public static Material Textured(Texture2D tex, Color tint, float smooth = 0.25f, Vector2? tiling = null)
        {
            var m = new Material(Lit);
            SetBase(m, tint);
            m.SetTexture("_BaseMap", tex); m.SetTexture("_MainTex", tex);
            if (tiling.HasValue) { m.SetTextureScale("_BaseMap", tiling.Value); m.SetTextureScale("_MainTex", tiling.Value); }
            m.SetFloat("_Smoothness", smooth); m.SetFloat("_Glossiness", smooth);
            return m;
        }

        public static Material Transparent(Color c, float alpha)
        {
            var m = new Material(Lit);
            c.a = alpha;
            SetBase(m, c);
            // URP Lit: switch to transparent surface
            m.SetFloat("_Surface", 1); m.SetFloat("_Blend", 0);
            m.SetOverrideTag("RenderType", "Transparent");
            m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetInt("_ZWrite", 0);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            m.SetFloat("_Smoothness", 0.9f);
            return m;
        }

        public static void SetBase(Material m, Color c) { m.SetColor("_BaseColor", c); m.SetColor("_Color", c); }

        public static void Emit(Material m, Color c)
        {
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            m.SetColor("_EmissionColor", c);
        }

        // ───────── procedural textures ─────────
        public static Texture2D FloorTile(Color baseCol, int seed)
        {
            const int S = 128;
            var t = new Texture2D(S, S, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear, anisoLevel = 8 };
            var rng = new System.Random(seed);
            var tints = new float[4];
            for (int i = 0; i < 4; i++) tints[i] = 0.93f + (float)rng.NextDouble() * 0.12f;
            var px = new Color[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    int q = (x >= S / 2 ? 1 : 0) + (y >= S / 2 ? 2 : 0);
                    float n = Mathf.PerlinNoise((x + seed) * 0.08f, (y + seed * 3) * 0.08f) * 0.06f + ((float)rng.NextDouble() - 0.5f) * 0.05f;
                    var c = baseCol * (tints[q] + n);
                    int lx = x % (S / 2), ly = y % (S / 2);
                    if (lx < 2 || ly < 2) c *= 0.62f;
                    else if (lx < 4 || ly < 4) c *= 1.08f;
                    c.a = 1;
                    px[y * S + x] = c;
                }
            t.SetPixels(px); t.Apply(true);
            return t;
        }

        public static Texture2D BeltTexture()
        {
            const int W = 64, H = 128;
            var t = new Texture2D(W, H, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear, anisoLevel = 8 };
            var px = new Color[W * H];
            var rubber = K.Hex("#2a2f35");
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    var c = rubber * (1 + (Mathf.PerlinNoise(x * 0.3f, y * 0.3f) - 0.5f) * 0.15f);
                    if (y % 8 < 2) c *= 0.7f;
                    // chevrons pointing +V (forward)
                    foreach (int cy in new[] { 35, 99 })
                    {
                        float dx = Mathf.Abs(x - W / 2f);
                        // Unity textures start at the bottom row: the tip must sit at the HIGHER v to point forward (+V)
                        float lineY = cy + 17 - dx * 1.0f;
                        if (Mathf.Abs(y - lineY) < 3.2f && dx < 18) c = Pal.Yellow;
                    }
                    c.a = 1;
                    px[y * W + x] = c;
                }
            t.SetPixels(px); t.Apply(true);
            return t;
        }

        public static Texture2D Hazard(int stripes = 8)
        {
            const int W = 128, H = 32;
            var t = new Texture2D(W, H, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat };
            var px = new Color[W * H];
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) px[y * W + x] = ((x + y) / (W / stripes / 2)) % 2 == 0 ? Pal.Yellow : Pal.Ink;
            t.SetPixels(px); t.Apply(true);
            return t;
        }
    }

    // Kenney CC0 kits, imported as FBX from Resources/Kenney/<pack>/<name>.fbx
    public static class Kit
    {
        static readonly Dictionary<string, Material> packMats = new Dictionary<string, Material>();
        static readonly Dictionary<string, float> packScale = new Dictionary<string, float>();
        // reference model per pack + its real height (from the GLB bounding boxes)
        static readonly Dictionary<string, (string model, float height)> refs = new Dictionary<string, (string, float)>
        {
            ["characters"] = ("character-male-a", 0.67f), ["factory"] = ("box-large", 0.55f),
            ["industrial"] = ("chimney-large", 1.70f), ["prototype"] = ("crate", 0.5f),
        };

        static Material PackMaterial(string pack)
        {
            if (packMats.TryGetValue(pack, out var m)) return m;
            var tex = Resources.Load<Texture2D>($"Kenney/{pack}/Textures/colormap");
            m = new Material(Mats.Lit) { name = "kenney-" + pack };
            Mats.SetBase(m, Color.white);
            if (tex) { tex.filterMode = FilterMode.Bilinear; m.SetTexture("_BaseMap", tex); m.SetTexture("_MainTex", tex); }
            m.SetFloat("_Smoothness", 0.3f); m.SetFloat("_Glossiness", 0.3f);
            packMats[pack] = m;
            return m;
        }

        static float PackScale(string pack)
        {
            if (packScale.TryGetValue(pack, out var s)) return s;
            s = 1;
            var (model, height) = refs[pack];
            var prefab = Resources.Load<GameObject>($"Kenney/{pack}/{model}");
            if (prefab)
            {
                var go = Object.Instantiate(prefab);
                go.transform.localScale = Vector3.one;
                float h = Bounds(go).size.y;
                Object.DestroyImmediate(go);
                if (h > 1e-4f) s = height / h;
            }
            packScale[pack] = s;
            return s;
        }

        public static Bounds Bounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, Vector3.zero);
            var b = rs[0].bounds;
            foreach (var r in rs) b.Encapsulate(r.bounds);
            return b;
        }

        // Instantiates a kit model at its real size (× scale), with URP materials.
        public static GameObject Spawn(string pack, string name, float scale = 1, Transform parent = null)
        {
            var prefab = Resources.Load<GameObject>($"Kenney/{pack}/{name}");
            if (!prefab) { Debug.LogWarning($"[ShiftHappens] missing model {pack}/{name}"); return null; }
            float s = PackScale(pack) * scale;
            var go = Object.Instantiate(prefab, parent);
            go.name = name;
            go.transform.localScale = Vector3.one * s;
            var mat = PackMaterial(pack);
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                var ms = r.sharedMaterials;
                for (int i = 0; i < ms.Length; i++)
                {
                    bool glass = ms[i] && ms[i].name.ToLowerInvariant().Contains("glass");
                    ms[i] = glass ? Mats.Transparent(K.Hex("#bff7f2"), 0.35f) : mat;
                }
                r.sharedMaterials = ms;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                r.receiveShadows = true;
            }
            foreach (var c in go.GetComponentsInChildren<Collider>()) Object.Destroy(c);
            return go;
        }

        public static List<AnimationClip> Clips(string pack, string name)
        {
            var all = Resources.LoadAll<AnimationClip>($"Kenney/{pack}/{name}");
            var list = new List<AnimationClip>();
            foreach (var c in all) if (!c.name.StartsWith("__preview__")) list.Add(c);
            return list;
        }
    }
}
