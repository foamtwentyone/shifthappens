// PLANT 7 environment + animated machine visuals, synced from snapshots.
// All positions are given in SIM coordinates and converted with VS.P().
using System.Collections.Generic;
using UnityEngine;

namespace ShiftHappens
{
    public class LevelView
    {
        readonly Transform root;
        static Vector3 A(float x, float y, float z) => VS.P(x, y, z);

        class Lever { public Transform pivot; public Material lamp; public float cur; }
        readonly Dictionary<string, Lever> levers = new Dictionary<string, Lever>();
        readonly Dictionary<string, (Material mat, Material lamp, Transform frame)> belts = new Dictionary<string, (Material, Material, Transform)>();
        readonly Dictionary<string, Transform> doors = new Dictionary<string, Transform>();
        readonly Dictionary<string, Material> doorLamps = new Dictionary<string, Material>();
        readonly Dictionary<string, Material> pads = new Dictionary<string, Material>();
        readonly Dictionary<string, float> padFlash = new Dictionary<string, float>();
        readonly List<Material> lamps = new List<Material>();
        readonly List<(Transform t, Light l, Material m)> beacons = new List<(Transform, Light, Material)>();
        readonly List<(Transform t, float speed)> spinners = new List<(Transform, float)>();
        readonly List<(Transform t, Vector3 r0, float seed, int i)> robotJoints = new List<(Transform, Vector3, float, int)>();
        Transform sorterArrow, liftT, fanBlades, magnetT, needle, phone, sorterHead;
        Material scannerBeam, dispLamp, tubeSwirl, heatCoil, incin, magnetGlow, fanColumn;
        TextMesh boilerText, ledgerText, sorterText;
        readonly TextMesh[] contractTexts = new TextMesh[3];
        readonly Transform[] contractClips = new Transform[3];
        string ledgerKey, contractKey, sorterKey;
        public readonly List<Vector3> chimneys = new List<Vector3>();

        public LevelView(Transform parent)
        {
            root = new GameObject("PlantView").transform;
            root.SetParent(parent, false);
            BuildGround();
            BuildWalls();
            BuildBelts();
            BuildMachines();
            BuildLobby();
            BuildDecor();
        }

        GameObject Box(Vector3 simCenter, Vector3 size, Material m, Transform p = null) => Shapes.Box(p ? p : root, VS.P(simCenter), size, m);
        GameObject Cyl(Vector3 simCenter, float r, float h, Material m, Transform p = null) => Shapes.Cyl(p ? p : root, VS.P(simCenter), r, h, m);
        GameObject Prop(string pack, string name, float x, float y, float z, float scale = 1, float simYawDeg = 0)
        {
            var go = Kit.Spawn(pack, name, scale, root);
            if (go) { go.transform.position = A(x, y, z); go.transform.rotation = Quaternion.Euler(0, 180 - simYawDeg, 0); }
            return go;
        }
        // signs that face the camera (south) by default
        GameObject Sign(string text, float x, float y, float z, float w, float h, Color bg, Color fg, float faceYaw = 180) =>
            Shapes.Sign(root, text, A(x, y, z), new Vector2(w, h), bg, fg, faceYaw);

        // ───────────────────────────── ground & walls ─────────────────────────────
        void BuildGround()
        {
            Box(new Vector3(-8, -0.6f, -6), new Vector3(400, 1.1f, 400), Mats.Color(K.Hex("#33464b"), 0.1f));
            Box(new Vector3((Level.MinX + Level.MaxX) / 2, -0.6f, -6), new Vector3(Level.MaxX - Level.MinX + 2.2f, 1.2f, 34.2f), Mats.Color(K.Hex("#0f2a30"), 0.2f));
            foreach (var z in Level.Zones)
            {
                float w = z.X1 - z.X0, d = z.Z1 - z.Z0;
                var tex = Mats.FloorTile(z.Floor, z.Id.Length * 7);
                var m = Mats.Textured(tex, Color.white, 0.2f, new Vector2(w / 4, d / 4));
                var q = Shapes.Box(root, A((z.X0 + z.X1) / 2, -0.05f, (z.Z0 + z.Z1) / 2), new Vector3(w, 0.1f, d), m);
                q.GetComponent<Renderer>().receiveShadows = true;
            }
            foreach (var (txt, x, z) in new[] { ("BREAK ROOM", -39f, -2.6f), ("INTAKE", -23f, 6.4f), ("SORTING", -5f, 7f), ("CONTROL", -5f, -13f), ("SHIPPING", 16.5f, 8.2f) })
            {
                var tm = Shapes.Text(root, txt, A(x, 0.02f, z), 1.6f, new Color(0.1f, 0.12f, 0.14f, 0.25f), null, new Vector3(90, 0, 0));
                tm.transform.localEulerAngles = new Vector3(90, 0, 0);
            }
        }

        void BuildWalls()
        {
            var trim = Mats.Color(K.Hex("#23303a"), 0.3f);
            var lower = Mats.Color(Pal.Teal, 0.35f, 0.2f);
            var upper = Mats.Color(Pal.Cream, 0.15f);
            var hz = Mats.Textured(Mats.Hazard(), Color.white, 0.3f);
            foreach (var w in Level.Walls)
            {
                if (w.Style == "rail")
                {
                    var r = Box(new Vector3(w.X, w.VH / 2, w.Z), new Vector3(w.W, w.VH, w.D), hz);
                    r.GetComponent<Renderer>().sharedMaterial = Mats.Textured(Mats.Hazard(), Color.white, 0.3f, new Vector2(Mathf.Max(w.W, w.D) / 2.2f, 1));
                    Box(new Vector3(w.X, w.VH + 0.06f, w.Z), new Vector3(w.W + 0.1f, 0.12f, w.D + 0.1f), trim);
                    continue;
                }
                float band = Mathf.Min(1.1f, w.VH);
                Box(new Vector3(w.X, band / 2, w.Z), new Vector3(w.W, band, w.D), lower);
                if (w.VH > band) Box(new Vector3(w.X, band + (w.VH - band) / 2, w.Z), new Vector3(w.W, w.VH - band, w.D), upper);
                Box(new Vector3(w.X, w.VH + 0.07f, w.Z), new Vector3(w.W + 0.08f, 0.14f, w.D + 0.08f), trim);
                Box(new Vector3(w.X, band, w.Z), new Vector3(w.W + 0.04f, 0.08f, w.D + 0.04f), Mats.Color(Pal.Yellow, 0.4f));
                if (w.Style == "wall" && w.VH >= 3)
                {
                    bool alongX = w.W > w.D;
                    float len = alongX ? w.W : w.D;
                    int n = Mathf.FloorToInt(len / 6);
                    for (int i = 1; i <= n; i++)
                    {
                        float t = -len / 2 + i * len / (n + 1);
                        float x = alongX ? w.X + t : w.X, z = alongX ? w.Z : w.Z + t;
                        Box(new Vector3(x, w.VH / 2, z), new Vector3(alongX ? 0.45f : 0.75f, w.VH, alongX ? 0.75f : 0.45f), Mats.Color(K.Hex("#2c4a52"), 0.4f, 0.4f));
                    }
                }
            }
            var s = Level.SkyDock;
            Box(new Vector3((s.x0 + s.x1) / 2, s.top / 2, (s.z0 + s.z1) / 2), new Vector3(s.x1 - s.x0, s.top, s.z1 - s.z0), Mats.Color(K.Hex("#7f8f96"), 0.3f, 0.3f));
            var top = Mats.Textured(Mats.FloorTile(K.Hex("#c7b78f"), 9), Color.white, 0.2f, new Vector2(2.75f, 1.25f));
            Box(new Vector3((s.x0 + s.x1) / 2, s.top + 0.01f, (s.z0 + s.z1) / 2), new Vector3(s.x1 - s.x0, 0.02f, s.z1 - s.z0), top);
            Box(new Vector3((s.x0 + s.x1) / 2, s.top + 0.02f, s.z1 - 0.2f), new Vector3(s.x1 - s.x0, 0.02f, 0.4f), Mats.Textured(Mats.Hazard(), Color.white, 0.3f, new Vector2(10, 1)));
            Sign("SKY DOCK", 25, 2.0f, -4.89f, 3.6f, 0.9f, Pal.Yellow, Pal.Ink);
        }

