// Primitive builders (collider-free), procedural cone mesh and world-space text.
using UnityEngine;

namespace ShiftHappens
{
    public static class Shapes
    {
        public static GameObject Prim(PrimitiveType t, Transform parent, Vector3 pos, Vector3 scale, Material m, Vector3? euler = null)
        {
            var go = GameObject.CreatePrimitive(t);
            Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            if (euler.HasValue) go.transform.localEulerAngles = euler.Value;
            go.GetComponent<Renderer>().sharedMaterial = m;
            return go;
        }

        public static GameObject Box(Transform p, Vector3 pos, Vector3 size, Material m) => Prim(PrimitiveType.Cube, p, pos, size, m);
        public static GameObject Sphere(Transform p, Vector3 pos, float d, Material m) => Prim(PrimitiveType.Sphere, p, pos, Vector3.one * d, m);
        // Unity cylinder primitive is 2 units tall
        public static GameObject Cyl(Transform p, Vector3 pos, float radius, float height, Material m, Vector3? euler = null) =>
            Prim(PrimitiveType.Cylinder, p, pos, new Vector3(radius * 2, height / 2, radius * 2), m, euler);

        static Mesh cone;
        public static Mesh ConeMesh()
        {
            if (cone) return cone;
            const int n = 20;
            var v = new Vector3[n + 2]; var tris = new int[n * 6];
            v[n] = new Vector3(0, 1, 0); v[n + 1] = Vector3.zero;
            for (int i = 0; i < n; i++) { float a = i / (float)n * Mathf.PI * 2; v[i] = new Vector3(Mathf.Cos(a) * 0.5f, 0, Mathf.Sin(a) * 0.5f); }
            for (int i = 0; i < n; i++)
            {
                int j = (i + 1) % n;
                tris[i * 6] = i; tris[i * 6 + 1] = n; tris[i * 6 + 2] = j;
                tris[i * 6 + 3] = j; tris[i * 6 + 4] = n + 1; tris[i * 6 + 5] = i;
            }
            cone = new Mesh { name = "cone", vertices = v, triangles = tris };
            cone.RecalculateNormals(); cone.RecalculateBounds();
            return cone;
        }

        // unit cone: base radius 0.5, height 1, pivot at base centre
        public static GameObject Cone(Transform p, Vector3 pos, float radius, float height, Material m, Vector3? euler = null)
        {
            var go = new GameObject("cone");
            go.transform.SetParent(p, false);
            go.transform.localPosition = pos;
            go.transform.localScale = new Vector3(radius * 2, height, radius * 2);
            if (euler.HasValue) go.transform.localEulerAngles = euler.Value;
            go.AddComponent<MeshFilter>().sharedMesh = ConeMesh();
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }

        static Font display, mono;
        public static Font Display => display ? display : display = Resources.Load<Font>("Fonts/Bungee");
        public static Font Mono => mono ? mono : mono = Resources.Load<Font>("Fonts/SpaceMono-Bold");

        // world-space text (TextMesh) — used for signs, pad letters, badges
        public static TextMesh Text(Transform p, string text, Vector3 pos, float size, Color color, Font font = null, Vector3? euler = null)
        {
            var go = new GameObject("text");
            go.transform.SetParent(p, false);
            go.transform.localPosition = pos;
            if (euler.HasValue) go.transform.localEulerAngles = euler.Value;
            var tm = go.AddComponent<TextMesh>();
            tm.font = font ? font : Display;
            tm.text = text;
            tm.fontSize = 64;
            tm.characterSize = size / 10f;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.color = color;
            var r = go.GetComponent<MeshRenderer>();
            if (tm.font) r.sharedMaterial = tm.font.material;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return tm;
        }

        // a coloured plate with a label on its front face (+Z of the plate)
        public static GameObject Sign(Transform p, string text, Vector3 pos, Vector2 size, Color bg, Color fg, float yaw = 0, float textSize = -1)
        {
            var root = new GameObject("sign:" + text);
            root.transform.SetParent(p, false);
            root.transform.localPosition = pos;
            root.transform.localEulerAngles = new Vector3(0, yaw, 0);
            Box(root.transform, Vector3.zero, new Vector3(size.x + 0.08f, size.y + 0.08f, 0.05f), Mats.Color(Pal.Ink));
            Box(root.transform, new Vector3(0, 0, 0.012f), new Vector3(size.x, size.y, 0.05f), Mats.Color(bg, 0.2f));
            Text(root.transform, text, new Vector3(0, 0, 0.045f), textSize > 0 ? textSize : size.y * 0.55f, fg, null, new Vector3(0, 180, 0));
            return root;
        }
    }
}
