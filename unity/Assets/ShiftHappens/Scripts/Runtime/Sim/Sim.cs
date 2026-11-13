// The authoritative simulation. Runs only on the host (or locally for solo/couch).
// Clients never touch physics: they render snapshots. Port of shared/sim/Sim.js.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ShiftHappens
{
    public enum PState { Ok = 0, Down = 1, Carried = 2, Tube = 3, Gone = 4 }
    public static class Btn { public const int Run = 1, Jump = 2, Grab = 4, Use = 8, Throw = 16; }

    [Serializable] public class Outfit { public string color = "#ff7a2f", hat = "none", model = "worker"; public Outfit Clone() => (Outfit)MemberwiseClone(); }

    [Serializable]
    public class Stats
    {
        public int delivered, earned, broken, knockdowns, tubeRides, thrownMates, timesThrown, fixes, estops, misdeliveries, burnt, jumps, maxMistake;
        public float beltTime, valveTime, distance;
        public string maxMistakeWhat = "";
        public Stats Clone() => (Stats)MemberwiseClone();
    }

    public class PlayerInput { public float mx, mz; public int b; public int[] c = new int[4]; }
    public class Hold { public bool isPlayer; public int id; }
    public class Prompt { public string g, u, t, k, cid; public float p; }
    public class TubeState { public float s; public int layer; }

    public class SimEvent
    {
        public string type; public int id, who, n; public float x, y, z, v; public string s = "", s2 = ""; public bool b;
        public SimEvent(string type) { this.type = type; }
    }

    public class Player
    {
        public int id, slot, carriedBy, escape, thrownBy;
        public string name;
        public Outfit outfit;
        public Rigidbody body;
        public float yaw, downT, held, goneT, shoveCd, anim, speed, jumpT;
        public PState state;
        public Hold holding;
        public PlayerInput input = new PlayerInput();
        public int[] lastC = new int[4];
        public bool grounded, ready, connected = true;
        public string onBelt, usingId;
        public Prompt prompt;
        public Stats stats = new Stats();
        public TubeState tube;
        public Vector2 lastPos;
        public Vector3 Pos => body.position;
    }

    public class CargoItem
    {
        public int id, lastTouch, lastThrower;
        public string type, bay, route, onBelt, shipPad;
        public CargoDef def;
        public Rigidbody body;
        public Collider col;
        public float radius, halfH, heat, thrownT, padT, spawnT, hopT = 1, wobT = 1.5f, snagT, shipping;
        public bool scanned, ot;
        public HashSet<int> holders = new HashSet<int>();
        public TubeState tube;
    }

    public class Control
    {
        public string id, kind = "press", snd = "button";
        public Vector3 pos;
        public float holdTime = 2, r = 0.35f, priority, progress;
        public bool twoHand, active;
        public Func<Player, string> label;
        public Action<Player> act;
        public Action<List<Player>> complete;
        public Action<List<Player>, float> onHold;
    }

    public class SimBody : MonoBehaviour
    {
        public Sim sim; public bool isPlayer; public int id;
        void OnCollisionEnter(Collision c) { sim?.QueueCollision(this, c); }
    }

    public partial class Sim
    {
        public Rng rnd;
        public float time;
        public int tick;
        int nextId = 100;
        public List<SimEvent> events = new List<SimEvent>();
        public SortedDictionary<int, CargoItem> cargo = new SortedDictionary<int, CargoItem>();
        public SortedDictionary<int, Player> players = new SortedDictionary<int, Player>();
        public List<Control> controls = new List<Control>();
        public Dictionary<string, Control> controlById = new Dictionary<string, Control>();
        public Dictionary<string, float> zoneGravity = new Dictionary<string, float>();
        public Transform root;
        public Plant plant;
        public Game game;

        struct Hit { public SimBody a, b; public float impact; public Vector3 vel; }
        readonly List<Hit> collisions = new List<Hit>();

        public Sim(uint seed)
        {
            rnd = new Rng(seed);
            root = new GameObject("SimWorld").transform;
            Physics.gravity = new Vector3(0, -K.Gravity, 0);
            Phys.ManualSimulation();
            for (int l = 0; l < 32; l++) { Physics.IgnoreLayerCollision(K.LGhost, l, true); }
            Physics.IgnoreLayerCollision(K.LHeld, K.LPlayer, true);
            Physics.IgnoreLayerCollision(K.LStatic, K.LDoor, true);
            BuildStatic();
            plant = new Plant(this);
            game = new Game(this);
            SpawnCargo("ball", Level.LobbyBall);
        }

        public void Destroy() { if (root) UnityEngine.Object.Destroy(root.gameObject); }

        public int NewId() => nextId++;
        public SimEvent Emit(string type) { var e = new SimEvent(type); events.Add(e); return e; }

        // ───────────────────────────── static world ─────────────────────────────
        public GameObject StaticBox(Vector3 c, Vector3 size, float friction = 0.45f, bool belt = false)
        {
            var go = new GameObject("static");
            go.layer = K.LStatic;
            go.transform.SetParent(root, false);
            go.transform.position = c;
            var bc = go.AddComponent<BoxCollider>();
            bc.size = size;
            Phys.SetMaterial(bc, belt ? 0f : friction, 0.05f, belt);
            return go;
        }

        public Rigidbody KinematicBox(Vector3 c, Vector3 size)
        {
            var go = StaticBox(c, size);
            go.layer = K.LDoor;
            var rb = go.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.interpolation = RigidbodyInterpolation.None;
            return rb;
        }

        void BuildStatic()
        {
            StaticBox(new Vector3(-8, -0.5f, -6), new Vector3(220, 1, 220));
            foreach (var w in Level.Walls) StaticBox(new Vector3(w.X, w.H / 2, w.Z), new Vector3(w.W, w.H, w.D));
            var s = Level.SkyDock;
            StaticBox(new Vector3((s.x0 + s.x1) / 2, s.top / 2, (s.z0 + s.z1) / 2), new Vector3(s.x1 - s.x0, s.top, s.z1 - s.z0));
            StaticBox(new Vector3(-8, 9, -6), new Vector3(80, 1, 34));
            StaticBox(new Vector3(-44.6f, 1.1f, -8.6f), new Vector3(1.6f, 2.2f, 1.2f));
            StaticBox(new Vector3(-40, 0.35f, 6.8f), new Vector3(4.2f, 0.7f, 1.3f));
            StaticBox(new Vector3(-45.55f, 1.2f, 5), new Vector3(0.9f, 2.4f, 6.2f));
        }

        // ───────────────────────────── players ─────────────────────────────
        public Player AddPlayer(string name, Outfit outfit)
        {
            int id = NewId();
            int n = players.Count;
            var sp = Level.Spawns[n % Level.Spawns.Length];
            var go = new GameObject("player" + id);
            go.layer = K.LPlayer;
            go.transform.SetParent(root, false);
            go.transform.position = sp;
            var sc = go.AddComponent<SphereCollider>();
            sc.radius = K.PlayerRadius;
            Phys.SetMaterial(sc, 0f, 0.05f, true);
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = 70;
            rb.constraints = RigidbodyConstraints.FreezeRotation;
            rb.SetDamping(0.01f, 0.05f);
            rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
            var sb = go.AddComponent<SimBody>(); sb.sim = this; sb.isPlayer = true; sb.id = id;

            var usedColors = new HashSet<string>(players.Values.Select(q => q.outfit.color));
            var usedModels = new HashSet<string>(players.Values.Select(q => q.outfit.model));
            var o = outfit != null ? outfit.Clone() : new Outfit { color = null, hat = "none", model = null };
            if (o.color == null || usedColors.Contains(o.color)) o.color = K.OutfitColors.FirstOrDefault(c => !usedColors.Contains(c)) ?? K.OutfitColors[n % K.OutfitColors.Length];
            if (o.model == null || Array.IndexOf(K.Models, o.model) < 0 || usedModels.Contains(o.model)) o.model = K.Models.FirstOrDefault(m => !usedModels.Contains(m)) ?? "worker";
            if (Array.IndexOf(K.Hats, o.hat) < 0) o.hat = "none";

            var p = new Player
            {
                id = id, name = string.IsNullOrWhiteSpace(name) ? $"Worker {n + 1}" : Truncate(name.Trim(), 14),
                slot = n, outfit = o, body = rb, lastPos = new Vector2(sp.x, sp.z),
            };
            players[id] = p;
            var e = Emit("join"); e.id = id; e.s = p.name;
            return p;
        }

        public static string Truncate(string s, int n) => s.Length > n ? s.Substring(0, n) : s;

        public void RemovePlayer(int id)
        {
            if (!players.TryGetValue(id, out var p)) return;
            ReleaseHold(p);
            if (p.carriedBy != 0 && players.TryGetValue(p.carriedBy, out var h)) h.holding = null;
            UnityEngine.Object.Destroy(p.body.gameObject);
            players.Remove(id);
            var e = Emit("leave"); e.id = id; e.s = p.name;
        }

        public void SetInput(int pid, PlayerInput inp)
        {
            if (!players.TryGetValue(pid, out var p) || inp == null) return;
            p.input.mx = Mathf.Clamp(inp.mx, -1, 1);
            p.input.mz = Mathf.Clamp(inp.mz, -1, 1);
            p.input.b = inp.b;
            for (int i = 0; i < 4; i++) p.input.c[i] = inp.c[i];
        }

        bool Pressed(Player p, int k) => p.input.c[k] != p.lastC[k];
        public static Vector2 Fwd(Player p) => new Vector2(Mathf.Sin(p.yaw), Mathf.Cos(p.yaw));

        public void KnockDown(Player p, Vector3 dv, float dur = 1.4f, string why = "")
        {
            if (p.state == PState.Tube || p.state == PState.Gone || p.state == PState.Carried) return;
            ReleaseHold(p);
            if (p.state != PState.Down) p.stats.knockdowns++;
            p.state = PState.Down;
            p.downT = Mathf.Max(p.downT, dur);
            p.body.SetVel(p.body.Vel() + dv);
            var e = Emit("knock"); e.id = p.id; e.s = why; e.x = p.Pos.x; e.y = p.Pos.y; e.z = p.Pos.z;
        }

        public void Voice(Player p, string kind) { var e = Emit("voice"); e.id = p.id; e.s = kind; }

        bool GroundCheck(Player p) =>
            Physics.Raycast(p.Pos, Vector3.down, K.PlayerRadius + 0.18f, K.MaskGround, QueryTriggerInteraction.Ignore);

        void UpdatePlayer(Player p, float dt)
        {
            var b = p.body;
            var inp = p.input;
            p.shoveCd -= dt;
            if (p.state == PState.Gone) return;
            if (!p.connected) { inp.mx = 0; inp.mz = 0; inp.b = 0; }
            if (p.state == PState.Tube) return;

            if (p.state == PState.Carried)
            {
                if (Pressed(p, 0)) p.escape++;
                p.held += dt;
                if (p.escape >= 4 || p.held > 5)
                {
                    if (players.TryGetValue(p.carriedBy, out var h)) h.holding = null;
                    DropPlayer(p, new Vector3(0, 5, 0));
                    Voice(p, "escape");
                }
                return;
            }

            p.grounded = GroundCheck(p);
            if (p.state == PState.Down)
            {
                p.downT -= dt;
                if (p.grounded)
                {
                    var v = b.Vel(); float k = 1 - Mathf.Min(1, 4 * dt);
                    b.SetVel(new Vector3(v.x * k, v.y, v.z * k));
                }
                if (p.downT <= 0 && (p.grounded || p.downT < -2)) { p.state = PState.Ok; Emit("getup").id = p.id; }
                return;
            }

            float mx = inp.mx, mz = inp.mz;
            float len = Mathf.Sqrt(mx * mx + mz * mz);
            if (len > 1) { mx /= len; mz /= len; }
            float speed = (inp.b & Btn.Run) != 0 ? K.Run : K.Walk;
            float carryFactor = 1;
            if (p.holding != null && !p.holding.isPlayer && cargo.TryGetValue(p.holding.id, out var hc))
            {
                carryFactor = hc.def.Carry[Mathf.Min(hc.holders.Count, 3) - 1];
                if (carryFactor < 0.6f) speed = Mathf.Min(speed, K.Walk);
            }
            else if (p.holding != null && p.holding.isPlayer) carryFactor = 0.75f;

            float tx = mx * speed * carryFactor, tz = mz * speed * carryFactor;
            var env = plant.SurfaceVelocity(b.position.x, b.position.y - K.PlayerRadius, b.position.z, p.grounded);
            if (env.belt != null) { p.onBelt = env.belt; p.stats.beltTime += dt; } else p.onBelt = null;
            tx += env.vx; tz += env.vz;

            float accel = p.grounded ? K.Accel : K.AirAccel;
            var vel = b.Vel();
            float dvx = tx - vel.x, dvz = tz - vel.z;
            float dvl = Mathf.Sqrt(dvx * dvx + dvz * dvz);
            float maxDv = accel * dt;
            if (dvl > maxDv) { vel.x += dvx / dvl * maxDv; vel.z += dvz / dvl * maxDv; }
            else { vel.x = tx; vel.z = tz; }

            if (len > 0.15f)
            {
                float target = Mathf.Atan2(mx, mz);
                float d = Mathf.DeltaAngle(p.yaw * Mathf.Rad2Deg, target * Mathf.Rad2Deg) * Mathf.Deg2Rad;
                p.yaw += d * Mathf.Min(1, 14 * dt);
            }

            p.jumpT -= dt;
            if (Pressed(p, 0) && p.grounded && p.jumpT <= 0)
            {
                vel.y = K.Jump * (p.holding != null && !p.holding.isPlayer && carryFactor < 0.6f ? 0.55f : 1f);
                p.jumpT = 0.25f;
                p.stats.jumps++;
                Emit("jump").id = p.id;
            }
            b.SetVel(vel);

            if (Pressed(p, 1)) { if (p.holding != null) Drop(p); else TryGrab(p); }
            if (Pressed(p, 3)) { if (p.holding != null) ThrowHeld(p); else Shove(p); }
        }

        // ───────────────────────────── holding ─────────────────────────────
        public class GrabTarget { public bool isPlayer; public int id; public string name; }

        public GrabTarget FindGrabTarget(Player p)
        {
            var f = Fwd(p);
            var pp = p.Pos;
            GrabTarget best = null; float bestScore = float.MaxValue;
            foreach (var c in cargo.Values)
            {
                if (c.tube != null || c.shipping > 0 || c.holders.Count >= 3) continue;
                var cp = c.body.position;
                float dx = cp.x - pp.x, dz = cp.z - pp.z, dy = cp.y - pp.y;
                if (dy < -1.3f || dy > 1.9f) continue;
                float d = Mathf.Sqrt(dx * dx + dz * dz);
                float reach = K.Reach + c.radius * 0.6f + (c.holders.Count > 0 ? 0.6f : 0);
                if (d > reach) continue;
                float facing = d > 0.01f ? (dx * f.x + dz * f.y) / d : 1;
                if (facing < -0.3f) continue;
                float score = d - facing * 0.6f + (c.def.Toy ? 0.3f : 0);
                if (score < bestScore) { bestScore = score; best = new GrabTarget { id = c.id, name = c.def.Short }; }
            }
            foreach (var q in players.Values)
            {
                if (q == p || q.state == PState.Carried || q.state == PState.Tube || q.state == PState.Gone) continue;
                if (q.holding != null && q.holding.isPlayer && q.holding.id == p.id) continue;
                var qp = q.Pos;
                float dx = qp.x - pp.x, dz = qp.z - pp.z, dy = qp.y - pp.y;
                if (Mathf.Abs(dy) > 1.4f) continue;
                float d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d > K.Reach) continue;
                float facing = d > 0.01f ? (dx * f.x + dz * f.y) / d : 1;
                if (facing < 0.2f) continue;
                float score = d - facing * 0.6f + 0.5f;
                if (score < bestScore) { bestScore = score; best = new GrabTarget { isPlayer = true, id = q.id, name = q.name.ToUpperInvariant() }; }
            }
            return best;
        }

        void TryGrab(Player p)
        {
            var t = FindGrabTarget(p);
            if (t == null) return;
            if (!t.isPlayer)
            {
                var c = cargo[t.id];
                c.holders.Add(p.id);
                c.lastTouch = p.id;
                c.body.gameObject.layer = K.LHeld;
                p.holding = new Hold { id = c.id };
                var e = Emit("grab"); e.id = p.id; e.s = c.type; e.b = c.holders.Count > 1;
            }
            else
            {
                var q = players[t.id];
                if (q.holding != null) ReleaseHold(q);
                q.state = PState.Carried;
                q.carriedBy = p.id;
                q.escape = 0; q.held = 0;
                q.body.gameObject.layer = K.LHeld;
                p.holding = new Hold { isPlayer = true, id = q.id };
                var e = Emit("grab"); e.id = p.id; e.s = "player"; e.who = q.id;
                Voice(q, "yelp");
            }
        }

        public void ReleaseHold(Player p)
        {
            if (p.holding == null) return;
            if (!p.holding.isPlayer)
            {
                if (cargo.TryGetValue(p.holding.id, out var c)) { c.holders.Remove(p.id); if (c.holders.Count == 0) ResetCargoLayer(c); }
            }
            else if (players.TryGetValue(p.holding.id, out var q)) DropPlayer(q, Vector3.zero);
            p.holding = null;
        }

        public void ResetCargoLayer(CargoItem c) { c.body.gameObject.layer = K.LCargo; }

        void DropPlayer(Player q, Vector3 v, float dur = 0.6f)
        {
            q.carriedBy = 0;
            q.body.gameObject.layer = K.LPlayer;
            q.state = PState.Down;
            q.downT = dur;
            q.body.SetVel(v);
        }

        void Drop(Player p) { ReleaseHold(p); Emit("drop").id = p.id; }

        void ThrowHeld(Player p)
        {
            var h = p.holding;
            var f = Fwd(p);
            var pv = p.body.Vel();
            if (!h.isPlayer)
            {
                if (!cargo.TryGetValue(h.id, out var c)) { p.holding = null; return; }
                int n = c.holders.Count;
                float strength = Mathf.Clamp(n * 55f / (c.def.Mass + 12), 0.15f, 1.35f);
                float sp = K.ThrowSpeed * strength;
                foreach (var hid in c.holders.ToList())
                    if (players.TryGetValue(hid, out var hp)) { hp.holding = null; var e = Emit("throw"); e.id = hp.id; e.s = c.type; e.n = n; }
                c.holders.Clear();
                ResetCargoLayer(c);
                c.lastThrower = p.id;
                c.thrownT = 1.5f;
                c.body.SetVel(new Vector3(pv.x * 0.5f + f.x * sp, 3.2f + sp * 0.35f, pv.z * 0.5f + f.y * sp));
                c.body.angularVelocity = new Vector3((rnd.Next() - 0.5f) * 6, (rnd.Next() - 0.5f) * 6, (rnd.Next() - 0.5f) * 6);
            }
            else
            {
                p.holding = null;
                if (players.TryGetValue(h.id, out var q))
                {
                    DropPlayer(q, new Vector3(pv.x * 0.5f + f.x * 10.5f, 7.5f, pv.z * 0.5f + f.y * 10.5f), 1.6f);
                    q.thrownBy = p.id;
                    q.stats.timesThrown++;
                    p.stats.thrownMates++;
                    var e = Emit("throw"); e.id = p.id; e.s = "player"; e.who = q.id;
                    Voice(q, "wee");
                }
            }
        }

        void Shove(Player p)
        {
            if (p.shoveCd > 0) return;
            p.shoveCd = 0.7f;
            var f = Fwd(p);
            var pp = p.Pos;
            Emit("shove").id = p.id;
            foreach (var q in players.Values)
            {
                if (q == p || q.state != PState.Ok) continue;
                float dx = q.Pos.x - pp.x, dz = q.Pos.z - pp.z, d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d > 1.35f || (dx * f.x + dz * f.y) / Mathf.Max(d, 0.001f) < 0.3f) continue;
                KnockDown(q, new Vector3(f.x * K.ShoveImpulse, 3, f.y * K.ShoveImpulse), 0.75f, "shove");
                Voice(q, "oof");
            }
            foreach (var c in cargo.Values)
            {
                if (c.holders.Count > 0 || c.tube != null) continue;
                float dx = c.body.position.x - pp.x, dz = c.body.position.z - pp.z, d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d > 1.4f || (dx * f.x + dz * f.y) / Mathf.Max(d, 0.001f) < 0.3f) continue;
                float k = Mathf.Clamp(12 / (c.def.Mass + 4), 0.15f, 2.5f);
                c.body.SetVel(c.body.Vel() + new Vector3(f.x * 5 * k, 2 * k, f.y * 5 * k));
                c.lastTouch = p.id;
            }
        }

        Vector3 HoldPoint(Player p, float radius)
        {
            var f = Fwd(p);
            float reach = 0.55f + radius;
            return new Vector3(p.Pos.x + f.x * reach, p.Pos.y + 0.55f, p.Pos.z + f.y * reach);
        }

        void UpdateHeld(float dt)
        {
            foreach (var c in cargo.Values.ToList())
            {
                if (c.holders.Count == 0) continue;
                Vector3 t = Vector3.zero; int n = 0;
                foreach (var hid in c.holders.ToList())
                {
                    if (!players.TryGetValue(hid, out var hp) || hp.state != PState.Ok) { c.holders.Remove(hid); if (hp != null) hp.holding = null; continue; }
                    t += HoldPoint(hp, c.radius); n++;
                }
                if (n == 0) { ResetCargoLayer(c); continue; }
                t /= n;
                t.y += c.halfH * 0.35f + 0.15f;
                var b = c.body;
                bool dragging = c.def.Mass >= 40 && n == 1;
                const float kp = 160, kd = 22;
                var v = b.Vel();
                float ax = kp * (t.x - b.position.x) - kd * v.x;
                float az = kp * (t.z - b.position.z) - kd * v.z;
                float ay = dragging ? 0 : kp * (t.y - b.position.y) - kd * v.y + K.Gravity * c.def.GravityScale;
                float maxA = n * 2600f / c.def.Mass;
                float al = Mathf.Sqrt(ax * ax + ay * ay + az * az);
                float s = al > maxA ? maxA / al : 1;
                b.SetVel(v + new Vector3(ax, ay, az) * (s * dt));
                b.angularVelocity *= dragging ? 0.95f : 0.8f;
                if (!dragging)
                {
                    var hp = players[c.holders.First()];
                    b.rotation = Quaternion.Slerp(b.rotation, Quaternion.Euler(0, hp.yaw * Mathf.Rad2Deg, 0), 0.12f);
                }
                float err = new Vector2(t.x - b.position.x, t.z - b.position.z).magnitude;
                c.snagT = err > 2f ? c.snagT + dt : 0;
                if (c.snagT > 0.4f)
                {
                    foreach (var hid in c.holders.ToList()) if (players.TryGetValue(hid, out var hp)) hp.holding = null;
                    c.holders.Clear();
                    ResetCargoLayer(c);
                    Emit("drop");
                }
            }
            foreach (var q in players.Values.ToList())
            {
                if (q.state != PState.Carried) continue;
                if (!players.TryGetValue(q.carriedBy, out var h) || h.state != PState.Ok || h.holding == null || h.holding.id != q.id)
                {
                    if (h != null && h.holding != null && h.holding.id == q.id) h.holding = null;
                    DropPlayer(q, Vector3.zero);
                    continue;
                }
                var f = Fwd(h);
                var target = new Vector3(h.Pos.x + f.x * 0.7f, h.Pos.y + 1.05f, h.Pos.z + f.y * 0.7f);
                q.body.SetVel((target - q.Pos) * 18);
                q.yaw = h.yaw + Mathf.PI * 0.5f;
            }
        }

        // ───────────────────────────── cargo ─────────────────────────────
        public CargoItem SpawnCargo(string type, Vector3 pos, bool spin = false, Vector3? vel = null, bool ot = false)
        {
            var def = Cargo.Defs[type];
            int id = NewId();
            var go = new GameObject("cargo" + id + "-" + type);
            go.layer = K.LCargo;
            go.transform.SetParent(root, false);
            go.transform.position = pos;
            Collider col;
            if (def.Shape == Shape.Box) { var bc = go.AddComponent<BoxCollider>(); bc.size = def.Size; col = bc; }
            else if (def.Shape == Shape.Cyl)
            {
                // cylinders: a capsule that is barely rounded behaves like a drum but still rolls
                var cc = go.AddComponent<CapsuleCollider>(); cc.radius = def.Size.x; cc.height = Mathf.Max(def.Size.y, def.Size.x * 2); cc.direction = 1; col = cc;
            }
            else { var sc = go.AddComponent<SphereCollider>(); sc.radius = def.Size.x; col = sc; }
            Phys.SetMaterial(col, 0.45f, 0.12f);
            var rb = go.AddComponent<Rigidbody>();
            rb.mass = def.Mass;
            rb.SetDamping(type == "balloon" ? 0.35f : 0.04f, 0.12f);
            rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
            if (spin) rb.angularVelocity = new Vector3((rnd.Next() - 0.5f) * 3, (rnd.Next() - 0.5f) * 3, (rnd.Next() - 0.5f) * 3);
            if (vel.HasValue) rb.SetVel(vel.Value);
            var sb = go.AddComponent<SimBody>(); sb.sim = this; sb.id = id;
            string bay = def.Bay;
            if (type == "mystery") bay = new[] { "A", "B", "C" }[Mathf.Min(2, (int)(rnd.Next() * 3))];
            var c = new CargoItem
            {
                id = id, type = type, def = def, body = rb, col = col, bay = bay, radius = def.Radius, halfH = def.HalfH,
                scanned = type != "mystery", spawnT = time, ot = ot,
            };
            cargo[id] = c;
            return c;
        }

        public void RemoveCargo(CargoItem c)
        {
            foreach (var hid in c.holders) if (players.TryGetValue(hid, out var hp)) hp.holding = null;
            c.holders.Clear();
            if (c.body) UnityEngine.Object.Destroy(c.body.gameObject);
            cargo.Remove(c.id);
        }

        public void BreakCargo(CargoItem c, string why = "smash")
        {
            if (!cargo.ContainsKey(c.id)) return;
            int by = c.lastThrower != 0 && c.thrownT > 0 ? c.lastThrower : c.lastTouch;
            var e = Emit("break"); e.s = c.type; e.x = c.body.position.x; e.y = c.body.position.y; e.z = c.body.position.z; e.who = by; e.s2 = why;
            RemoveCargo(c);
            game.OnBroken(c, by);
        }

        void UpdateCargoBehaviour(float dt)
        {
            foreach (var c in cargo.Values.ToList())
            {
                if (c.tube != null) continue;
                c.thrownT -= dt;
                var b = c.body;
                if (c.type == "beans")
                {
                    if (c.heat > 0.35f)
                    {
                        c.hopT -= dt * c.heat;
                        if (c.hopT <= 0)
                        {
                            c.hopT = 0.6f + rnd.Next() * 0.8f;
                            float a = rnd.Next() * Mathf.PI * 2, s = 1.5f + c.heat * 2.5f;
                            b.SetVel(b.Vel() + new Vector3(Mathf.Cos(a) * s, 3 + c.heat * 3.5f, Mathf.Sin(a) * s));
                            b.angularVelocity = new Vector3((rnd.Next() - 0.5f) * 10, (rnd.Next() - 0.5f) * 4, (rnd.Next() - 0.5f) * 10);
                            Emit("hop").id = c.id;
                            foreach (var hid in c.holders.ToList())
                                if (players.TryGetValue(hid, out var hp) && rnd.Next() < 0.25f * c.heat)
                                { KnockDown(hp, new Vector3(Mathf.Cos(a) * 3, 3, Mathf.Sin(a) * 3), 0.6f, "beans"); Voice(hp, "hot"); }
                        }
                    }
                    c.heat = Mathf.Max(0, c.heat - dt / 28f);
                }
                if (c.type == "wobble")
                {
                    c.wobT -= dt * (c.holders.Count > 0 ? 1 : 0.5f);
                    if (c.holders.Count > 0 && c.wobT <= 0)
                    {
                        c.wobT = 1.1f + rnd.Next() * 1.2f;
                        float a = rnd.Next() * Mathf.PI * 2, s = 3.2f / Mathf.Max(1, c.holders.Count);
                        foreach (var hid in c.holders.ToList())
                        {
                            if (!players.TryGetValue(hid, out var hp)) continue;
                            hp.body.SetVel(hp.body.Vel() + new Vector3(Mathf.Cos(a) * s * 1.6f, 0, Mathf.Sin(a) * s * 1.6f));
                            if (c.holders.Count == 1 && rnd.Next() < 0.18f) KnockDown(hp, new Vector3(Mathf.Cos(a) * 3, 2, Mathf.Sin(a) * 3), 0.7f, "wobble");
                        }
                        b.SetVel(b.Vel() + new Vector3(Mathf.Cos(a) * s, 0, Mathf.Sin(a) * s));
                        Emit("slosh").id = c.id;
                    }
                    else if (c.holders.Count == 0 && c.wobT <= 0)
                    {
                        c.wobT = 2 + rnd.Next() * 3;
                        if (b.Vel().magnitude < 0.5f)
                        {
                            b.angularVelocity += new Vector3(0, (rnd.Next() - 0.5f) * 6, 0);
                            b.SetVel(b.Vel() + new Vector3((rnd.Next() - 0.5f) * 2, 0, (rnd.Next() - 0.5f) * 2));
                            Emit("slosh").id = c.id;
                        }
                    }
                }
                if (b.position.y < -6 || Mathf.Abs(b.position.x) > 200) { game.OnLost(c); RemoveCargo(c); }
            }
        }

        // ───────────────────────────── collisions ─────────────────────────────
        public void QueueCollision(SimBody a, Collision c)
        {
            var other = c.collider ? c.collider.GetComponentInParent<SimBody>() : null;
            float impact = c.relativeVelocity.magnitude;
            if (c.contactCount > 0) impact = Mathf.Abs(Vector3.Dot(c.relativeVelocity, c.GetContact(0).normal));
            collisions.Add(new Hit { a = a, b = other, impact = impact, vel = a.GetComponent<Rigidbody>() ? a.GetComponent<Rigidbody>().Vel() : Vector3.zero });
        }

        void ProcessCollisions()
        {
            var seen = new HashSet<long>();
            foreach (var h in collisions)
            {
                if (!h.a) continue;
                int ida = h.a.id, idb = h.b ? h.b.id : -1;
                long key = ((long)Mathf.Min(ida, idb) << 32) ^ (uint)Mathf.Max(ida, idb);
                if (!seen.Add(key)) continue;
                if (!h.a.isPlayer)
                {
                    if (!cargo.TryGetValue(ida, out var c)) continue;
                    if (h.impact > 2.2f) { var e = Emit("thud"); e.s = c.type; e.v = Mathf.Min(h.impact, 12); e.x = c.body.position.x; e.y = c.body.position.y; e.z = c.body.position.z; }
                    if (c.def.Fragile > 0 && h.impact > c.def.Fragile && time - c.spawnT > 1.2f) { BreakCargo(c); continue; }
                    if (h.b && h.b.isPlayer && players.TryGetValue(idb, out var p) && p.state == PState.Ok && !c.holders.Contains(p.id) && h.impact > K.RagdollHit && c.def.Mass > 2.5f)
                    {
                        KnockDown(p, new Vector3(h.vel.x * 0.5f, 4, h.vel.z * 0.5f), 1.2f, "cargo");
                        Voice(p, "oof");
                    }
                }
                else if (h.b && h.b.isPlayer)
                {
                    if (players.TryGetValue(ida, out var p) && players.TryGetValue(idb, out var q) && p.state == PState.Down && q.state == PState.Ok && h.impact > 6)
                    {
                        KnockDown(q, new Vector3(h.vel.x * 0.4f, 3, h.vel.z * 0.4f), 1.0f, "bowled");
                        Voice(q, "oof");
                    }
                }
            }
            collisions.Clear();
        }

        // ───────────────────────────── prompts & controls ─────────────────────────────
        void UpdatePrompts()
        {
            foreach (var p in players.Values)
            {
                if (p.state != PState.Ok) { p.prompt = null; continue; }
                var pr = new Prompt();
                if (p.holding != null)
                {
                    pr.g = "DROP";
                    if (!p.holding.isPlayer && cargo.TryGetValue(p.holding.id, out var c)) pr.t = c.holders.Count > 1 ? "HEAVE!" : c.def.Mass >= 40 ? "SHOVE" : "THROW";
                    else pr.t = "YEET";
                }
                else
                {
                    var t = FindGrabTarget(p);
                    if (t != null) pr.g = !t.isPlayer ? (cargo[t.id].holders.Count > 0 ? $"HELP CARRY {t.name}" : $"GRAB {t.name}") : $"PICK UP {t.name}";
                }
                var ctl = FindControl(p, out string label);
                if (ctl != null) { pr.u = label; pr.k = ctl.kind; if (ctl.kind == "hold") pr.p = ctl.progress; pr.cid = ctl.id; }
                p.prompt = pr.g != null || pr.u != null ? pr : null;
            }
        }

        public Control AddControl(Control c) { c.progress = 0; controls.Add(c); controlById[c.id] = c; return c; }

        public Control FindControl(Player p, out string bestLabel)
        {
            var pp = p.Pos; var f = Fwd(p);
            Control best = null; bestLabel = null; float bestScore = float.MaxValue;
            foreach (var c in controls)
            {
                float dx = c.pos.x - pp.x, dz = c.pos.z - pp.z, dy = c.pos.y - pp.y;
                if (dy > 2.0f || dy < -1.6f) continue;
                float d = Mathf.Sqrt(dx * dx + dz * dz);
                if (d > K.Reach + c.r) continue;
                string label = c.label(p);
                if (label == null) continue;
                float facing = d > 0.01f ? (dx * f.x + dz * f.y) / d : 1;
                float score = d - facing * 0.5f - c.priority;
                if (score < bestScore) { bestScore = score; best = c; bestLabel = label; }
            }
            return best;
        }

        void UpdateControls(float dt)
        {
            var holders = new Dictionary<Control, List<Player>>();
            foreach (var p in players.Values)
            {
                if (p.state != PState.Ok) { p.usingId = null; continue; }
                bool useHeld = (p.input.b & Btn.Use) != 0, usePressed = Pressed(p, 2);
                if (!useHeld && !usePressed) { p.usingId = null; continue; }
                var c = FindControl(p, out _);
                if (c == null) { p.usingId = null; continue; }
                if (c.kind == "press")
                {
                    if (usePressed)
                    {
                        c.act(p);
                        p.usingId = c.id; p.anim = 0.35f;
                        var e = Emit("click"); e.s = c.id; e.id = p.id; e.s2 = c.snd;
                    }
                }
                else if (useHeld)
                {
                    p.usingId = c.id;
                    if (!holders.TryGetValue(c, out var list)) holders[c] = list = new List<Player>();
                    list.Add(p);
                    if (usePressed) { var e = Emit("click"); e.s = c.id; e.id = p.id; e.s2 = c.snd; }
                }
            }
            foreach (var c in controls)
            {
                if (c.kind == "press") continue;
                holders.TryGetValue(c, out var hs);
                if (c.kind == "stream") { if (hs != null) c.onHold(hs, dt); c.active = hs != null; continue; }
                if (hs != null)
                {
                    int n = hs.Count;
                    float rate = c.twoHand ? (n == 1 ? 0.45f : 1 + 0.5f * (n - 2)) : 1 + 0.75f * (n - 1);
                    c.progress += dt * rate / c.holdTime;
                    c.active = true;
                    if (c.progress >= 1)
                    {
                        c.progress = 0;
                        c.complete(hs);
                        foreach (var p in hs) p.usingId = null;
                        var e = Emit("fixed"); e.s = c.id; e.n = n;
                    }
                }
                else { c.active = false; c.progress = Mathf.Max(0, c.progress - dt * 0.6f); }
            }
        }

        // ───────────────────────────── main step ─────────────────────────────
        public void Step(float dt)
        {
            time += dt;
            tick++;
            game.PreStep(dt);
            foreach (var p in players.Values.ToList()) UpdatePlayer(p, dt);
            UpdateControls(dt);
            UpdateHeld(dt);
            plant.Update(dt);
            UpdateCargoBehaviour(dt);
            Physics.Simulate(dt);
            ProcessCollisions();
            foreach (var p in players.Values)
            {
                for (int i = 0; i < 4; i++) p.lastC[i] = p.input.c[i];
                p.anim = Mathf.Max(0, p.anim - dt);
                var pos = p.Pos;
                float d = Vector2.Distance(new Vector2(pos.x, pos.z), p.lastPos);
                if (d < 2) p.stats.distance += d;
                p.lastPos = new Vector2(pos.x, pos.z);
                var v = p.body.Vel();
                p.speed = new Vector2(v.x, v.z).magnitude;
                if (pos.y < -5 && p.state != PState.Tube) RespawnPlayer(p, null);
            }
            if (tick % 3 == 0) UpdatePrompts();
        }

        public void RespawnPlayer(Player p, Vector3? where)
        {
            ReleaseHold(p);
            var sp = where ?? Level.Spawns[p.slot % Level.Spawns.Length];
            p.body.position = sp;
            p.body.transform.position = sp;
            p.body.SetVel(Vector3.zero);
            if (p.state != PState.Gone) p.state = PState.Ok;
        }
    }
}