        // ───────────────────────────── belts ─────────────────────────────
        void BuildBelts()
        {
            var beltTex = Mats.BeltTexture();
            foreach (var b in Level.Belts)
            {
                bool horiz = b.Dir.x != 0;
                float len = horiz ? b.X1 - b.X0 : b.Z1 - b.Z0, width = horiz ? b.Z1 - b.Z0 : b.X1 - b.X0;
                var frame = new GameObject("belt-" + b.Id).transform;
                frame.SetParent(root, false);
                frame.position = A((b.X0 + b.X1) / 2, 0, (b.Z0 + b.Z1) / 2);
                Vector3 S(float along, float y, float across) => horiz ? new Vector3(along, y, across) : new Vector3(across, y, along);
                Shapes.Box(frame, new Vector3(0, (b.Top - 0.1f) / 2, 0), S(len, b.Top - 0.1f, width), Mats.Color(Pal.Teal, 0.4f, 0.25f));
                foreach (int side in new[] { -1, 1 }) Shapes.Box(frame, horiz ? new Vector3(0, b.Top + 0.02f, side * (width / 2 + 0.02f)) : new Vector3(side * (width / 2 + 0.02f), b.Top + 0.02f, 0), S(len, 0.16f, 0.12f), Mats.Color(Pal.Yellow, 0.45f));
                for (float a = -len / 2 + 0.6f; a < len / 2; a += 2.2f)
                    foreach (int side in new[] { -1, 1 }) Shapes.Box(frame, horiz ? new Vector3(a, 0.1f, side * (width / 2 - 0.15f)) : new Vector3(side * (width / 2 - 0.15f), 0.1f, a), new Vector3(0.12f, 0.2f, 0.12f), Mats.Color(Pal.Dark));
                var mat = Mats.Textured(beltTex, Color.white, 0.2f, new Vector2(1, len / 1.6f));
                var surf = Shapes.Prim(PrimitiveType.Quad, frame, new Vector3(0, b.Top + 0.005f, 0), new Vector3(width - 0.12f, len, 1), mat);
                // quad faces +Z by default; lay it flat and point its +V along the belt's forward direction
                Vector3 fwdView = VS.P(b.Dir.x, 0, b.Dir.y) - VS.P(0, 0, 0);
                surf.transform.rotation = Quaternion.LookRotation(Vector3.down, fwdView);
                surf.transform.Rotate(0, 0, 0);
                var lampMat = Mats.Unique(K.Hex("#333333"), 0.5f);
                var lp = Shapes.Cyl(frame, horiz ? new Vector3(-len / 2 + 0.4f, 1.5f, -(width / 2 + 0.25f)) : new Vector3(width / 2 + 0.25f, 1.5f, len / 2 - 0.4f), 0.12f, 0.22f, lampMat);
                Shapes.Cyl(frame, lp.transform.localPosition - new Vector3(0, 0.8f, 0), 0.04f, 1.4f, Mats.Color(Pal.Dark));
                belts[b.Id] = (mat, lampMat, frame);
            }
        }

        // ───────────────────────────── generic controls ─────────────────────────────
        Lever MakeLever(string id, Vector3 simAt, Color knob, string label = null, Color? baseCol = null, bool wall = false, float faceYaw = 180)
        {
            var g = new GameObject("lever-" + id).transform;
            g.SetParent(root, false);
            g.position = A(simAt.x, 0, simAt.z);
            g.rotation = Quaternion.Euler(0, faceYaw - 180, 0);
            float py = 0.97f;
            if (!wall)
            {
                Shapes.Box(g, new Vector3(0, 0.45f, 0), new Vector3(0.5f, 0.9f, 0.4f), Mats.Color(baseCol ?? Pal.Teal, 0.4f));
                Shapes.Box(g, new Vector3(0, 0.92f, 0), new Vector3(0.56f, 0.1f, 0.46f), Mats.Color(Pal.Ink));
            }
            else { py = simAt.y; Shapes.Box(g, new Vector3(0, simAt.y, 0), new Vector3(0.6f, 0.7f, 0.18f), Mats.Color(baseCol ?? Pal.Steel2, 0.4f)); }
            var pivot = new GameObject("pivot").transform;
            pivot.SetParent(g, false);
            pivot.localPosition = new Vector3(0, py, wall ? -0.1f : 0);
            Shapes.Cyl(pivot, new Vector3(0, 0.27f, 0), 0.04f, 0.55f, Mats.Color(K.Hex("#cfd6d8"), 0.8f, 0.6f));
            Shapes.Sphere(pivot, new Vector3(0, 0.56f, 0), 0.2f, Mats.Color(knob, 0.7f));
            var lamp = Mats.Unique(K.Hex("#333333"), 0.6f);
            Shapes.Sphere(g, new Vector3(0.18f, wall ? simAt.y + 0.25f : 0.98f, wall ? -0.1f : -0.12f), 0.14f, lamp);
            if (label != null)
                Shapes.Sign(g, label, new Vector3(0, wall ? simAt.y - 0.48f : 0.62f, wall ? -0.1f : -0.205f), new Vector2(1.1f, 0.28f), Pal.Paper, Pal.Ink, 180, 0.16f);
            var lv = new Lever { pivot = pivot, lamp = lamp };
            levers[id] = lv;
            return lv;
        }

        void SetLever(string id, bool on, float dt, Color? lampColor = null)
        {
            if (!levers.TryGetValue(id, out var l)) return;
            float target = on ? 35 : -35;
            l.cur += (target - l.cur) * Mathf.Min(1, dt * 14);
            l.pivot.localRotation = Quaternion.Euler(-l.cur, 0, 0);
            var c = lampColor ?? (on ? Pal.Green : Pal.Red);
            Mats.SetBase(l.lamp, c); Mats.Emit(l.lamp, c * 2f);
        }

