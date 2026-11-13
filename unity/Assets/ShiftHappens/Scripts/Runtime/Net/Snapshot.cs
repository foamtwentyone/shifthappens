// Binary snapshot + message codec. The host serialises the sim 20×/s; every client
// (including the host's own view) renders from decoded snapshots.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace ShiftHappens
{
    public class SnapCargo { public int id; public string type, bay; public Vector3 pos; public Quaternion rot; public float heat, ship; public byte flags; }

    public class SnapPlayer
    {
        public int id, slot, holdId, hk;
        public string name; public Outfit outfit;
        public Vector3 pos; public float vy, yaw, speed, anim;
        public PState state; public bool grounded, usingCtl, ready, connected, belt;
        public Prompt prompt;
    }

    public class SnapIncident { public int id; public string kind, target, text; public float t, dur; }

    public class SnapPlant
    {
        public bool[] pw = new bool[3]; public bool main; public float[] es = new float[3]; public float P;
        public Dictionary<string, (int dir, bool jam, float speed)> belts = new Dictionary<string, (int, bool, float)>();
        public string sorterMode; public bool sorterFault; public float sorterSpin;
        public bool dispAuto, dispCd; public float[] doors = new float[3]; public string airState; public float lift;
        public bool fan, fanOn, magOn, tube; public int mag; public float heatPad, burst;
        public List<string> overheat = new List<string>();
        public List<SnapIncident> inc = new List<SnapIncident>();
        public Dictionary<string, float> ctl = new Dictionary<string, float>();
        public Dictionary<string, float> zoneGravity = new Dictionary<string, float>();
    }

    public class SnapGame
    {
        public string phase, contractName, contractClient, result;
        public float countdown, timeLeft, shiftT, mult;
        public int money, ledger, shifts, tier, overtime, sel, rep, queue;
        public bool otDone, quotaMet, ring, dark;
        public List<OrderLine> order = new List<OrderLine>(), otOrder = new List<OrderLine>();
        public List<Contract> contracts; // only in the lobby
        public Dictionary<string, bool> riders = new Dictionary<string, bool>();
    }

    public class Snapshot
    {
        public int tick; public float time;
        public List<SnapCargo> ents = new List<SnapCargo>();
        public List<SnapPlayer> pl = new List<SnapPlayer>();
        public SnapPlant plant = new SnapPlant();
        public SnapGame game = new SnapGame();
        public List<SimEvent> ev = new List<SimEvent>();
    }

    public static class Msg
    {
        public const byte Hello = 1, Input = 2, AddLocal = 3, RemoveLocal = 4, OutfitMsg = 5, NameMsg = 6;
        public const byte Welcome = 10, Local = 11, Snap = 12, Error = 13;
    }

    public static class Codec
    {
        static void Str(BinaryWriter w, string s) => w.Write(s ?? "");
        static void V3(BinaryWriter w, Vector3 v) { w.Write(v.x); w.Write(v.y); w.Write(v.z); }
        static Vector3 V3(BinaryReader r) => new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
        static void WOutfit(BinaryWriter w, Outfit o) { Str(w, o.color); Str(w, o.hat); Str(w, o.model); }
        static Outfit ROutfit(BinaryReader r) => new Outfit { color = r.ReadString(), hat = r.ReadString(), model = r.ReadString() };
        static void WLines(BinaryWriter w, List<OrderLine> l) { w.Write((byte)l.Count); foreach (var o in l) { Str(w, o.type); w.Write((short)o.need); w.Write((short)o.done); } }
        static List<OrderLine> RLines(BinaryReader r) { int n = r.ReadByte(); var l = new List<OrderLine>(n); for (int i = 0; i < n; i++) l.Add(new OrderLine { type = r.ReadString(), need = r.ReadInt16(), done = r.ReadInt16() }); return l; }

        public static byte[] EncodeSnapshot(Sim sim, List<SimEvent> events)
        {
            using var ms = new MemoryStream(4096);
            using var w = new BinaryWriter(ms);
            w.Write(Msg.Snap);
            w.Write(sim.tick); w.Write(sim.time);
            w.Write((short)sim.cargo.Count);
            foreach (var c in sim.cargo.Values)
            {
                w.Write(c.id); w.Write((byte)Cargo.Index(c.type));
                V3(w, c.body.position);
                var q = c.body.rotation; w.Write(q.x); w.Write(q.y); w.Write(q.z); w.Write(q.w);
                Str(w, c.scanned ? c.bay : "?");
                w.Write((byte)Mathf.RoundToInt(Mathf.Clamp01(c.heat) * 255));
                w.Write((byte)((c.holders.Count > 0 ? 1 : 0) | (c.tube != null ? 2 : 0) | (c.ot ? 4 : 0)));
                w.Write(c.shipping);
            }
            w.Write((byte)sim.players.Count);
            foreach (var p in sim.players.Values)
            {
                w.Write(p.id); Str(w, p.name); WOutfit(w, p.outfit); w.Write((byte)p.slot);
                V3(w, p.Pos); w.Write(p.body.Vel().y); w.Write(p.yaw); w.Write((byte)p.state); w.Write(p.speed);
                w.Write((byte)((p.grounded ? 1 : 0) | (p.usingId != null ? 2 : 0) | (p.ready ? 4 : 0) | (p.connected ? 8 : 0) | (p.onBelt != null ? 16 : 0) | (p.prompt != null ? 32 : 0)));
                w.Write(p.holding != null ? p.holding.id : 0); w.Write((byte)(p.holding == null ? 0 : p.holding.isPlayer ? 2 : 1));
                w.Write(p.anim);
                if (p.prompt != null) { Str(w, p.prompt.g); Str(w, p.prompt.u); Str(w, p.prompt.t); Str(w, p.prompt.k); Str(w, p.prompt.cid); w.Write(p.prompt.p); }
            }
            var pl = sim.plant;
            foreach (var z in new[] { "intake", "sorting", "dock" }) { w.Write(pl.power[z]); w.Write(pl.estop[z]); }
            w.Write(pl.main); w.Write(pl.pressure);
            foreach (var b in Level.Belts) { var s = pl.belts[b.Id]; w.Write((sbyte)s.dir); w.Write(s.jam); w.Write(s.speed); }
            Str(w, pl.sorterMode); w.Write(pl.sorterFault); w.Write(pl.sorterSpin);
            w.Write(pl.dispAuto); w.Write(pl.dispCd > 0);
            foreach (var k in Level.DoorOrder) w.Write(pl.doors[k].open);
            Str(w, pl.airState); w.Write(pl.liftY);
            w.Write(pl.FanActive); w.Write(pl.fanOn); w.Write((sbyte)(pl.MagnetActive ? pl.magnetPol : 0)); w.Write(pl.magnetOn); w.Write(pl.TubeActive);
            w.Write(pl.heatPadActive ? 1f : pl.Powered("sorting") ? 0.5f : 0f); w.Write(pl.burstT);
            w.Write((byte)pl.overheat.Count); foreach (var m in pl.overheat) Str(w, m);
            w.Write((byte)pl.incidents.Count);
            foreach (var i in pl.incidents) { w.Write(i.id); Str(w, i.kind); Str(w, i.target); Str(w, i.text); w.Write(i.t); w.Write(i.dur); }
            var ctls = sim.controls.Where(c => (c.kind == "hold" && c.progress > 0.01f) || (c.kind == "stream" && c.active)).ToList();
            w.Write((byte)ctls.Count); foreach (var c in ctls) { Str(w, c.id); w.Write(c.kind == "stream" ? 1f : c.progress); }
            w.Write((byte)sim.zoneGravity.Count); foreach (var kv in sim.zoneGravity) { Str(w, kv.Key); w.Write(kv.Value); }

            var g = sim.game;
            bool lobby = g.phase == "lobby" || g.phase == "countdown";
            Str(w, g.phase); w.Write(g.countdown); w.Write(g.timeLeft); w.Write(g.shiftT);
            w.Write(g.money); w.Write(g.ledger); w.Write(g.shifts); w.Write(g.Tier);
            WLines(w, g.order); w.Write((byte)g.overtime); w.Write(g.otDone); WLines(w, g.otOrder);
            w.Write(g.quotaMet); w.Write(g.ringT > 0);
            Str(w, g.contract?.name); Str(w, g.contract?.client);
            w.Write(lobby);
            if (lobby)
            {
                w.Write((byte)g.contracts.Count);
                foreach (var c in g.contracts) { Str(w, c.name); Str(w, c.client); Str(w, c.blurb); WLines(w, c.lines); w.Write(c.time); w.Write(c.bonus); w.Write((byte)c.hazard); }
            }
            w.Write((byte)g.selected);
            foreach (var r in Riders.All) w.Write(g.riders[r.Id]);
            w.Write(g.Multiplier()); w.Write(g.reportSeq); Str(w, g.result);
            w.Write(g.riders["dark"] && !lobby); w.Write(g.queue.Count);

            w.Write((short)events.Count);
            foreach (var e in events)
            {
                Str(w, e.type); w.Write(e.id); w.Write(e.who); w.Write(e.n); w.Write(e.x); w.Write(e.y); w.Write(e.z); w.Write(e.v); Str(w, e.s); Str(w, e.s2); w.Write(e.b);
            }
            w.Flush();
            return ms.ToArray();
        }

        public static Snapshot DecodeSnapshot(byte[] data)
        {
            using var ms = new MemoryStream(data);
            using var r = new BinaryReader(ms);
            r.ReadByte();
            var s = new Snapshot { tick = r.ReadInt32(), time = r.ReadSingle() };
            int nc = r.ReadInt16();
            for (int i = 0; i < nc; i++)
            {
                var c = new SnapCargo { id = r.ReadInt32() };
                int ti = r.ReadByte(); c.type = ti < Cargo.TypeIndex.Length ? Cargo.TypeIndex[ti] : "crate";
                c.pos = V3(r); c.rot = new Quaternion(r.ReadSingle(), r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                c.bay = r.ReadString(); c.heat = r.ReadByte() / 255f; c.flags = r.ReadByte(); c.ship = r.ReadSingle();
                s.ents.Add(c);
            }
            int np = r.ReadByte();
            for (int i = 0; i < np; i++)
            {
                var p = new SnapPlayer { id = r.ReadInt32(), name = r.ReadString(), outfit = ROutfit(r), slot = r.ReadByte() };
                p.pos = V3(r); p.vy = r.ReadSingle(); p.yaw = r.ReadSingle(); p.state = (PState)r.ReadByte(); p.speed = r.ReadSingle();
                int f = r.ReadByte();
                p.grounded = (f & 1) != 0; p.usingCtl = (f & 2) != 0; p.ready = (f & 4) != 0; p.connected = (f & 8) != 0; p.belt = (f & 16) != 0;
                p.holdId = r.ReadInt32(); p.hk = r.ReadByte(); p.anim = r.ReadSingle();
                if ((f & 32) != 0)
                {
                    p.prompt = new Prompt { g = Null(r.ReadString()), u = Null(r.ReadString()), t = Null(r.ReadString()), k = Null(r.ReadString()), cid = Null(r.ReadString()), p = r.ReadSingle() };
                }
                s.pl.Add(p);
            }
            var pl = s.plant;
            for (int i = 0; i < 3; i++) { pl.pw[i] = r.ReadBoolean(); pl.es[i] = r.ReadSingle(); }
            pl.main = r.ReadBoolean(); pl.P = r.ReadSingle();
            foreach (var b in Level.Belts) pl.belts[b.Id] = (r.ReadSByte(), r.ReadBoolean(), r.ReadSingle());
            pl.sorterMode = r.ReadString(); pl.sorterFault = r.ReadBoolean(); pl.sorterSpin = r.ReadSingle();
            pl.dispAuto = r.ReadBoolean(); pl.dispCd = r.ReadBoolean();
            for (int i = 0; i < 3; i++) pl.doors[i] = r.ReadSingle();
            pl.airState = r.ReadString(); pl.lift = r.ReadSingle();
            pl.fan = r.ReadBoolean(); pl.fanOn = r.ReadBoolean(); pl.mag = r.ReadSByte(); pl.magOn = r.ReadBoolean(); pl.tube = r.ReadBoolean();
            pl.heatPad = r.ReadSingle(); pl.burst = r.ReadSingle();
            int no = r.ReadByte(); for (int i = 0; i < no; i++) pl.overheat.Add(r.ReadString());
            int ni = r.ReadByte();
            for (int i = 0; i < ni; i++) pl.inc.Add(new SnapIncident { id = r.ReadInt32(), kind = r.ReadString(), target = r.ReadString(), text = r.ReadString(), t = r.ReadSingle(), dur = r.ReadSingle() });
            int nctl = r.ReadByte(); for (int i = 0; i < nctl; i++) pl.ctl[r.ReadString()] = r.ReadSingle();
            int nz = r.ReadByte(); for (int i = 0; i < nz; i++) pl.zoneGravity[r.ReadString()] = r.ReadSingle();

            var g = s.game;
            g.phase = r.ReadString(); g.countdown = r.ReadSingle(); g.timeLeft = r.ReadSingle(); g.shiftT = r.ReadSingle();
            g.money = r.ReadInt32(); g.ledger = r.ReadInt32(); g.shifts = r.ReadInt32(); g.tier = r.ReadInt32();
            g.order = RLines(r); g.overtime = r.ReadByte(); g.otDone = r.ReadBoolean(); g.otOrder = RLines(r);
            g.quotaMet = r.ReadBoolean(); g.ring = r.ReadBoolean();
            g.contractName = Null(r.ReadString()); g.contractClient = Null(r.ReadString());
            if (r.ReadBoolean())
            {
                int n = r.ReadByte();
                g.contracts = new List<Contract>(n);
                for (int i = 0; i < n; i++)
                    g.contracts.Add(new Contract { name = r.ReadString(), client = r.ReadString(), blurb = r.ReadString(), lines = RLines(r), time = r.ReadInt32(), bonus = r.ReadInt32(), hazard = r.ReadByte() });
            }
            g.sel = r.ReadByte();
            foreach (var rd in Riders.All) g.riders[rd.Id] = r.ReadBoolean();
            g.mult = r.ReadSingle(); g.rep = r.ReadInt32(); g.result = Null(r.ReadString());
            g.dark = r.ReadBoolean(); g.queue = r.ReadInt32();

            int ne = r.ReadInt16();
            for (int i = 0; i < ne; i++)
            {
                var e = new SimEvent(r.ReadString()) { id = r.ReadInt32(), who = r.ReadInt32(), n = r.ReadInt32(), x = r.ReadSingle(), y = r.ReadSingle(), z = r.ReadSingle(), v = r.ReadSingle(), s = r.ReadString(), s2 = r.ReadString(), b = r.ReadBoolean() };
                s.ev.Add(e);
            }
            return s;
        }

        static string Null(string s) => string.IsNullOrEmpty(s) ? null : s;

        // ───────── small client→host / host→client messages ─────────
        public static byte[] Hello(string name, Outfit o, string token)
        { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.Hello); Str(w, name); WOutfit(w, o); Str(w, token); return ms.ToArray(); }

        public static byte[] Input(int pid, PlayerInput i)
        {
            using var ms = new MemoryStream(); using var w = new BinaryWriter(ms);
            w.Write(Msg.Input); w.Write(pid); w.Write(i.mx); w.Write(i.mz); w.Write((byte)i.b);
            for (int k = 0; k < 4; k++) w.Write((ushort)(i.c[k] & 0xffff));
            return ms.ToArray();
        }

        public static byte[] AddLocal(string name, Outfit o) { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.AddLocal); Str(w, name); WOutfit(w, o); return ms.ToArray(); }
        public static byte[] RemoveLocal(int pid) { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.RemoveLocal); w.Write(pid); return ms.ToArray(); }
        public static byte[] SetOutfit(int pid, Outfit o) { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.OutfitMsg); w.Write(pid); WOutfit(w, o); return ms.ToArray(); }
        public static byte[] SetName(int pid, string n) { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.NameMsg); w.Write(pid); Str(w, n); return ms.ToArray(); }
        public static byte[] Welcome(int pid, string token, string code) { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.Welcome); w.Write(pid); Str(w, token); Str(w, code); return ms.ToArray(); }
        public static byte[] LocalAdded(int pid) { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.Local); w.Write(pid); return ms.ToArray(); }
        public static byte[] Error(string msg) { using var ms = new MemoryStream(); using var w = new BinaryWriter(ms); w.Write(Msg.Error); Str(w, msg); return ms.ToArray(); }

        public static BinaryReader Reader(byte[] data) => new BinaryReader(new MemoryStream(data));
        public static Outfit ReadOutfit(BinaryReader r) => ROutfit(r);
    }
}
