// PLANT 7 machinery and incidents. Port of shared/sim/plant.js.
// Every machine reads/writes shared plant state, which is what makes failures cascade.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ShiftHappens
{
    public class Incident { public int id; public string kind, target, zone = "all", text, cause; public float t, dur; }
    public class BeltState { public int dir = 1; public bool jam; public float crowdT, speed; public int count; }
    public class DoorState { public float open, target; }

    public class Plant
    {
        const float BeltSpeed = 2.3f;
        static readonly Dictionary<string, string> MachineNames = new Dictionary<string, string>
        { ["dispenser"] = "DISPENSER", ["sorter"] = "SORTER", ["tube"] = "PNEUMATIC TUBE", ["fan"] = "UPDRAFT FAN", ["lift"] = "LIFT" };
        public static readonly Dictionary<string, Vector3> MachineSpot = new Dictionary<string, Vector3>
        {
            ["dispenser"] = new Vector3(-26.4f, 1.2f, 2.4f), ["sorter"] = Level.Spots["sorter_body"], ["tube"] = new Vector3(-3.3f, 1.1f, -7.6f),
            ["fan"] = new Vector3(23.4f, 1.1f, -2.2f), ["lift"] = new Vector3(15.4f, 1.1f, -7.0f),
        };
        static readonly Dictionary<string, Vector3> BeltService = new Dictionary<string, Vector3>
        { ["A"] = new Vector3(-21, 1, 1.25f), ["B"] = new Vector3(1.2f, 1, 1.25f), ["C"] = new Vector3(-3.9f, 1, -3.6f) };

        static string IncidentText(string kind, string t) => kind switch
        {
            "jam" => $"BELT {t} JAMMED",
            "reverse" => $"BELT {t} RUNNING BACKWARDS",
            "blackout" => "BLACKOUT — RESET MAIN BREAKER",
            "sorter" => "SORTER HAS LOST ITS MIND",
            "overheat" => $"{MachineNames[t]} OVERHEATING",
            "flux" => $"GRAVITY FLUX: {t.ToUpperInvariant()}",
            "breach" => "AIRLOCK BREACH — BOTH DOORS OPEN",
            "ducks" => "DUCK DELIVERY?! NOBODY ORDERED DUCKS",
            "surge" => "POWER SURGE — BOILER SPIKING",
            "flip" => "MAGNET POLARITY FLIPPED",
            _ => kind.ToUpperInvariant(),
        };

        readonly Sim sim;
        public Dictionary<string, bool> power;
        public bool main;
        public Dictionary<string, float> estop;
        public float pressure, critT, burstT;
        public Dictionary<string, BeltState> belts;
        public string sorterMode; public bool sorterFault; public float sorterSpin;
        public bool dispAuto; public float dispCd, dispAutoT, floodT; public int flood;
        public string airState; public string airPending; public bool breach; public float airManual;
        public Dictionary<string, DoorState> doors = new Dictionary<string, DoorState>();
        public float liftY, liftTarget;
        public bool fanOn, magnetOn; public int magnetPol;
        public HashSet<string> overheat;
        public List<Incident> incidents;
        public float nextIncident; int incSeq;
        public bool heatPadActive;
        public int lastBreakerBy;

        readonly Dictionary<string, Rigidbody> doorBodies = new Dictionary<string, Rigidbody>();
        Rigidbody liftBody;

        public Plant(Sim sim)
        {
            this.sim = sim;
            foreach (var k in Level.DoorOrder) doors[k] = new DoorState();
            Reset();
            doors["inner"].open = 1;
            BuildBodies();
            BuildControls();
        }

        public void Reset()
        {
            power = new Dictionary<string, bool> { ["intake"] = true, ["sorting"] = true, ["dock"] = true };
            main = true;
            estop = new Dictionary<string, float> { ["intake"] = 0, ["sorting"] = 0, ["dock"] = 0 };
            pressure = 30; critT = 0; burstT = 0;
            belts = new Dictionary<string, BeltState>();
            foreach (var b in Level.Belts) belts[b.Id] = new BeltState();
            sorterMode = "auto"; sorterFault = false;
            dispAuto = false; dispCd = 0; dispAutoT = 2; flood = 0; floodT = 0;
            airState = "inner"; airPending = null; breach = false; airManual = 0;
            doors["inner"].target = 1; doors["outer"].target = 0;
            liftY = Level.Lift.low; liftTarget = Level.Lift.low;
            fanOn = true; magnetOn = false; magnetPol = 1;
            overheat = new HashSet<string>();
            incidents = new List<Incident>();
            nextIncident = 30; incSeq = 1;
            heatPadActive = false;
            if (sim.controls != null) foreach (var c in sim.controls) c.progress = 0;
            sim.zoneGravity.Clear();
        }

        // ───────────────────────────── bodies ─────────────────────────────
        void BuildBodies()
        {
            foreach (var b in Level.Belts)
                sim.StaticBox(new Vector3((b.X0 + b.X1) / 2, b.Top / 2, (b.Z0 + b.Z1) / 2), new Vector3(b.X1 - b.X0, b.Top, b.Z1 - b.Z0), 0, true);
            sim.StaticBox(new Vector3(Level.Sorter.x, Level.Sorter.y / 2, Level.Sorter.z), new Vector3(Level.SorterSize, Level.Sorter.y, Level.SorterSize), 0, true);
            sim.StaticBox(new Vector3(Level.Scanner.x, 1.2f, -1.15f), new Vector3(0.3f, 2.4f, 0.3f));
            sim.StaticBox(new Vector3(Level.Scanner.x, 1.2f, 1.15f), new Vector3(0.3f, 2.4f, 0.3f));
            sim.StaticBox(new Vector3(Level.TubeMouth.x, 0.3f, Level.TubeMouth.z), new Vector3(1.5f, 0.6f, 1.5f));
            sim.StaticBox(new Vector3(Level.Incinerator.x, 0.35f, Level.Incinerator.z), new Vector3(2, 0.7f, 2));
            sim.StaticBox(new Vector3(Level.Boiler.x, 1.6f, Level.Boiler.z), new Vector3(3, 3.2f, 3));
            sim.StaticBox(new Vector3(Level.Dispenser.x - 1.6f, 1.8f, -1.2f), new Vector3(0.3f, 3.6f, 0.3f));
            sim.StaticBox(new Vector3(Level.Fan.x, 0.15f, Level.Fan.z), new Vector3(1.8f, 0.3f, 1.8f));
            sim.StaticBox(new Vector3(Level.HeatPad.x, 0.12f, Level.HeatPad.z), new Vector3(1.8f, 0.24f, 1.8f));
            foreach (var kv in Level.Doors)
            {
                var d = kv.Value;
                doorBodies[kv.Key] = sim.KinematicBox(new Vector3(d.X, d.H / 2, (d.Z0 + d.Z1) / 2), new Vector3(0.4f, d.H, d.Z1 - d.Z0));
            }
            var L = Level.Lift;
            liftBody = sim.KinematicBox(new Vector3((L.x0 + L.x1) / 2, L.low - 0.1f, (L.z0 + L.z1) / 2), new Vector3(L.x1 - L.x0, 0.3f, L.z1 - L.z0));
        }

        // ───────────────────────────── helpers ─────────────────────────────
        public bool Powered(string zone) => main && power[zone] && estop[zone] <= 0;
        public float Pm => 0.55f + 0.009f * pressure;
        public bool MachineOk(string m) => !overheat.Contains(m);
        bool HasIncident(string kind, string target = null) => incidents.Any(i => i.kind == kind && (target == null || i.target == target));
        public bool FanActive => fanOn && Powered("dock") && MachineOk("fan");
        public bool MagnetActive => magnetOn && Powered("dock");
        public bool TubeActive => Powered("sorting") && MachineOk("tube");

        Vector2 BeltVel(Belt b) => b.Dir * belts[b.Id].speed;

        public static Belt? OnBelt(float x, float foot, float z)
        {
            foreach (var b in Level.Belts)
                if (x >= b.X0 && x <= b.X1 && z >= b.Z0 - 0.05f && z <= b.Z1 + 0.05f && foot > b.Top - 0.3f && foot < b.Top + 0.45f) return b;
            return null;
        }

        static bool OnSorter(float x, float foot, float z)
        {
            float h = Level.SorterSize / 2;
            return Mathf.Abs(x - Level.Sorter.x) <= h && Mathf.Abs(z - Level.Sorter.z) <= h && foot > Level.Sorter.y - 0.3f && foot < Level.Sorter.y + 0.45f;
        }

        public Vector2? WindAt(float x, float y, float z)
        {
            float k = Mathf.Min(doors["inner"].open, doors["outer"].open);
            if (k < 0.4f || Mathf.Abs(z) > 5.5f || x < -11 || x > 17 || y > 4) return null;
            float s = (k - 0.3f) * 1.4f;
            if (x < 4)
            {
                float dx = 4.5f - x, dz = -z, l = Mathf.Max(0.001f, Mathf.Sqrt(dx * dx + dz * dz));
                float fall = Mathf.Clamp(1 - (4 - x) / 15f, 0.25f, 1);
                return new Vector2(dx / l * 6.5f * s * fall, dz / l * 6.5f * s * fall);
            }
            return new Vector2(7 * s, -z * 0.15f * s);
        }

        public struct Env { public float vx, vz; public string belt; }

        public Env SurfaceVelocity(float x, float foot, float z, bool grounded)
        {
            var e = new Env();
            if (grounded)
            {
                var b = OnBelt(x, foot, z);
                if (b.HasValue) { var v = BeltVel(b.Value); e.vx = v.x; e.vz = v.y; e.belt = b.Value.Id; }
                else if (OnSorter(x, foot, z) && Powered("sorting") && MachineOk("sorter")) { e.vx = 1.2f * Pm; e.belt = "S"; }
            }
            var w = WindAt(x, foot + 0.5f, z);
            if (w.HasValue) { e.vx += w.Value.x * 0.85f; e.vz += w.Value.y * 0.85f; }
            if (new Vector2(x - Level.Fan.x, z - Level.Fan.z).magnitude < Level.FanR + 0.3f && foot > 2 && FanActive) e.vz -= 3.2f;
            return e;
        }

        // ───────────────────────────── controls ─────────────────────────────
        Control Ctl(string id, Vector3 pos, string kind, Func<Player, string> label, string snd = "button")
        {
            return sim.AddControl(new Control { id = id, pos = pos, kind = kind, label = label, snd = snd });
        }

        void BuildControls()
        {
            var S = Level.Spots;
            bool InShift() => sim.game != null && sim.game.phase == "shift";
            var c = Ctl("disp_request", S["disp_request"], "press", p => !MachineOk("dispenser") ? null : Powered("intake") ? "REQUEST CARGO" : "REQUEST CARGO (NO POWER)", "bigbutton");
            c.act = p => Dispense();
            c = Ctl("disp_auto", S["disp_auto"], "press", p => $"AUTO-FEED: {(dispAuto ? "ON" : "OFF")}", "lever");
            c.act = p => { dispAuto = !dispAuto; dispAutoT = 1; };
            foreach (var id in new[] { "A", "B" })
            {
                string bid = id;
                c = Ctl($"belt_{bid.ToLowerInvariant()}_lever", S[$"belt_{bid.ToLowerInvariant()}_lever"], "press", p => $"BELT {bid}: {(belts[bid].dir > 0 ? "FORWARD" : "REVERSE")}", "lever");
                c.act = p =>
                {
                    belts[bid].dir *= -1;
                    var inc = incidents.FirstOrDefault(i => i.kind == "reverse" && i.target == bid);
                    if (inc != null && belts[bid].dir > 0) Resolve(inc, new List<Player> { p });
                };
            }
            foreach (var id in new[] { "A", "B", "C" })
            {
                string bid = id;
                c = Ctl($"jam_{bid}", BeltService[bid], "hold", p => belts[bid].jam ? $"UNJAM BELT {bid}" : null, "wrench");
                c.holdTime = 2.2f; c.priority = 0.4f;
                c.complete = hs => { belts[bid].jam = false; belts[bid].crowdT = -4; var inc = incidents.FirstOrDefault(i => i.kind == "jam" && i.target == bid); if (inc != null) Resolve(inc, hs); };
            }
            foreach (var z in new[] { "intake", "sorting", "dock" })
            {
                string zone = z;
                c = Ctl($"estop_{zone}", S[$"estop_{zone}"], "press", p => InShift() ? "EMERGENCY STOP" : null, "estop");
                c.act = p => EmergencyStop(zone, p);
            }
            c = Ctl("sorter_lever", S["sorter_lever"], "press", p => "SORTER: " + (sorterMode == "auto" ? "AUTO" : sorterMode == "B" ? "ALL → BELT B" : "ALL → TUBE"), "lever");
            c.act = p => sorterMode = sorterMode == "auto" ? "B" : sorterMode == "B" ? "C" : "auto";
            c = Ctl("sorter_fix", S["sorter_body"], "hold", p => sorterFault ? "WHACK THE SORTER" : null, "wrench");
            c.holdTime = 2.4f; c.priority = 0.6f;
            c.complete = hs => { sorterFault = false; var inc = incidents.FirstOrDefault(i => i.kind == "sorter"); if (inc != null) Resolve(inc, hs); };
            foreach (var kv in MachineSpot)
            {
                string m = kv.Key;
                c = Ctl($"cool_{m}", kv.Value, "hold", p => overheat.Contains(m) ? $"COOL DOWN {MachineNames[m]}" : null, "spray");
                c.holdTime = 2.6f; c.priority = 0.7f; c.r = 0.6f;
                c.complete = hs => { overheat.Remove(m); var inc = incidents.FirstOrDefault(i => i.kind == "overheat" && i.target == m); if (inc != null) Resolve(inc, hs); };
            }
            foreach (var side in new[] { "air_in", "air_out" })
            {
                c = Ctl(side, S[side], "press", p => breach || !Powered("dock") ? null : airPending != null ? "AIRLOCK CYCLING…" : $"CYCLE AIRLOCK → {(airState == "inner" ? "DOCK SIDE" : "HALL SIDE")}", "bigbutton");
                c.act = p => CycleAirlock(false);
                c = Ctl(side + "_crank", S[side], "hold", p => breach ? "SEAL THE AIRLOCK" : !Powered("dock") ? "HAND-CRANK AIRLOCK" : null, "wrench");
                c.holdTime = 2.6f;
                c.complete = hs =>
                {
                    if (breach)
                    {
                        breach = false; doors["outer"].target = 0; doors["inner"].target = 1; airState = "inner"; airManual = 4;
                        var inc = incidents.FirstOrDefault(i => i.kind == "breach"); if (inc != null) Resolve(inc, hs);
                    }
                    else { airManual = 6; CycleAirlock(true); }
                };
            }
            foreach (var z in new[] { "intake", "sorting", "dock" })
            {
                string zone = z;
                c = Ctl($"brk_{zone}", S[$"brk_{zone}"], "press", p => $"{zone.ToUpperInvariant()} POWER: {(power[zone] ? "ON" : "OFF")}", "breaker");
                c.act = p => { power[zone] = !power[zone]; lastBreakerBy = p.id; };
            }
            c = Ctl("brk_main", S["brk_main"], "hold", p => main ? null : "RESET MAIN BREAKER (2 HANDS BETTER)", "breaker");
            c.holdTime = 2.2f; c.twoHand = true; c.priority = 0.5f;
            c.complete = hs => { main = true; var inc = incidents.FirstOrDefault(i => i.kind == "blackout"); if (inc != null) Resolve(inc, hs); sim.Emit("power").b = true; };
            c = Ctl("valve", S["valve"], "stream", p => "VENT BOILER (HOLD)", "valve");
            c.r = 0.6f;
            c.onHold = (hs, dt) => { pressure = Mathf.Max(5, pressure - (9 + 7 * (hs.Count - 1)) * dt); foreach (var p in hs) p.stats.valveTime += dt; };
            Func<Player, string> liftLabel = p => !MachineOk("lift") ? null : Powered("dock") ? $"LIFT {(liftTarget > 1 ? "DOWN" : "UP")}" : "LIFT (NO POWER)";
            c = Ctl("lift_low", S["lift_btn"], "press", liftLabel); c.act = p => ToggleLift();
            c = Ctl("lift_high", S["lift_high"], "press", liftLabel); c.act = p => ToggleLift();
            c = Ctl("fan_switch", S["fan_switch"], "press", p => $"UPDRAFT FAN: {(fanOn ? "ON" : "OFF")}", "lever"); c.act = p => fanOn = !fanOn;
            c = Ctl("magnet_lever", S["magnet_lever"], "press", p => $"MAGNET: {(magnetOn ? "ON" : "OFF")}", "lever"); c.act = p => magnetOn = !magnetOn;
        }

        // ───────────────────────────── actions ─────────────────────────────
        void Dispense()
        {
            if (!Powered("intake") || !MachineOk("dispenser")) { sim.Emit("denied").s = "disp"; return; }
            if (dispCd > 0) return;
            var type = sim.game.NextFromQueue();
            if (type == null) { sim.Emit("denied").s = "empty"; return; }
            SpawnFromDispenser(type, null);
            dispCd = 1.1f;
        }

        public CargoItem SpawnFromDispenser(string type, bool? ot)
        {
            var c = sim.SpawnCargo(type, new Vector3(Level.Dispenser.x + (sim.rnd.Next() - 0.5f) * 0.3f, 3.4f, Level.Dispenser.z + (sim.rnd.Next() - 0.5f) * 0.3f), true, null, ot ?? sim.game.overtime > 0);
            sim.Emit("dispense").s = type;
            return c;
        }

        void CycleAirlock(bool force)
        {
            if (breach || airPending != null) return;
            if (!force && !Powered("dock")) return;
            if (airState == "inner") { doors["inner"].target = 0; airPending = "outer"; }
            else { doors["outer"].target = 0; airPending = "inner"; }
            sim.Emit("airlock");
        }

        void ToggleLift()
        {
            if (!Powered("dock") || !MachineOk("lift")) { sim.Emit("denied").s = "lift"; return; }
            liftTarget = liftTarget > 1 ? Level.Lift.low : Level.Lift.high;
        }

        void EmergencyStop(string zone, Player p)
        {
            estop[zone] = 4;
            sim.Emit("estop").s = zone;
            p.stats.estops++;
            sim.game.Penalty(K.PenEstop, "Emergency stop", p.id);
            foreach (var inc in incidents.ToList())
            {
                if (inc.zone != zone) continue;
                switch (inc.kind)
                {
                    case "jam": belts[inc.target].jam = false; belts[inc.target].crowdT = -5; break;
                    case "reverse": belts[inc.target].dir = 1; break;
                    case "sorter": sorterFault = false; break;
                    case "overheat": overheat.Remove(inc.target); break;
                    case "flip": magnetPol = 1; break;
                    case "breach": breach = false; doors["outer"].target = 0; doors["inner"].target = 1; airState = "inner"; airManual = 4; break;
                    default: continue;
                }
                Resolve(inc, null);
            }
        }

        // ───────────────────────────── incidents ─────────────────────────────
        public Incident Start(string kind, string target, string cause = "random")
        {
            if (HasIncident(kind, target)) return null;
            var inc = new Incident { id = incSeq++, kind = kind, target = target, cause = cause, text = IncidentText(kind, target) };
            switch (kind)
            {
                case "jam": belts[target].jam = true; inc.zone = target == "A" ? "intake" : target == "B" ? "dock" : "sorting"; break;
                case "reverse": belts[target].dir = -1; inc.zone = target == "A" ? "intake" : "dock"; break;
                case "blackout": main = false; sim.Emit("power").b = false; break;
                case "sorter": sorterFault = true; inc.zone = "sorting"; break;
                case "overheat": overheat.Add(target); inc.zone = target == "dispenser" ? "intake" : target == "sorter" || target == "tube" ? "sorting" : "dock"; break;
                case "flux": sim.zoneGravity[target] = 0.22f; inc.dur = 14; inc.zone = target; break;
                case "breach": breach = true; airPending = null; airManual = 3; doors["inner"].target = 1; doors["outer"].target = 1; inc.zone = "dock"; break;
                case "ducks": flood = 7; inc.dur = 3; break;
                case "surge": pressure = Mathf.Min(99, pressure + 28); inc.dur = 2.5f; break;
                case "flip": magnetPol = -1; inc.dur = 14; inc.zone = "dock"; break;
            }
            incidents.Add(inc);
            sim.game.OnIncident(inc);
            var e = sim.Emit("incident"); e.s = kind; e.s2 = inc.text;
            return inc;
        }

        public void Resolve(Incident inc, List<Player> by)
        {
            if (!incidents.Remove(inc)) return;
            if (inc.kind == "flux") sim.zoneGravity.Remove(inc.target);
            if (inc.kind == "flip") magnetPol = 1;
            if (by != null) foreach (var p in by) p.stats.fixes++;
            var e = sim.Emit("resolved"); e.s = inc.kind; e.s2 = by != null ? string.Join(",", by.Select(p => p.id)) : "";
        }

        void RandomIncident()
        {
            var r = sim.rnd;
            var options = new (string kind, Func<string> target, float w)[]
            {
                ("jam", () => r.Pick(new[] { "A", "B", "C" }), 3), ("reverse", () => r.Pick(new[] { "A", "B" }), 3), ("sorter", () => null, 2),
                ("overheat", () => r.Pick(MachineSpot.Keys.ToList()), 2.5f), ("flux", () => r.Pick(new[] { "intake", "sorting", "dock" }), 2),
                ("breach", () => null, 1.5f), ("ducks", () => null, 1.5f), ("surge", () => null, 1.5f), ("flip", () => null, 1), ("blackout", () => null, 0.7f),
            };
            var valid = new List<(string, string, float)>();
            float total = 0;
            foreach (var o in options)
            {
                var t = o.target();
                if (HasIncident(o.kind, t)) continue;
                if (o.kind == "overheat" && overheat.Contains(t)) continue;
                if (o.kind == "flux" && sim.zoneGravity.Count > 0) continue;
                valid.Add((o.kind, t, o.w)); total += o.w;
            }
            float x = r.Next() * total;
            foreach (var v in valid) { x -= v.Item3; if (x <= 0) { Start(v.Item1, v.Item2); return; } }
        }

        // ───────────────────────────── update ─────────────────────────────
        public void Update(float dt)
        {
            var game = sim.game;
            bool shift = game.phase == "shift";
            foreach (var z in estop.Keys.ToList()) estop[z] = Mathf.Max(0, estop[z] - dt);

            if (shift)
            {
                int zones = main ? power.Values.Count(v => v) : 0;
                float warm = Mathf.Clamp01((game.shiftT - 15) / 20f);
                pressure += (0.16f + 0.26f * zones) * game.PressureRate() * warm * dt;
                if (pressure > 85)
                {
                    float before = critT; critT += dt;
                    if ((int)(critT * 2) != (int)(before * 2) && (int)(critT * 2) % 4 == 0) sim.Emit("alarm").s = "pressure";
                }
                else critT = 0;
                if (critT > 9 && overheat.Count == 0) { critT = 2; Start("overheat", sim.rnd.Pick(MachineSpot.Keys.ToList()), "pressure"); }
                if (pressure >= 100) Burst();
            }
            burstT = Mathf.Max(0, burstT - dt);
            float pm = Pm;

            foreach (var b in Level.Belts)
            {
                var s = belts[b.Id];
                bool on = Powered(b.Zone) && !s.jam;
                float target = on ? BeltSpeed * pm * s.dir : 0;
                s.speed += (target - s.speed) * Mathf.Min(1, dt * 4);
                s.count = 0;
            }

            bool scannerOn = Powered("sorting"), sorterOn = Powered("sorting") && MachineOk("sorter");
            bool fanOnNow = FanActive, magOn = MagnetActive, tubeOn = TubeActive, padOn = Powered("sorting");
            heatPadActive = false;
            var cores = new List<CargoItem>();
            foreach (var c in sim.cargo.Values.ToList())
            {
                if (c.tube != null) { AdvanceTube(c, null, dt); continue; }
                if (c.shipping > 0) { AdvanceShipping(c, dt); continue; }
                var body = c.body;
                var p = body.position;
                var v = body.Vel();
                float foot = p.y - c.halfH;
                var def = c.def;
                bool held = c.holders.Count > 0;
                float gs = def.GravityScale;
                if (gs != 1) v.y += (1 - gs) * K.Gravity * dt;
                if (sim.zoneGravity.TryGetValue(Level.ZoneAt(p.x, p.z), out var zg)) v.y += (1 - zg) * K.Gravity * gs * dt;

                if (!held)
                {
                    var belt = OnBelt(p.x, foot, p.z);
                    c.onBelt = belt?.Id;
                    if (belt.HasValue)
                    {
                        var bb = belt.Value;
                        var s = belts[bb.Id];
                        s.count++;
                        var bv = BeltVel(bb);
                        float k = Mathf.Min(1, dt * 7);
                        v.x += (bv.x - v.x) * k; v.z += (bv.y - v.z) * k;
                        var av = body.angularVelocity; av.x *= 0.9f; av.z *= 0.9f; body.angularVelocity = av;
                        if (bb.Dir.x != 0) v.z += ((bb.Z0 + bb.Z1) / 2 - p.z) * dt * 6; else v.x += ((bb.X0 + bb.X1) / 2 - p.x) * dt * 6;
                        if (s.jam && sim.rnd.Next() < dt * 3) { v.y += 2.5f; v.x += (sim.rnd.Next() - 0.5f) * 2; body.angularVelocity += new Vector3(0, (sim.rnd.Next() - 0.5f) * 4, 0); }
                        if (bb.Id == "A" && Mathf.Abs(p.x - Level.Scanner.x) < 0.5f && !c.scanned && scannerOn)
                        {
                            c.scanned = true;
                            var e = sim.Emit("scan"); e.id = c.id; e.s = c.bay;
                        }
                    }
                    else if (OnSorter(p.x, foot, p.z))
                    {
                        if (c.route == null)
                        {
                            if (sorterFault) c.route = sim.rnd.Next() < 0.5f ? "B" : "C";
                            else if (sorterMode != "auto") c.route = sorterMode;
                            else c.route = c.scanned && c.bay == "C" ? "C" : "B";
                            if (sorterOn)
                            {
                                var e = sim.Emit("sort"); e.id = c.id; e.s = c.route;
                                if (sorterFault && sim.rnd.Next() < 0.45f)
                                {
                                    v = new Vector3((sim.rnd.Next() - 0.5f) * 8, 9 + sim.rnd.Next() * 3, 2 + sim.rnd.Next() * 4);
                                    sim.Emit("fling").id = c.id;
                                }
                            }
                        }
                        if (sorterOn)
                        {
                            float sp = 2.0f * pm, k = Mathf.Min(1, dt * 7);
                            if (c.route == "B") { v.x += (sp - v.x) * k; v.z += ((Level.Sorter.z - p.z) * 3 - v.z) * k; }
                            else { v.z += (-sp - v.z) * k; v.x += ((Level.Sorter.x - p.x) * 3 - v.x) * k; }
                            body.angularVelocity *= 0.85f;
                            sorterSpin += dt * 4;
                        }
                    }
                    else c.route = null;

                    if (tubeOn && new Vector2(p.x - Level.TubeMouth.x, p.z - Level.TubeMouth.z).magnitude < Level.TubeMouthR && p.y < 2.4f)
                    { body.SetVel(v); EnterTube(c, null); continue; }
                    if (new Vector2(p.x - Level.Incinerator.x, p.z - Level.Incinerator.z).magnitude < Level.IncineratorR && foot > 0.55f && foot < 1.6f)
                    {
                        var e = sim.Emit("burn"); e.s = c.type; e.x = p.x; e.z = p.z;
                        sim.RemoveCargo(c);
                        sim.game.OnIncinerated(c);
                        continue;
                    }
                    body.SetVel(v);
                    CheckPads(c, dt);
                    v = body.Vel();
                    if (c.shipping > 0 || !sim.cargo.ContainsKey(c.id)) continue;
                }

                if (fanOnNow && new Vector2(p.x - Level.Fan.x, p.z - Level.Fan.z).magnitude < Level.FanR && p.y < 5.5f)
                {
                    float f = def.Lift, fall = p.y < 3.4f ? 1 : Mathf.Max(0, 1 - (p.y - 3.4f) / 1.6f);
                    v.y += f * 17 * pm * fall * dt;
                    if (v.y > 7) v.y = 7;
                    if (p.y > 2.3f) v.z -= 7 * dt * Mathf.Min(f + 0.3f, 1.2f);
                }
                var w = WindAt(p.x, p.y, p.z);
                if (w.HasValue && !held)
                {
                    float f = def.Wind * 1.6f;
                    v.x += (w.Value.x - v.x) * Mathf.Min(1, f * dt);
                    v.z += (w.Value.y - v.z) * Mathf.Min(1, f * dt * 0.5f);
                }
                if (c.type == "beans")
                {
                    if (padOn && new Vector2(p.x - Level.HeatPad.x, p.z - Level.HeatPad.z).magnitude < Level.HeatPadR && p.y < 1.9f) { c.heat = Mathf.Min(1, c.heat + dt * 0.24f); heatPadActive = true; }
                    foreach (var m in overheat) { var sp = MachineSpot[m]; if (new Vector2(p.x - sp.x, p.z - sp.z).magnitude < 3.2f) c.heat = Mathf.Min(1, c.heat + dt * 0.15f); }
                }
                if (def.Magnetic) cores.Add(c);
                if ((def.Magnetic || c.type == "crate") && magOn)
                {
                    var d3 = Level.Magnet - p;
                    float d = d3.magnitude;
                    if (d < Level.MagnetR && d > 0.01f)
                    {
                        int pol = magnetPol;
                        float f = (def.Magnetic ? 1 : 0.1f) * pol;
                        if (pol > 0 && d < 0.75f && def.Magnetic) { v *= 0.6f; v += d3 * 8 * dt + new Vector3(0, 18 * dt, 0); }
                        else { float a = (36 * (1 - d / Level.MagnetR) + 8) * f; v += d3 / d * a * dt + new Vector3(0, pol > 0 && def.Magnetic ? 12 * dt : 0, 0); }
                    }
                }
                body.SetVel(v);
            }
            foreach (var a in cores)
            {
                if (a.holders.Count > 0) continue;
                foreach (var b in sim.cargo.Values)
                {
                    if (b == a || (b.type != "magnet" && b.type != "crate") || b.tube != null) continue;
                    var d3 = b.body.position - a.body.position;
                    float d = d3.magnitude;
                    if (d < 0.3f || d > 2.4f) continue;
                    float s = (b.type == "magnet" ? (magnetPol > 0 ? 6 : -14) : 4) * (1 - d / 2.4f);
                    a.body.SetVel(a.body.Vel() + d3 / d * s * dt);
                }
            }
            if (shift)
            {
                foreach (var b in Level.Belts)
                {
                    var s = belts[b.Id];
                    if (s.count >= 7 && !s.jam && Mathf.Abs(s.speed) > 0.2f) { s.crowdT += dt; if (s.crowdT > 2.5f) { s.crowdT = 0; Start("jam", b.Id, "overload"); } }
                    else if (s.crowdT > 0) s.crowdT = Mathf.Max(0, s.crowdT - dt);
                    else s.crowdT = Mathf.Min(0, s.crowdT + dt);
                }
            }

            foreach (var p in sim.players.Values.ToList())
            {
                if (p.state == PState.Tube) { AdvanceTube(null, p, dt); continue; }
                if (p.state == PState.Carried || p.state == PState.Gone) continue;
                var b = p.body; var pos = b.position; var v = b.Vel();
                if (sim.zoneGravity.TryGetValue(Level.ZoneAt(pos.x, pos.z), out var zg)) v.y += (1 - zg) * K.Gravity * dt;
                if (fanOnNow && new Vector2(pos.x - Level.Fan.x, pos.z - Level.Fan.z).magnitude < Level.FanR && pos.y < 5.5f)
                {
                    float fall = pos.y < 3.4f ? 1 : Mathf.Max(0, 1 - (pos.y - 3.4f) / 1.6f);
                    v.y = Mathf.Min(5, v.y + 18.6f * pm * fall * dt);
                }
                b.SetVel(v);
                if (tubeOn && new Vector2(pos.x - Level.TubeMouth.x, pos.z - Level.TubeMouth.z).magnitude < Level.TubeMouthR * 0.8f && pos.y < 2 && pos.y > 0.7f) { EnterTube(null, p); continue; }
                if (new Vector2(pos.x - Level.Incinerator.x, pos.z - Level.Incinerator.z).magnitude < Level.IncineratorR && pos.y - K.PlayerRadius > 0.55f && pos.y < 2)
                {
                    sim.KnockDown(p, new Vector3(0, 11, 6), 1.8f, "burn");
                    p.stats.burnt++;
                    var e = sim.Emit("burn"); e.s = "player"; e.id = p.id; e.x = pos.x; e.z = pos.z;
                    sim.Voice(p, "hot");
                }
            }

            dispCd -= dt;
            if (shift && dispAuto && Powered("intake") && MachineOk("dispenser"))
            {
                dispAutoT -= dt;
                if (dispAutoT <= 0) { dispAutoT = 4.2f / pm; var t = game.NextFromQueue(); if (t != null) SpawnFromDispenser(t, null); }
            }
            if (flood > 0) { floodT -= dt; if (floodT <= 0) { floodT = 0.35f; flood--; SpawnFromDispenser("duck", false); } }

            doors["lobby"].target = game.phase == "shift" || game.phase == "ending" ? 1 : 0;
            airManual = Mathf.Max(0, airManual - dt);
            float airMotor = Powered("dock") ? 0.85f : airManual > 0 ? 0.55f : 0;
            foreach (var k in Level.DoorOrder)
            {
                var s = doors[k];
                float speed = k == "lobby" ? 0.8f : airMotor;
                s.open += Mathf.Clamp(s.target - s.open, -speed * dt, speed * dt);
                var def = Level.Doors[k];
                float travel = def.Z1 - def.Z0 + 0.1f;
                doorBodies[k].MovePosition(new Vector3(def.X, def.H / 2, (def.Z0 + def.Z1) / 2 - s.open * travel));
            }
            if (airPending != null)
            {
                var closing = airPending == "outer" ? doors["inner"] : doors["outer"];
                if (closing.open <= 0.001f) { (airPending == "outer" ? doors["outer"] : doors["inner"]).target = 1; airState = airPending; airPending = null; }
            }

            bool liftOn = Powered("dock") && MachineOk("lift");
            if (liftOn) liftY += Mathf.Clamp(liftTarget - liftY, -1.5f * dt, 1.5f * dt);
            var L = Level.Lift;
            liftBody.MovePosition(new Vector3((L.x0 + L.x1) / 2, liftY - 0.1f, (L.z0 + L.z1) / 2));

            foreach (var inc in incidents.ToList())
            {
                inc.t += dt;
                if (inc.dur > 0 && inc.t >= inc.dur) Resolve(inc, null);
                else if (inc.kind == "reverse" && belts[inc.target].dir > 0) Resolve(inc, null);
                else if (inc.kind == "blackout" && main) Resolve(inc, null);
            }
            if (shift && game.shiftT > 22)
            {
                nextIncident -= dt * game.IncidentRate();
                if (nextIncident <= 0) { nextIncident = 26 + sim.rnd.Next() * 20; if (incidents.Count < 3) RandomIncident(); }
            }
        }

        void Burst()
        {
            pressure = 22; burstT = 3;
            var e = sim.Emit("burst"); e.x = Level.Boiler.x; e.z = Level.Boiler.z;
            foreach (var p in sim.players.Values.ToList())
            {
                var d3 = p.Pos - Level.Boiler; d3.y = 0;
                float d = d3.magnitude;
                if (d < 9) { float k = (1 - d / 9) * 14 + 4; var n = d3 / Mathf.Max(d, 0.01f); sim.KnockDown(p, new Vector3(n.x * k, 8, n.z * k), 2.0f, "burst"); sim.Voice(p, "yelp"); }
            }
            foreach (var c in sim.cargo.Values)
            {
                var d3 = c.body.position - Level.Boiler; d3.y = 0;
                float d = d3.magnitude;
                if (d < 9 && c.tube == null) { var n = d3 / Mathf.Max(d, 0.01f); c.body.SetVel(c.body.Vel() + new Vector3(n.x * 10, 7, n.z * 10)); }
            }
            sim.game.Penalty(K.PenBurst, "Boiler burst", lastBreakerBy);
            Start("blackout", null, "burst");
        }

        // ───────────────────────────── tube ─────────────────────────────
        void EnterTube(CargoItem c, Player p)
        {
            Rigidbody body = c != null ? c.body : p.body;
            if (c != null) { foreach (var hid in c.holders) if (sim.players.TryGetValue(hid, out var hp)) hp.holding = null; c.holders.Clear(); }
            if (p != null) { sim.ReleaseHold(p); p.state = PState.Tube; p.stats.tubeRides++; }
            var ts = new TubeState { s = 0, layer = body.gameObject.layer };
            if (c != null) c.tube = ts; else p.tube = ts;
            body.gameObject.layer = K.LGhost;
            body.isKinematic = true;
            var e = sim.Emit("tube"); e.id = c != null ? c.id : p.id; e.s = p != null ? "player" : c.type;
            if (p != null) sim.Voice(p, "wee");
        }

        void AdvanceTube(CargoItem c, Player p, float dt)
        {
            var ts = c != null ? c.tube : p.tube;
            var body = c != null ? c.body : p.body;
            float pm = Pm;
            ts.s += dt * 13 * pm;
            var pts = Level.TubePath;
            float s = ts.s;
            for (int i = 0; i < pts.Length - 1; i++)
            {
                float l = Vector3.Distance(pts[i], pts[i + 1]);
                if (s <= l) { body.MovePosition(Vector3.Lerp(pts[i], pts[i + 1], s / l)); return; }
                s -= l;
            }
            var end = pts[pts.Length - 1];
            body.isKinematic = false;
            body.position = end + Vector3.down * 0.3f;
            body.transform.position = body.position;
            body.SetVel(new Vector3(2.5f * pm, -2, (sim.rnd.Next() - 0.5f) * 1.5f));
            if (c != null) { sim.ResetCargoLayer(c); c.tube = null; }
            else { body.gameObject.layer = K.LPlayer; p.tube = null; p.state = PState.Down; p.downT = 0.9f; }
            sim.Emit("tubeout").id = c != null ? c.id : p.id;
            if (c != null && c.def.Fragile > 0 && pm > 1.17f) { c.spawnT = -10; sim.BreakCargo(c, "tube"); }
        }

        // ───────────────────────────── delivery pads ─────────────────────────────
        void CheckPads(CargoItem c, float dt)
        {
            var p = c.body.position;
            float foot = p.y - c.halfH;
            string pad = null;
            foreach (var kv in Level.Pads)
            {
                var pd = kv.Value; float h = pd.Size / 2;
                if (Mathf.Abs(p.x - pd.X) < h && Mathf.Abs(p.z - pd.Z) < h && foot > pd.Y - 0.3f && foot < pd.Y + 0.7f) { pad = kv.Key; break; }
            }
            if (pad == null || c.body.Vel().magnitude > 3.5f) { c.padT = Mathf.Min(c.padT, 0); if (pad == null) c.padT = Mathf.Min(0, c.padT + dt); return; }
            c.padT += dt;
            if (c.padT < 0.45f || sim.game.phase != "shift") return;
            var verdict = sim.game.Judge(c, pad);
            if (verdict == null)
            {
                c.shipping = 0.001f;
                c.shipPad = pad;
                c.body.gameObject.layer = K.LGhost;
                c.body.isKinematic = true;
                var e = sim.Emit("ship"); e.id = c.id; e.s = pad; e.s2 = c.type;
            }
            else
            {
                c.padT = -1.2f;
                var pd = Level.Pads[pad];
                float dx = p.x - pd.X; if (dx == 0) dx = 0.1f;
                float dz = p.z - pd.Z, l = Mathf.Max(0.01f, Mathf.Sqrt(dx * dx + dz * dz));
                c.body.SetVel(new Vector3(dx / l * 4 - 3, 6, dz / l * 4));
                var e = sim.Emit("reject"); e.id = c.id; e.s = pad; e.s2 = verdict; e.x = p.x; e.z = p.z;
                sim.game.OnRejected(c, verdict);
            }
        }

        void AdvanceShipping(CargoItem c, float dt)
        {
            var pd = Level.Pads[c.shipPad];
            c.shipping += dt / 0.8f;
            var b = c.body;
            var pos = b.position;
            pos.x += (pd.X - pos.x) * Mathf.Min(1, dt * 6);
            pos.z += (pd.Z - pos.z) * Mathf.Min(1, dt * 6);
            pos.y = pd.Y + c.halfH + 0.4f * Mathf.Sin(c.shipping * Mathf.PI) - c.shipping;
            b.MovePosition(pos);
            if (c.shipping >= 1) { sim.RemoveCargo(c); sim.game.OnDelivered(c, c.shipPad); }
        }
    }
}