        void Button(Vector3 simAt, Color cap, string label = null, Color? baseCol = null, float y = 0)
        {
            var g = new GameObject("button").transform;
            g.SetParent(root, false);
            g.position = A(simAt.x, y, simAt.z);
            Shapes.Box(g, new Vector3(0, 0.475f, 0), new Vector3(0.55f, 0.95f, 0.5f), Mats.Color(baseCol ?? Pal.Yellow, 0.4f));
            Shapes.Cyl(g, new Vector3(0, 0.99f, 0), 0.23f, 0.08f, Mats.Color(Pal.Ink));
            Shapes.Prim(PrimitiveType.Sphere, g, new Vector3(0, 1.03f, 0), new Vector3(0.4f, 0.22f, 0.4f), Mats.Color(cap, 0.75f));
            if (label != null) Shapes.Sign(g, label, new Vector3(0, 0.62f, -0.255f), new Vector2(0.9f, 0.26f), Pal.Paper, Pal.Ink, 180, 0.15f);
        }

        void EStop(Vector3 at)
        {
            bool wall = at.z < -8;
            var g = new GameObject("estop").transform;
            g.SetParent(root, false);
            g.position = A(at.x, 0, at.z + (wall ? -0.4f : 0));
            Shapes.Box(g, new Vector3(0, 1.25f, 0), new Vector3(0.6f, 0.6f, 0.4f), Mats.Color(Pal.Yellow, 0.4f));
            if (!wall) Shapes.Cyl(g, new Vector3(0, 0.5f, 0), 0.06f, 1, Mats.Color(Pal.Dark));
            Shapes.Prim(PrimitiveType.Sphere, g, new Vector3(0, 1.25f, -0.2f), new Vector3(0.38f, 0.38f, 0.2f), Mats.Color(Pal.Red, 0.75f));
            Shapes.Sign(g, "E-STOP", new Vector3(0, 1.64f, -0.21f), new Vector2(0.6f, 0.18f), Pal.Red, Color.white, 180, 0.12f);
        }

        // ───────────────────────────── machines ─────────────────────────────
        void BuildMachines()
        {
            var S = Level.Spots;
            // sorter platform + head (Kenney machine)
            Box(new Vector3(Level.Sorter.x, 0.33f, Level.Sorter.z), new Vector3(Level.SorterSize, 0.66f, Level.SorterSize), Mats.Color(Pal.Orange, 0.4f));
            sorterArrow = new GameObject("sorter-arrow").transform;
            sorterArrow.SetParent(root, false);
            sorterArrow.position = A(Level.Sorter.x, 0.72f, Level.Sorter.z);
            Shapes.Box(sorterArrow, new Vector3(0, 0, 0.1f), new Vector3(0.3f, 0.04f, 0.9f), Mats.Color(Pal.Yellow, 0.5f, 0, Pal.Yellow * 0.6f));
            Shapes.Box(sorterArrow, new Vector3(0, 0, 0.62f), new Vector3(0.7f, 0.04f, 0.25f), Mats.Color(Pal.Yellow, 0.5f, 0, Pal.Yellow * 0.6f));
            sorterHead = new GameObject("sorter-head").transform;
            sorterHead.SetParent(root, false);
            sorterHead.position = A(Level.Sorter.x, 0, Level.Sorter.z + 1.2f);
            var mw = Kit.Spawn("factory", "machine-window", 1.35f, sorterHead);
            if (mw == null) Shapes.Box(sorterHead, new Vector3(0, 1, 0), new Vector3(1.4f, 2, 0.5f), Mats.Color(Pal.Orange));
            sorterText = Shapes.Text(sorterHead, "AUTO", new Vector3(0, 2.2f, -0.3f), 0.3f, K.Hex("#8cff9a"), Shapes.Mono);
            Shapes.Sign(sorterHead, "SORTER 9000", new Vector3(0, 2.55f, 0), new Vector2(1.5f, 0.36f), Pal.Yellow, Pal.Ink, 180, 0.2f);
            // scanner (Kenney) + laser
            var sc = Prop("factory", "scanner-high", Level.Scanner.x, 0, Level.Scanner.z, 1.4f);
            if (sc == null) { Box(new Vector3(Level.Scanner.x, 1.2f, -1.15f), new Vector3(0.3f, 2.4f, 0.3f), Mats.Color(Pal.Steel2)); Box(new Vector3(Level.Scanner.x, 1.2f, 1.15f), new Vector3(0.3f, 2.4f, 0.3f), Mats.Color(Pal.Steel2)); }
            scannerBeam = Mats.Transparent(new Color(1, 0.2f, 0.2f), 0.25f);
            Mats.Emit(scannerBeam, new Color(1, 0.1f, 0.1f) * 2);
            var beam = Shapes.Prim(PrimitiveType.Quad, root, A(Level.Scanner.x, 1.4f, 0), new Vector3(2.0f, 1.4f, 1), scannerBeam, new Vector3(0, 90, 0));
            beam.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            // dispenser
            var dp = Level.Dispenser;
            var fun = new GameObject("dispenser").transform; fun.SetParent(root, false); fun.position = A(dp.x, 0, dp.z);
            var hopper = Kit.Spawn("factory", "hopper-high-round", 1.6f, fun);
            if (hopper) { hopper.transform.localPosition = new Vector3(0, dp.y - 0.9f, 0); }
            else Shapes.Cone(fun, new Vector3(0, dp.y + 0.6f, 0), 1.25f, 1.3f, Mats.Color(Pal.Orange), new Vector3(180, 0, 0));
            Shapes.Cyl(fun, new Vector3(0, dp.y + 2.1f, 0), 0.6f, 2.6f, Mats.Color(Pal.Steel2, 0.6f, 0.4f));
            Shapes.Box(fun, VS.P(-1.6f, 1.8f, -1.2f), new Vector3(0.3f, 3.6f, 0.3f), Mats.Color(Pal.Teal));
            dispLamp = Mats.Unique(K.Hex("#333333"));
            Shapes.Sphere(fun, new Vector3(0.9f, dp.y + 0.9f, -0.7f), 0.32f, dispLamp);
            Shapes.Sign(fun, "INTAKE", new Vector3(0, dp.y + 1.3f, -0.7f), new Vector2(2.2f, 0.55f), Pal.Yellow, Pal.Ink);
            Button(S["disp_request"], Pal.Red, "REQUEST");
            MakeLever("disp_auto", S["disp_auto"], Pal.Yellow, "AUTO FEED");
            MakeLever("belt_a", S["belt_a_lever"], Pal.Blue, "BELT A DIR");
            MakeLever("belt_b", S["belt_b_lever"], Pal.Blue, "BELT B DIR");
            MakeLever("sorter", S["sorter_lever"], Pal.Purple, "SORT MODE", Pal.Orange);
            foreach (var z in new[] { "intake", "sorting", "dock" }) EStop(S["estop_" + z]);

            // pneumatic tube (glass) + hopper
            var glass = Mats.Transparent(K.Hex("#bff7f2"), 0.28f);
            var ringM = Mats.Color(Pal.Teal, 0.5f, 0.3f);
            var pts = Level.TubePath;
            for (int i = 0; i < pts.Length - 1; i++)
            {
                Vector3 a = VS.P(pts[i]), b = VS.P(pts[i + 1]);
                float len = Vector3.Distance(a, b);
                var seg = Shapes.Cyl(root, (a + b) / 2, 0.55f, len, glass);
                seg.transform.rotation = Quaternion.FromToRotation(Vector3.up, (b - a).normalized);
                seg.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                int n = Mathf.FloorToInt(len / 1.6f);
                for (int k = 0; k <= n; k++)
                {
                    var r = Shapes.Cyl(root, Vector3.Lerp(a, b, k / (float)Mathf.Max(1, n)), 0.6f, 0.12f, ringM);
                    r.transform.rotation = Quaternion.FromToRotation(Vector3.up, (b - a).normalized);
                }
                if (i < pts.Length - 2) Shapes.Sphere(root, b, 1.24f, Mats.Color(Pal.Teal, 0.5f));
            }
            foreach (float x in new[] { -1f, 13f, 19.5f }) Box(new Vector3(x, 2.6f, pts[1].z - 0.75f), new Vector3(0.25f, 5.2f, 0.25f), Mats.Color(Pal.Dark));
            var hop = Prop("factory", "hopper-round", Level.TubeMouth.x, 0, Level.TubeMouth.z, 1.5f);
            if (hop == null) Cyl(new Vector3(Level.TubeMouth.x, 0.7f, Level.TubeMouth.z), 0.9f, 1.2f, Mats.Color(Pal.Teal));
            tubeSwirl = Mats.Unique(K.Hex("#0d1a1e"));
            Shapes.Cyl(root, A(Level.TubeMouth.x, 0.62f, Level.TubeMouth.z), 0.62f, 0.02f, tubeSwirl);
            Sign("PNEUMA-TUBE", Level.TubeMouth.x, 1.9f, Level.TubeMouth.z + 0.9f, 1.8f, 0.42f, Pal.Teal, Color.white);
            var end = pts[pts.Length - 1];
            Cyl(new Vector3(end.x, end.y - 0.1f, end.z), 0.7f, 0.4f, Mats.Color(Pal.Teal));

            // doors (slide sideways into the walls) + frames
            foreach (var k in Level.DoorOrder)
            {
                var d = Level.Doors[k];
                float w = d.Z1 - d.Z0;
                var g = new GameObject("door-" + k).transform;
                g.SetParent(root, false);
                Shapes.Box(g, new Vector3(0, d.H / 2, 0), new Vector3(0.36f, d.H, w), Mats.Color(K.Hex("#6f7d84"), 0.4f, 0.4f));
                for (int i = 0; i < 4; i++) Shapes.Box(g, new Vector3(0, 0.5f + i * 0.7f, 0), new Vector3(0.38f, 0.06f, w - 0.1f), Mats.Color(K.Hex("#56636a")));
                Shapes.Box(g, new Vector3(0, 0.2f, 0), new Vector3(0.39f, 0.4f, w), Mats.Textured(Mats.Hazard(), Color.white, 0.3f, new Vector2(2, 1)));
                doors[k] = g;
                foreach (int s in new[] { -1, 1 }) Box(new Vector3(d.X, (d.H + 0.4f) / 2, (d.Z0 + d.Z1) / 2 + s * (w / 2 + 0.1f)), new Vector3(0.6f, d.H + 0.4f, 0.3f), Mats.Color(K.Hex("#2c4a52"), 0.4f));
                Box(new Vector3(d.X, d.H + 0.4f, (d.Z0 + d.Z1) / 2), new Vector3(0.6f, 0.4f, w + 0.5f), Mats.Color(Pal.Yellow, 0.4f));
                var lm = Mats.Unique(K.Hex("#333333"));
                Cyl(new Vector3(d.X, d.H + 0.75f, (d.Z0 + d.Z1) / 2), 0.16f, 0.18f, lm);
                doorLamps[k] = lm;
            }
            foreach (var side in new[] { "air_in", "air_out" })
            {
                var at = S[side];
                Cyl(new Vector3(at.x, 0.5f, at.z), 0.07f, 1, Mats.Color(Pal.Dark));
                Box(new Vector3(at.x, 1.15f, at.z), new Vector3(0.7f, 0.55f, 0.22f), Mats.Color(Pal.Yellow, 0.4f));
            }
            Sign("AIRLOCK", 7, 3.7f, 3.01f, 3.0f, 0.7f, Pal.Yellow, Pal.Ink);

            // lift
            var L = Level.Lift;
            liftT = new GameObject("lift").transform;
            liftT.SetParent(root, false);
            Shapes.Box(liftT, new Vector3(0, -0.15f, 0), new Vector3(L.x1 - L.x0, 0.3f, L.z1 - L.z0), Mats.Color(K.Hex("#5b6a71"), 0.4f, 0.4f));
            Shapes.Box(liftT, new Vector3(0, 0.005f, -((L.z1 - L.z0) / 2 - 0.13f)), new Vector3(L.x1 - L.x0, 0.02f, 0.25f), Mats.Textured(Mats.Hazard(), Color.white, 0.3f, new Vector2(3, 1)));
            foreach (var z in new[] { L.z0, L.z1 }) Box(new Vector3(L.x0 - 0.15f, 3, z), new Vector3(0.22f, 6, 0.22f), Mats.Color(Pal.Yellow, 0.4f));
            Box(new Vector3(L.x0 - 0.15f, 6, (L.z0 + L.z1) / 2), new Vector3(0.3f, 0.3f, L.z1 - L.z0 + 0.4f), Mats.Color(Pal.Yellow, 0.4f));
            Button(S["lift_btn"], Pal.Green, "LIFT", Pal.Teal);
            Button(S["lift_high"], Pal.Green, null, Pal.Teal, Level.SkyDock.top - 0.05f);

            // fan
            var fan = new GameObject("fan").transform; fan.SetParent(root, false); fan.position = A(Level.Fan.x, 0, Level.Fan.z);
            Shapes.Cyl(fan, new Vector3(0, 0.17f, 0), 1.25f, 0.35f, Mats.Color(Pal.Teal, 0.4f));
            fanBlades = new GameObject("blades").transform; fanBlades.SetParent(fan, false); fanBlades.localPosition = new Vector3(0, 0.36f, 0);
            for (int i = 0; i < 5; i++)
            {
                var bl = Shapes.Box(fanBlades, Vector3.zero, new Vector3(0.9f, 0.04f, 0.32f), Mats.Color(K.Hex("#cfd6d8"), 0.7f, 0.5f));
                bl.transform.localRotation = Quaternion.Euler(0, i * 72, 20);
                bl.transform.localPosition = bl.transform.localRotation * new Vector3(0.5f, 0, 0);
            }
            fanColumn = Mats.Transparent(K.Hex("#dff8ff"), 0.08f);
            var col = Shapes.Cyl(fan, new Vector3(0, 2.8f, 0), 1.1f, 4.8f, fanColumn);
            col.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            MakeLever("fan", S["fan_switch"], Pal.Teal, "FAN");

            // magnet crane
            var mg = Level.Magnet;
            Prop("factory", "crane", mg.x + 1.0f, Level.SkyDock.top, mg.z - 2.2f, 1.6f, 0);
            magnetT = new GameObject("magnet").transform; magnetT.SetParent(root, false); magnetT.position = A(mg.x, mg.y + 0.2f, mg.z);
            var mag = Kit.Spawn("factory", "crane-magnet", 1.4f, magnetT);
            if (mag == null) Shapes.Cyl(magnetT, Vector3.zero, 0.5f, 0.4f, Mats.Color(Pal.Red));
            else mag.transform.localPosition = new Vector3(0, -0.6f, 0);
            magnetGlow = Mats.Transparent(K.Hex("#7af7ff"), 0f);
            var gl = Shapes.Sphere(magnetT, new Vector3(0, -0.7f, 0), 1.0f, magnetGlow);
            gl.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            MakeLever("magnet", S["magnet_lever"], Pal.Blue, "MAGNET");

            // delivery pads
            foreach (var kv in Level.Pads)
            {
                var p = kv.Value; var col2 = Bays.All[kv.Key].Color;
                Box(new Vector3(p.X, p.Y + 0.03f, p.Z), new Vector3(p.Size + 0.3f, 0.08f, p.Size + 0.3f), Mats.Color(Pal.Ink));
                var ring = Mats.Unique(col2, 0.4f); Mats.Emit(ring, col2 * 0.3f);
                Box(new Vector3(p.X, p.Y + 0.05f, p.Z), new Vector3(p.Size, 0.1f, p.Size), ring);
                Box(new Vector3(p.X, p.Y + 0.056f, p.Z), new Vector3(p.Size - 0.5f, 0.11f, p.Size - 0.5f), Mats.Color(K.Hex("#2b3036"), 0.3f));
                var letter = Shapes.Text(root, kv.Key, A(p.X, p.Y + 0.12f, p.Z), 2.0f, col2);
                letter.transform.localEulerAngles = new Vector3(90, 0, 0);
                pads[kv.Key] = ring;
                padFlash[kv.Key] = 0;
                Cyl(new Vector3(p.X + p.Size / 2 + 0.4f, p.Y + 1.2f, p.Z - p.Size / 2 + 0.3f), 0.06f, 2.4f, Mats.Color(Pal.Dark));
                Sign(Bays.All[kv.Key].Name, p.X + p.Size / 2 + 0.4f, p.Y + 2.3f, p.Z - p.Size / 2 + 0.3f, 1.8f, 0.5f, col2, Color.white);
            }
            // heat pad (toaster)
            var hp = Level.HeatPad;
            Box(new Vector3(hp.x, 0.12f, hp.z), new Vector3(1.8f, 0.24f, 1.8f), Mats.Color(Pal.Dark));
            heatCoil = Mats.Unique(K.Hex("#552222"));
            Cyl(new Vector3(hp.x, 0.26f, hp.z), 0.65f, 0.04f, heatCoil);
            Box(new Vector3(hp.x, 1.3f, hp.z + 1.0f), new Vector3(0.12f, 2.6f, 0.12f), Mats.Color(Pal.Dark));
            Shapes.Cone(root, A(hp.x, 2.2f, hp.z), 0.45f, 0.4f, Mats.Color(Pal.Red, 0.5f));
            Sign("TOASTER", hp.x, 0.3f, hp.z + 0.91f, 1.3f, 0.32f, Pal.Red, Color.white);
            // incinerator
            var ic = Level.Incinerator;
            Box(new Vector3(ic.x, 0.35f, ic.z), new Vector3(2, 0.7f, 2), Mats.Color(K.Hex("#4a3c36"), 0.3f));
            incin = Mats.Unique(K.Hex("#2a1a10"));
            Mats.Emit(incin, new Color(1, 0.35f, 0.1f) * 2);
            Box(new Vector3(ic.x, 0.705f, ic.z), new Vector3(1.5f, 0.02f, 1.5f), incin);
            Cyl(new Vector3(ic.x + 0.6f, 2.2f, ic.z - 0.6f), 0.35f, 3.2f, Mats.Color(K.Hex("#5b4a42")));
            Sign("JUNK → FIRE", ic.x, 0.36f, ic.z + 1.01f, 1.8f, 0.42f, Pal.Orange, Pal.Ink);
            // boiler + gauge + valve
            var bo = Level.Boiler;
            var tank = Cyl(new Vector3(bo.x, 1.6f, bo.z), 1.35f, 3.0f, Mats.Color(K.Hex("#c0583a"), 0.55f, 0.35f));
            Shapes.Sphere(root, A(bo.x, 3.1f, bo.z), 2.7f, Mats.Color(K.Hex("#c0583a"), 0.55f, 0.35f));
            foreach (float y in new[] { 0.4f, 1.6f, 2.8f }) Cyl(new Vector3(bo.x, y, bo.z), 1.38f, 0.1f, Mats.Color(K.Hex("#7d3220"), 0.5f, 0.4f));
            var dial = new GameObject("gauge").transform; dial.SetParent(root, false); dial.position = A(bo.x, 2.2f, bo.z + 1.42f);
            Shapes.Cyl(dial, Vector3.zero, 0.6f, 0.12f, Mats.Color(Pal.Ink), new Vector3(90, 0, 0));
            Shapes.Cyl(dial, new Vector3(0, 0, -0.05f), 0.54f, 0.04f, Mats.Color(K.Hex("#f7f1e3"), 0.2f), new Vector3(90, 0, 0));
            needle = new GameObject("needle").transform; needle.SetParent(dial, false); needle.localPosition = new Vector3(0, 0, -0.09f);
            Shapes.Box(needle, new Vector3(0, 0.2f, 0), new Vector3(0.04f, 0.46f, 0.02f), Mats.Color(Pal.Red));
            boilerText = Shapes.Text(root, "30 PSI", A(bo.x, 1.3f, bo.z + 1.45f), 0.3f, K.Hex("#8cff9a"), Shapes.Mono);
            Sign("BOILER", bo.x, 3.4f, bo.z + 1.38f, 1.7f, 0.42f, Pal.Yellow, Pal.Ink);
            var vt = S["valve"];
            Cyl(new Vector3(vt.x, 0.55f, vt.z - 0.1f), 0.12f, 1.1f, Mats.Color(K.Hex("#7d3220")));
            var wheel = new GameObject("valve-wheel").transform; wheel.SetParent(root, false); wheel.position = A(vt.x, 1.15f, vt.z - 0.1f);
            Shapes.Cyl(wheel, Vector3.zero, 0.4f, 0.06f, Mats.Color(Pal.Red, 0.6f));
            for (int i = 0; i < 3; i++) { var sp = Shapes.Box(wheel, new Vector3(0, 0.02f, 0), new Vector3(0.74f, 0.05f, 0.06f), Mats.Color(Pal.Red)); sp.transform.localRotation = Quaternion.Euler(0, i * 60, 0); }
            spinners.Add((wheel, 0));
            // power panel
            Box(new Vector3(-8.6f, 1.65f, -21.72f), new Vector3(5.2f, 2.3f, 0.3f), Mats.Color(Pal.Steel2, 0.4f, 0.3f));
            Sign("POWER DISTRIBUTION", -8.6f, 2.95f, -21.55f, 4.2f, 0.4f, Pal.Ink, Pal.Yellow);
            foreach (var z in new[] { "intake", "sorting", "dock", "main" })
            {
                var at = S["brk_" + z];
                MakeLever("brk_" + z, new Vector3(at.x, 1.5f, -21.55f), z == "main" ? Pal.Red : Pal.Yellow, z.ToUpperInvariant(), z == "main" ? Pal.Yellow : (Color?)null, true);
            }
            // hotline
            var hl = new GameObject("hotline").transform; hl.SetParent(root, false); hl.position = A(17.3f, 0, 9.5f);
            Shapes.Box(hl, new Vector3(0, 1.3f, 0), new Vector3(3.6f, 2.6f, 0.4f), Mats.Color(Pal.Ink));
            Shapes.Sign(hl, "FOREMAN'S HOTLINE", new Vector3(0, 2.4f, 0.22f), new Vector2(3.2f, 0.5f), Pal.Yellow, Pal.Ink, 0); // faces into the dock (north)
            phone = new GameObject("phone").transform; phone.SetParent(hl, false); phone.localPosition = new Vector3(0, 1.55f, 0.3f);
            Shapes.Box(phone, Vector3.zero, new Vector3(0.6f, 0.5f, 0.25f), Mats.Color(Pal.Red, 0.7f));
            Shapes.Box(phone, new Vector3(0, 0.32f, 0), new Vector3(0.75f, 0.16f, 0.2f), Mats.Color(Pal.Red, 0.7f));
            MakeLever("hotline_out", new Vector3(S["hotline_out"].x, 0, S["hotline_out"].z - 0.6f), Pal.Green, "CLOCK OUT", Pal.Ink);
            MakeLever("hotline_ot", new Vector3(S["hotline_ot"].x, 0, S["hotline_ot"].z - 0.6f), Pal.Orange, "OVERTIME", Pal.Ink);
        }

        // ───────────────────────────── break room ─────────────────────────────
        void BuildLobby()
        {
            var S = Level.Spots;
            Box(new Vector3(-39.5f, 1.9f, -9.7f), new Vector3(9.4f, 2.8f, 0.2f), Mats.Color(K.Hex("#b98a56"), 0.05f));
            Sign("CONTRACTS", -39.5f, 3.0f, -9.58f, 3.4f, 0.6f, Pal.Yellow, Pal.Ink);
            for (int i = 0; i < 3; i++)
            {
                var at = S["contract" + i];
                var c = new GameObject("clip" + i).transform; c.SetParent(root, false); c.position = A(at.x, 1.75f, -9.55f);
                Shapes.Box(c, Vector3.zero, new Vector3(1.5f, 1.9f, 0.06f), Mats.Color(Pal.Wood, 0.2f));
                Shapes.Box(c, new Vector3(0, -0.05f, -0.035f), new Vector3(1.3f, 1.6f, 0.01f), Mats.Color(Pal.Paper, 0.1f));
                contractTexts[i] = Shapes.Text(c, "", new Vector3(0, 0.1f, -0.05f), 0.13f, Pal.Ink, Shapes.Mono, new Vector3(0, 0, 0));
                contractTexts[i].transform.localEulerAngles = new Vector3(0, 0, 0);
                contractClips[i] = c;
            }
            Box(new Vector3(-45.72f, 1.7f, -3.5f), new Vector3(0.2f, 2.4f, 7.4f), Mats.Color(Pal.Red, 0.3f));
            foreach (var r in Riders.All)
            {
                var at = S["rider_" + r.Id];
                MakeLever("rider_" + r.Id, new Vector3(at.x - 0.2f, 1.5f, at.z), Pal.Yellow, r.Name, null, true, 90);
            }
            foreach (var (n, key, col) in new[] { ("COLOR", "locker_color", Pal.Blue), ("HAT", "locker_hat", Pal.Teal), ("LOOK", "locker_model", Pal.Purple) })
            {
                var at = S[key];
                Box(new Vector3(at.x - 0.15f, 1.2f, at.z), new Vector3(0.9f, 2.4f, 1.8f), Mats.Color(col, 0.4f, 0.2f));
                Shapes.Sign(root, n, A(at.x + 0.32f, 1.65f, at.z), new Vector2(1.0f, 0.3f), Pal.Paper, Pal.Ink, 90);
            }
            var pc = S["punch"];
            Cyl(new Vector3(pc.x - 0.4f, 0.55f, pc.z), 0.08f, 1.1f, Mats.Color(Pal.Dark));
            Box(new Vector3(pc.x - 0.4f, 1.4f, pc.z), new Vector3(0.7f, 0.9f, 0.45f), Mats.Color(Pal.Orange, 0.4f));
            Sign("PUNCH IN", pc.x - 0.4f, 2.0f, pc.z, 0.9f, 0.26f, Pal.Yellow, Pal.Ink);
            Box(new Vector3(-44.6f, 1.1f, -8.6f), new Vector3(1.6f, 2.2f, 1.2f), Mats.Color(Pal.Red, 0.5f));
            Sign("FIZZ", -44.6f, 2.0f, -8.0f, 1.2f, 0.35f, Pal.Paper, Pal.Red);
            Box(new Vector3(-40, 0.3f, 6.8f), new Vector3(4.2f, 0.5f, 1.3f), Mats.Color(Pal.Teal2, 0.1f));
            Box(new Vector3(-40, 0.75f, 7.3f), new Vector3(4.2f, 0.9f, 0.35f), Mats.Color(Pal.Teal2, 0.1f));
            Box(new Vector3(-33.3f, 2.0f, -9.6f), new Vector3(2.8f, 1.6f, 0.12f), Mats.Color(K.Hex("#24382e"), 0.1f));
            ledgerText = Shapes.Text(root, "COMPANY LEDGER\n$0", A(-33.3f, 2.0f, -9.53f), 0.22f, Pal.Paper, Shapes.Mono, new Vector3(0, 0, 0));
        }

        // ───────────────────────────── decor + kit dressing ─────────────────────────────
        void BuildDecor()
        {
            Color[] pipeCols = { Pal.Orange, Pal.Teal2, Pal.Red };
            for (int i = 0; i < 3; i++)
            {
                var p = Cyl(new Vector3(-22, 2.5f + i * 0.32f, -9.55f - i * 0.12f), 0.11f, 47, Mats.Color(pipeCols[i], 0.6f));
                p.transform.rotation = Quaternion.Euler(0, 0, 90);
            }
            foreach (var (t, x, y, z, w, bg) in new[] { ("INTAKE BAY", -23f, 3.1f, -9.73f, 3.6f, Pal.Yellow), ("SORTING HALL", -5f, 3.1f, -9.73f, 3.8f, Pal.Yellow), ("SHIPPING DOCK", 14f, 3.3f, -9.73f, 4f, Pal.Yellow), ("BREAK ROOM", -42f, 3.25f, -9.6f, 3f, Pal.Paper), ("CONTROL ROOM", -5f, 3.1f, -21.73f, 3.8f, Pal.Yellow) })
                Sign(t, x, y, z, w, w / 4.6f, bg, Pal.Ink);
            foreach (float x in new[] { -42f, -36f, -27f, -19f, -9f, 0f, 14f, 21f, 27f })
            {
                var m = Mats.Unique(K.Hex("#fff6d6")); Mats.Emit(m, K.Hex("#ffe7a8") * 3);
                Shapes.Sphere(root, A(x, 3.2f, -9.55f), 0.36f, m);
                lamps.Add(m);
            }
            foreach (var (x, z) in new[] { (-19f, -9.5f), (-1f, -9.5f), (18f, -9.5f), (-1f, -21.5f) })
            {
                var b = new GameObject("beacon").transform; b.SetParent(root, false); b.position = A(x, 3.75f, z + 0.1f);
                var bm = Mats.Unique(K.Hex("#802020"));
                Shapes.Sphere(b, Vector3.zero, 0.34f, bm);
                var lgo = new GameObject("light"); lgo.transform.SetParent(b, false); lgo.transform.localRotation = Quaternion.Euler(35, 0, 0);
                var l = lgo.AddComponent<Light>(); l.type = LightType.Spot; l.color = new Color(1, 0.2f, 0.2f); l.range = 14; l.spotAngle = 60; l.intensity = 0;
                beacons.Add((b, l, bm));
            }
            // kit dressing: robot arms, cogs, signal towers, crates, the industrial estate outside
            foreach (var (x, z, yaw, k) in new[] { (-29.6f, -8.5f, 35f, "a"), (2.7f, -8.4f, -30f, "b"), (-16.2f, -8.5f, 15f, "b"), (-0.4f, -21.3f, 10f, "a") })
            {
                var r = Prop("factory", "robot-arm-" + k, x, 0, z, 2.1f, yaw);
                if (r == null) continue;
                int i = 0;
                foreach (var t in r.GetComponentsInChildren<Transform>())
                    if (t != r.transform && t.childCount > 0) robotJoints.Add((t, t.localEulerAngles, x * 0.37f + z, i++));
                Prop("factory", "box-wide", x + Mathf.Sin(yaw * Mathf.Deg2Rad) * 1.3f, 0, z + Mathf.Cos(yaw * Mathf.Deg2Rad) * 1.3f, 1.6f, yaw);
            }
            foreach (var (x, y, z, s, sp) in new[] { (-27.5f, 2.4f, -9.68f, 2.2f, 25f), (-25.9f, 1.7f, -9.68f, 1.4f, -40f), (6.6f, 2.5f, -2.95f, 1.8f, 30f) })
            {
                var c = Prop("factory", "cog-a", x, y, z, s);
                if (c == null) continue;
                c.transform.rotation = Quaternion.Euler(90, 0, 0);
                spinners.Add((c.transform, sp));
            }
            Prop("factory", "warning-traffic", 3.3f, 0, 3.35f, 1.7f);
            Prop("factory", "warning-traffic", 10.7f, 0, -3.35f, 1.7f);
            Prop("factory", "warning-orange", -13.7f, 0, 3.45f, 1.7f);
            foreach (float z in new[] { -3.25f, 3.25f }) Prop("factory", "structure-yellow-tall", -14, 0, z, 1.6f);
            Prop("factory", "screen-wide", -1.5f, 0, -9.35f, 1.6f);
            Prop("factory", "machine-fortified", -11.6f, 0, -8.9f, 1.4f);
            foreach (var (x, z) in new[] { (-30.3f, 7.3f), (12.1f, -8.4f), (26.5f, 8.6f), (-12.6f, 8.6f) })
            {
                Prop("factory", "box-large", x, 0, z, 1.8f, 10);
                Prop("factory", "box-small", x + 0.2f, 0.99f, z + 0.1f, 1.8f, 30);
                Prop("prototype", "crate-color", x + 1.6f, 0, z, 1.8f, -10);
            }
            foreach (var (x, z) in new[] { (11.2f, 1.6f), (11.2f, -1.6f), (14.8f, -5.5f), (-15.2f, 8.6f) }) Prop("factory", "cone", x, 0, z, 2.2f);
            string[] north = { "building-a", "building-e", "building-k", "building-c", "building-g", "building-p", "building-h" };
            for (int i = 0; i < north.Length; i++) Prop("industrial", north[i], -40 + i * 12, 0, -31 - (i % 2) * 4, 6, 180);
            Prop("industrial", "chimney-large", -22, 0, -27, 5); chimneys.Add(A(-22, 9.0f, -27));
            Prop("industrial", "chimney-medium", 14, 0, -27, 5); chimneys.Add(A(14, 7.0f, -27));
            Prop("industrial", "water-tower", 40, 0, -20, 5);
            Prop("industrial", "detail-tank-large", 10, 0, -27, 4);
            Prop("industrial", "detail-tank", 24, 0, -26, 4);
            Prop("industrial", "windmill", -56, 0, -24, 6);
            Prop("industrial", "building-m", -56, 0, -6, 6, 90);
            Prop("industrial", "building-k", -56, 0, 6, 6, 90);
            string[] cont = { "a", "b", "c" };
            for (int i = 0; i < 6; i++) Prop("industrial", "shipping-container-" + cont[i % 3], 35 + (i % 2) * 4.6f, i > 3 ? 7.7f : 0, -6 + (i / 2) * 6.4f, 6, i % 3 == 0 ? 180 : 0);
            Prop("industrial", "solar-panel-landscape-group", 44, 0, 8, 5);
        }

        public void FlashPad(string id) { if (padFlash.ContainsKey(id)) padFlash[id] = 1; }

        // ───────────────────────────── per-frame sync ─────────────────────────────
        public void Update(SnapPlant pl, SnapGame g, float dt, float t)
        {
            foreach (var (tr, sp) in spinners) if (sp != 0) tr.Rotate(0, 0, sp * dt, Space.Self);
            foreach (var (tr, r0, seed, i) in robotJoints)
            {
                float w = Mathf.Sin(t * (0.9f + i * 0.3f) + seed + i) * 20;
                tr.localEulerAngles = i == 0 ? r0 + new Vector3(0, w * 2.2f, 0) : r0 + new Vector3(0, 0, w);
            }
            if (pl == null) return;
            bool Powered(int zi) => pl.main && pl.pw[zi] && pl.es[zi] <= 0;
            foreach (var b in Level.Belts)
            {
                var (mat, lamp, frame) = belts[b.Id];
                var st = pl.belts[b.Id];
                var off = mat.GetTextureOffset("_BaseMap");
                off.y -= st.speed * dt / 1.6f;
                mat.SetTextureOffset("_BaseMap", off); mat.SetTextureOffset("_MainTex", off);
                Color c = st.jam ? (Mathf.Sin(t * 12) > 0 ? Pal.Red : K.Hex("#401010")) : Mathf.Abs(st.speed) > 0.1f ? (st.dir > 0 ? Pal.Green : K.Hex("#ffb547")) : K.Hex("#333333");
                Mats.SetBase(lamp, c); Mats.Emit(lamp, c * 2);
                frame.localPosition = new Vector3(frame.localPosition.x, st.jam ? Mathf.Sin(t * 40) * 0.02f : 0, frame.localPosition.z);
            }
            SetLever("belt_a", pl.belts["A"].dir > 0, dt);
            SetLever("belt_b", pl.belts["B"].dir > 0, dt);
            sorterArrow.localRotation = Quaternion.Euler(0, pl.sorterFault ? t * 500 : pl.sorterMode == "C" ? 0 : 90, 0);
            sorterHead.localRotation = Quaternion.Euler(0, 0, pl.sorterFault ? Mathf.Sin(t * 30) * 2 : 0);
            string sk = pl.sorterMode + pl.sorterFault;
            if (sk != sorterKey) { sorterKey = sk; sorterText.text = pl.sorterFault ? "ERR#@!" : pl.sorterMode == "auto" ? "AUTO" : pl.sorterMode == "B" ? "→ BELT B" : "→ TUBE"; sorterText.color = pl.sorterFault ? Pal.Red : K.Hex("#8cff9a"); }
            SetLever("sorter", pl.sorterMode != "auto", dt, pl.sorterMode == "auto" ? Pal.Green : pl.sorterMode == "B" ? Pal.Blue : Pal.Yellow);
            scannerBeam.SetColor("_BaseColor", new Color(1, 0.2f, 0.2f, Powered(1) ? 0.18f + Mathf.Sin(t * 20) * 0.06f : 0));
            SetLever("disp_auto", pl.dispAuto, dt);
            Color dl = pl.overheat.Contains("dispenser") ? (Mathf.Sin(t * 10) > 0 ? Pal.Red : K.Hex("#401010")) : Powered(0) ? Pal.Green : K.Hex("#333333");
            Mats.SetBase(dispLamp, dl); Mats.Emit(dispLamp, dl * 2);
            Mats.Emit(tubeSwirl, Pal.Teal2 * (pl.tube ? 1.2f + Mathf.Sin(t * 6) * 0.4f : 0.05f));
            for (int i = 0; i < 3; i++)
            {
                var k = Level.DoorOrder[i]; var d = Level.Doors[k];
                doors[k].position = A(d.X, 0, (d.Z0 + d.Z1) / 2 - pl.doors[i] * (d.Z1 - d.Z0 + 0.1f));
                Color c = pl.doors[i] > 0.95f ? Pal.Green : pl.doors[i] < 0.05f ? Pal.Red : (Mathf.Sin(t * 10) > 0 ? Pal.Yellow : K.Hex("#555533"));
                Mats.SetBase(doorLamps[k], c); Mats.Emit(doorLamps[k], c * 2);
            }
            var L = Level.Lift;
            liftT.position = A((L.x0 + L.x1) / 2, pl.lift, (L.z0 + L.z1) / 2);
            fanBlades.Rotate(0, (pl.fan ? 1600 : pl.overheat.Contains("fan") ? 160 : 0) * dt, 0, Space.Self);
            fanColumn.SetColor("_BaseColor", new Color(0.87f, 0.97f, 1, pl.fan ? 0.12f + Mathf.Sin(t * 7) * 0.03f : 0.02f));
            SetLever("fan", pl.fanOn, dt);
            var glow = pl.mag < 0 ? new Color(1, 0.5f, 0.56f, 0) : new Color(0.48f, 0.97f, 1, 0);
            glow.a = pl.mag != 0 ? 0.35f + Mathf.Sin(t * 15) * 0.1f : 0;
            magnetGlow.SetColor("_BaseColor", glow);
            magnetT.position = A(Level.Magnet.x + (pl.mag != 0 ? Mathf.Sin(t * 40) * 0.015f : 0), Level.Magnet.y + 0.2f, Level.Magnet.z);
            SetLever("magnet", pl.magOn, dt);
            Mats.Emit(heatCoil, new Color(1, 0.35f, 0.12f) * (pl.heatPad >= 1 ? 3 + Mathf.Sin(t * 9) : pl.heatPad > 0 ? 0.8f : 0));
            Mats.Emit(incin, new Color(1, 0.35f, 0.1f) * (2 + Mathf.Sin(t * 13) * 0.4f + Mathf.Sin(t * 7.1f) * 0.3f));
            float P = pl.P;
            float ang = Mathf.Lerp(135, -135, Mathf.Clamp01(P / 100f));
            needle.localRotation = Quaternion.Euler(0, 0, ang + (P > 85 ? Mathf.Sin(t * 50) * 3 : 0));
            boilerText.text = $"{Mathf.RoundToInt(P)} PSI";
            boilerText.color = P > 85 ? Pal.Red : P > 70 ? K.Hex("#ffb547") : K.Hex("#8cff9a");
            if (pl.ctl.ContainsKey("valve")) spinners[0].t.Rotate(0, 360 * dt, 0, Space.Self);
            string[] zones = { "intake", "sorting", "dock" };
            for (int i = 0; i < 3; i++) SetLever("brk_" + zones[i], pl.pw[i], dt);
            SetLever("brk_main", pl.main, dt, pl.main ? Pal.Green : (Mathf.Sin(t * 8) > 0 ? Pal.Red : K.Hex("#401010")));
            bool ring = g != null && g.ring;
            phone.localRotation = Quaternion.Euler(0, 0, ring ? Mathf.Sin(t * 40) * 7 : 0);
            SetLever("hotline_out", false, dt, g != null && g.quotaMet ? Pal.Green : K.Hex("#333333"));
            SetLever("hotline_ot", g != null && g.overtime > 0 && !g.otDone, dt, g != null && g.quotaMet ? Pal.Orange : K.Hex("#333333"));
            foreach (var id in new List<string>(padFlash.Keys))
            {
                padFlash[id] = Mathf.Max(0, padFlash[id] - dt * 2);
                var c = Bays.All[id].Color;
                Mats.Emit(pads[id], c * (0.3f + padFlash[id] * 3 + (g != null && g.phase == "shift" ? Mathf.Sin(t * 3 + id[0]) * 0.1f : 0)));
            }
            if (g != null)
            {
                foreach (var r in Riders.All) SetLever("rider_" + r.Id, g.riders.TryGetValue(r.Id, out var on) && on, dt, on ? Pal.Red : K.Hex("#333333"));
                if (g.contracts != null)
                {
                    string ck = g.sel + string.Join(",", g.contracts.ConvertAll(c => c.name));
                    if (ck != contractKey)
                    {
                        contractKey = ck;
                        for (int i = 0; i < 3; i++)
                        {
                            if (i >= g.contracts.Count) { contractTexts[i].text = ""; continue; }
                            var c = g.contracts[i];
                            var sb = new System.Text.StringBuilder();
                            sb.AppendLine(c.name.Replace(" ", "\n"));
                            foreach (var l in c.lines) sb.AppendLine($"{l.need} × {l.type.ToUpperInvariant()}");
                            sb.Append($"${c.bonus}");
                            if (g.sel == i) sb.Append("\n✓ PICKED");
                            contractTexts[i].text = sb.ToString();
                            contractTexts[i].color = g.sel == i ? Pal.Red : Pal.Ink;
                        }
                    }
                    for (int i = 0; i < 3; i++) contractClips[i].localRotation = Quaternion.Euler(0, 0, g.sel == i ? Mathf.Sin(t * 2) * 2 : 0);
                }
                string lk = $"{g.ledger}|{g.shifts}";
                if (lk != ledgerKey) { ledgerKey = lk; ledgerText.text = $"COMPANY LEDGER\n${g.ledger:N0}\nSHIFTS {g.shifts}  TIER {g.tier}"; }
            }
            bool alarm = !pl.main || pl.P > 88 || pl.inc.Exists(i => i.kind == "breach");
            foreach (var (bt, l, m) in beacons)
            {
                bt.localRotation = Quaternion.Euler(0, alarm ? t * 340 : 0, 0);
                l.intensity = alarm ? 40 : 0;
                Mats.Emit(m, new Color(1, 0.13f, 0.13f) * (alarm ? 4 : 0));
            }
            float lampI = pl.main ? (g != null && g.dark ? 0.4f : 3) : 0.05f;
            foreach (var m in lamps) Mats.Emit(m, K.Hex("#ffe7a8") * lampI);
        }
    }
}
