// Shift flow, contracts, money and the end-of-shift report. Port of shared/sim/game.js.
// Lobby → (everyone punches in) → countdown → shift → [quota → hotline: clock out | overtime] → ending → report → lobby
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ShiftHappens
{
    [Serializable] public class OrderLine { public string type; public int need, done; public OrderLine Clone() => (OrderLine)MemberwiseClone(); }

    [Serializable]
    public class Contract
    {
        public string key, name, client, blurb;
        public int tier, time, bonus, hazard;
        public List<OrderLine> lines = new List<OrderLine>();
    }

    [Serializable] public class LedgerLine { public string label; public int amount, n; }
    [Serializable] public class ReportPlayer { public int id; public string name; public Outfit outfit; public Stats stats; }
    [Serializable] public class Award { public string title, name, desc; public int pid; public Outfit outfit; }
    [Serializable] public class KindCount { public string k, name; public int n; }

    [Serializable]
    public class Report
    {
        public int id, duration, total, delivered, broken, misdelivered, incidents, overtime, ledgerBefore, ledgerAfter;
        public string contract, client, result;
        public float mult;
        public List<LedgerLine> lines = new List<LedgerLine>();
        public List<KindCount> incidentKinds = new List<KindCount>();
        public List<OrderLine> order = new List<OrderLine>();
        public List<string> riders = new List<string>();
        public List<ReportPlayer> players = new List<ReportPlayer>();
        public List<Award> awards = new List<Award>();
    }

    public class Game
    {
        static Contract T(string key, string name, string client, int tier, string blurb, int time, int bonus, params (string, int)[] lines) =>
            new Contract { key = key, name = name, client = client, tier = tier, blurb = blurb, time = time, bonus = bonus, lines = lines.Select(l => new OrderLine { type = l.Item1, need = l.Item2 }).ToList() };

        static readonly Contract[] Templates =
        {
            T("standard", "STANDARD HAUL", "Grumble & Sons Removals", 0, "Crates, drums, a couple of gnomes. A nice gentle Monday.", 330, 350, ("crate", 2), ("wobble", 1), ("gnome", 2), ("balloon", 2)),
            T("fragile", "FRAGILE FESTIVAL", "Garden Gnome Society", 0, "Gnomes, toasted beans and helium. Handle with extreme care.", 330, 420, ("gnome", 3), ("beans", 2), ("balloon", 2)),
            T("magnetic", "MAGNETIC MAYHEM", "Polar Opposites Ltd.", 0, "Cores, crates and mystery boxes. Things will stick together.", 360, 480, ("magnet", 3), ("crate", 2), ("mystery", 2)),
            T("hot", "HOT POTATO", "Spicy Bean Co-op", 1, "Lots of beans. All of them toasted. All of them jumping.", 330, 620, ("beans", 4), ("mystery", 2), ("wobble", 1)),
            T("bigone", "THE BIG ONE", "Mega-Corp Universal", 1, "One of everything. Twice. The whole plant will be screaming.", 480, 950, ("crate", 2), ("wobble", 1), ("gnome", 2), ("beans", 2), ("balloon", 2), ("magnet", 2), ("mystery", 2)),
            T("skyhigh", "SKY HIGH", "Cloud Nine Logistics", 2, "Everything goes to the Sky Dock. Mind the drop.", 360, 800, ("balloon", 4), ("magnet", 3), ("mystery", 2)),
        };

        static readonly Dictionary<string, string> KindNames = new Dictionary<string, string>
        {
            ["jam"] = "Belt jams", ["reverse"] = "Reversed belts", ["blackout"] = "Blackouts", ["sorter"] = "Sorter tantrums", ["overheat"] = "Overheats",
            ["flux"] = "Gravity fluxes", ["breach"] = "Airlock breaches", ["ducks"] = "Duck floods", ["surge"] = "Power surges", ["flip"] = "Magnet flips",
        };

        readonly Sim sim;
        public string phase = "lobby";
        public int ledger, shifts, selected, reportSeq;
        public Dictionary<string, bool> riders;
        public float countdown, endT;
        public Report lastReport;
        public List<Contract> contracts;

        public List<OrderLine> order = new List<OrderLine>(), otOrder = new List<OrderLine>();
        public List<string> queue = new List<string>();
        public float timeLeft, shiftT, ringT;
        struct Entry { public int amount; public string label; public int pid; }
        readonly List<Entry> entries = new List<Entry>();
        public int money, overtime, broken, delivered, misdelivered, incidentsCount, quotaBonusPaid;
        public bool otDone, quotaMet;
        public Dictionary<string, int> incidentKinds = new Dictionary<string, int>();
        public string result;
        public Contract contract;

        public Game(Sim sim)
        {
            this.sim = sim;
            ResetRiders();
            ResetShiftState();
            contracts = MakeContracts();
            BuildControls();
        }

        void ResetRiders() => riders = Riders.All.ToDictionary(r => r.Id, r => false);

        // A shift can end in the red: debt never locks the contract board.
        public int Tier => Mathf.Clamp(Mathf.FloorToInt(ledger / 1500f), 0, 3);

        List<Contract> MakeContracts()
        {
            int tier = Tier;
            var pool = Templates.Where(t => t.tier <= tier).ToList();
            var r = sim.rnd;
            var chosen = new List<Contract> { pool[Mathf.Min(Mathf.Min(3, pool.Count) - 1, (int)(r.Next() * Mathf.Min(3, pool.Count)))] };
            var rest = pool.Where(t => t != chosen[0]).ToList();
            r.Shuffle(rest);
            rest = rest.OrderByDescending(t => t.tier).ToList();
            while (chosen.Count < 3 && rest.Count > 0) { chosen.Add(rest[0]); rest.RemoveAt(0); }
            return chosen.Select(t => new Contract
            {
                key = t.key, name = t.name, client = t.client, blurb = t.blurb, tier = t.tier, time = t.time,
                bonus = Mathf.RoundToInt(t.bonus * (1 + tier * 0.25f)),
                lines = t.lines.Select(l => l.Clone()).ToList(),
                hazard = Mathf.Min(3, t.tier + (t.lines.Sum(l => l.need) > 9 ? 1 : 0)),
            }).ToList();
        }

        void ResetShiftState()
        {
            order = new List<OrderLine>(); otOrder = new List<OrderLine>(); queue = new List<string>();
            timeLeft = 0; shiftT = 0; entries.Clear(); money = 0; overtime = 0; otDone = false; quotaMet = false; quotaBonusPaid = 0;
            ringT = 0; incidentsCount = 0; incidentKinds.Clear(); broken = 0; delivered = 0; misdelivered = 0; result = null; contract = null;
        }

        public float Multiplier()
        {
            float m = 1;
            foreach (var r in Riders.All) if (riders[r.Id]) m += r.Mult;
            return Mathf.Round(m * 100) / 100f;
        }

        int PlayerCount() => Mathf.Max(1, sim.players.Values.Count(p => p.connected));

        public float IncidentRate()
        {
            float r = 1 + Tier * 0.15f;
            if (riders["cranky"]) r *= 2;
            if (overtime > 0) r *= 1 + 0.6f * overtime;
            if (PlayerCount() == 1) r *= 0.7f;
            return r;
        }

        public float PressureRate()
        {
            float r = 1;
            if (overtime > 0) r *= 1 + 0.2f * overtime;
            if (riders["cranky"]) r *= 1.15f;
            if (PlayerCount() == 1) r *= 0.8f;
            return r;
        }

        // ───────────────────────────── lobby controls ─────────────────────────────
        void BuildControls()
        {
            bool Lobby() => phase == "lobby" || phase == "countdown";
            var S = Level.Spots;
            for (int i = 0; i < 3; i++)
            {
                int ci = i;
                sim.AddControl(new Control
                {
                    id = $"contract{ci}", pos = S[$"contract{ci}"], kind = "press", snd = "paper",
                    label = p => Lobby() && ci < contracts.Count ? (selected == ci ? $"✓ {contracts[ci].name}" : $"PICK: {contracts[ci].name}") : null,
                    act = p => { selected = ci; CancelCountdown(); sim.Emit("select").n = ci; },
                });
            }
            foreach (var rd in Riders.All)
            {
                var r = rd;
                sim.AddControl(new Control
                {
                    id = $"rider_{r.Id}", pos = S[$"rider_{r.Id}"], kind = "press", snd = "lever",
                    label = p => Lobby() ? $"{r.Name}: {(riders[r.Id] ? "SIGNED" : "NOT SIGNED")}" : null,
                    act = p => { riders[r.Id] = !riders[r.Id]; CancelCountdown(); var e = sim.Emit("rider"); e.s = r.Id; e.b = riders[r.Id]; },
                });
            }
            string Cycle(string[] arr, string v) => arr[(Array.IndexOf(arr, v) + 1) % arr.Length];
            sim.AddControl(new Control { id = "locker_color", pos = S["locker_color"], kind = "press", snd = "locker", label = p => "NEW TEAM COLOUR", act = p => p.outfit.color = Cycle(K.OutfitColors, p.outfit.color) });
            sim.AddControl(new Control { id = "locker_hat", pos = S["locker_hat"], kind = "press", snd = "locker", label = p => "SWAP HAT", act = p => p.outfit.hat = Cycle(K.Hats, p.outfit.hat) });
            sim.AddControl(new Control { id = "locker_model", pos = S["locker_model"], kind = "press", snd = "locker", label = p => "MIRROR: NEW LOOK", act = p => p.outfit.model = Cycle(K.Models, p.outfit.model) });
            sim.AddControl(new Control
            {
                id = "punch", pos = S["punch"], kind = "press", snd = "punch",
                label = p => Lobby() ? (p.ready ? "PUNCH OUT (NOT READY)" : "PUNCH IN (READY)") : null,
                act = p => { p.ready = !p.ready; var e = sim.Emit("punch"); e.id = p.id; e.b = p.ready; if (!p.ready) CancelCountdown(); },
            });
            sim.AddControl(new Control
            {
                id = "vending", pos = S["vending"], kind = "press", snd = "vend", label = p => "FIZZ SODA ($1)",
                act = p =>
                {
                    var sodas = sim.cargo.Values.Where(c => c.type == "soda").ToList();
                    if (sodas.Count > 6) sim.RemoveCargo(sodas[0]);
                    sim.SpawnCargo("soda", new Vector3(-43.6f, 1.0f, -7.6f), true, new Vector3(1.5f, 2, 3));
                    ledger -= 1;
                },
            });
            sim.AddControl(new Control
            {
                id = "hotline_out", pos = S["hotline_out"], kind = "hold", holdTime = 1.3f, snd = "lever",
                label = p => phase != "shift" || !quotaMet ? null : overtime > 0 && !otDone ? "CLOCK OUT (FORFEIT OVERTIME)" : "CLOCK OUT — TAKE THE MONEY",
                complete = hs => EndShift(overtime > 0 && !otDone ? "bust" : "clockout"),
            });
            sim.AddControl(new Control
            {
                id = "hotline_ot", pos = S["hotline_ot"], kind = "hold", holdTime = 1.3f, snd = "lever",
                label = p => phase == "shift" && quotaMet && (overtime == 0 || otDone) ? $"TAKE OVERTIME #{overtime + 1} (x{1.5f + 0.25f * overtime:0.00} PAY)" : null,
                complete = hs => StartOvertime(),
            });
        }

        void CancelCountdown()
        {
            if (phase == "countdown") { phase = "lobby"; sim.Emit("countdown").b = true; }
        }

        // ───────────────────────────── lifecycle ─────────────────────────────
        void StartShift()
        {
            var c = selected < contracts.Count ? contracts[selected] : contracts[0];
            ResetShiftState();
            contract = c;
            int n = PlayerCount();
            float scale = new[] { 0.7f, 1f, 1.25f, 1.5f }[Mathf.Min(4, n) - 1];
            order = c.lines.Select(l => new OrderLine { type = l.type, need = Mathf.Max(1, Mathf.RoundToInt(l.need * scale)) }).ToList();
            queue = BuildQueue(order, 0.25f);
            timeLeft = Mathf.Round(c.time * (riders["rush"] ? 0.7f : 1f));
            phase = "shift";
            sim.plant.Reset();
            sim.plant.dispAutoT = 1;
            foreach (var cg in sim.cargo.Values.ToList()) if (!cg.def.Toy) sim.RemoveCargo(cg);
            foreach (var p in sim.players.Values) { p.ready = false; p.stats = new Stats(); }
            var e = sim.Emit("shift"); e.s = c.name; e.v = timeLeft;
        }

        List<string> BuildQueue(List<OrderLine> lines, float extra)
        {
            var r = sim.rnd;
            var q = new List<string>();
            foreach (var l in lines) for (int i = 0; i < l.need; i++) q.Add(l.type);
            int extras = Mathf.RoundToInt(q.Count * extra);
            for (int i = 0; i < extras; i++) q.Add(r.Pick(lines).type);
            q.Add("duck");
            r.Shuffle(q);
            int guard = 0;
            while (q.Count > 1 && q[0] == "duck" && guard++ < 10) { q.Add(q[0]); q.RemoveAt(0); }
            return q;
        }

        public string NextFromQueue()
        {
            if (phase != "shift") return null;
            if (queue.Count == 0)
            {
                var open = ActiveLines().Where(l => l.done < l.need).ToList();
                if (open.Count == 0) return sim.rnd.Pick(Cargo.Orderable.Take(6).ToList());
                return sim.rnd.Pick(open).type;
            }
            var t = queue[0]; queue.RemoveAt(0);
            return t;
        }

        List<OrderLine> ActiveLines() => overtime > 0 && !otDone ? otOrder : order;

        void StartOvertime()
        {
            overtime++;
            otDone = false;
            ringT = 0;
            var types = Cargo.Orderable.ToList();
            sim.rnd.Shuffle(types);
            int n = PlayerCount();
            otOrder = types.Take(3).Select((t, i) => new OrderLine { type = t, need = 1 + (i == 0 ? 1 : 0) + (n >= 3 && i == 1 ? 1 : 0) + (overtime > 1 ? 1 : 0) }).ToList();
            queue = BuildQueue(otOrder, 0.3f).Concat(queue).ToList();
            int extraT = 95 + 15 * n;
            timeLeft += extraT;
            var e = sim.Emit("overtime"); e.n = overtime; e.v = extraT;
        }

        void EndShift(string why)
        {
            if (phase != "shift") return;
            float mult = Multiplier();
            if (why == "bust" || (why == "timeout" && overtime > 0 && !otDone))
            {
                if (quotaBonusPaid > 0) AddEntry(-Mathf.RoundToInt(quotaBonusPaid * 0.5f), "Overtime bust: half the quota bonus clawed back");
                result = "OVERTIME BUST";
            }
            else if (quotaMet) result = overtime > 0 ? "OVERTIME HERO" : "QUOTA MET";
            else result = "QUOTA MISSED";
            if (riders["careful"] && broken == 0 && quotaMet) AddEntry(Mathf.RoundToInt(300 * mult), "No Scratches bonus");
            phase = "ending";
            endT = 4;
            var e = sim.Emit("shiftend"); e.s = result; e.s2 = why;
        }

        void FinishShift()
        {
            var report = BuildReport();
            ledger += report.total;
            report.ledgerAfter = ledger;
            shifts++;
            reportSeq++;
            report.id = reportSeq;
            lastReport = report;
            sim.Emit("report").s = JsonUtility.ToJson(report);
            foreach (var cg in sim.cargo.Values.ToList()) sim.RemoveCargo(cg);
            sim.plant.Reset();
            int i = 0;
            foreach (var p in sim.players.Values) { sim.RespawnPlayer(p, Level.Spawns[i++ % Level.Spawns.Length]); p.ready = false; }
            sim.SpawnCargo("ball", Level.LobbyBall);
            contracts = MakeContracts();
            selected = 0;
            ResetRiders();
            phase = "lobby";
        }

        // ───────────────────────────── money ─────────────────────────────
        void AddEntry(int amount, string label, int pid = 0) { entries.Add(new Entry { amount = amount, label = label, pid = pid }); money += amount; }

        public void Penalty(int amount, string label, int pid)
        {
            if (phase != "shift") return;
            AddEntry(-amount, label, pid);
            if (sim.players.TryGetValue(pid, out var p) && amount > p.stats.maxMistake) { p.stats.maxMistake = amount; p.stats.maxMistakeWhat = label; }
            var e = sim.Emit("paid"); e.n = -amount; e.s = label; e.b = false;
        }

        // null = accepted, otherwise the rejection reason
        public string Judge(CargoItem c, string pad)
        {
            if (c.def.Junk || c.def.Toy) return "NOT CARGO";
            if (c.bay != pad) return "WRONG BAY";
            if (c.def.NeedsHeat && c.heat < 0.4f) return "BEANS NOT TOASTED";
            return null;
        }

        public void OnRejected(CargoItem c, string why)
        {
            if (c.def.Junk || c.def.Toy) return;
            misdelivered++;
            if (sim.players.TryGetValue(c.lastTouch, out var p)) p.stats.misdeliveries++;
            Penalty(K.PenMisdeliver, $"Misdelivery ({why.ToLowerInvariant()})", c.lastTouch);
        }

        public void OnDelivered(CargoItem c, string pad)
        {
            var lines = ActiveLines();
            var line = lines.FirstOrDefault(l => l.type == c.type && l.done < l.need);
            if (line == null && lines != order) line = order.FirstOrDefault(l => l.type == c.type && l.done < l.need);
            float mult = Multiplier() * (overtime > 0 && !otDone ? 1.5f + 0.25f * (overtime - 1) : 1);
            int pay = Mathf.RoundToInt(c.def.Pay * mult * (line != null ? 1 : 0.4f));
            if (line != null) line.done++;
            delivered++;
            AddEntry(pay, line != null ? "Deliveries" : "Surplus deliveries", c.lastTouch);
            if (sim.players.TryGetValue(c.lastTouch, out var p)) { p.stats.delivered++; p.stats.earned += pay; }
            var pd = Level.Pads[pad];
            var e = sim.Emit("paid"); e.n = pay; e.s = c.def.Short; e.b = true; e.x = pd.X; e.y = pd.Y + 1.5f; e.z = pd.Z; e.s2 = pad;

            if (!quotaMet && order.All(l => l.done >= l.need))
            {
                quotaMet = true;
                int bonus = Mathf.RoundToInt(contract.bonus * Multiplier());
                quotaBonusPaid = bonus;
                AddEntry(bonus, "Quota bonus");
                ringT = 30;
                sim.Emit("quota").n = bonus;
            }
            else if (overtime > 0 && !otDone && otOrder.All(l => l.done >= l.need))
            {
                otDone = true;
                int bonus = Mathf.RoundToInt(260 * overtime * Multiplier());
                AddEntry(bonus, $"Overtime #{overtime} bonus");
                ringT = 30;
                var e2 = sim.Emit("otdone"); e2.n = bonus; e2.who = overtime;
            }
        }

        public void OnBroken(CargoItem c, int by)
        {
            if (phase != "shift" || c.def.Junk || c.def.Toy) return;
            broken++;
            if (sim.players.TryGetValue(by, out var p)) p.stats.broken++;
            Penalty((c.def.BreakPenalty > 0 ? c.def.BreakPenalty : K.PenLost) + (riders["careful"] ? 40 : 0), $"Broken {c.def.Short.ToLowerInvariant()}", by);
            queue.Add(c.type);
        }

        public void OnLost(CargoItem c)
        {
            if (phase != "shift") { if (c.def.Toy && c.type == "ball") sim.SpawnCargo("ball", Level.LobbyBall); return; }
            if (c.def.Junk || c.def.Toy) return;
            Penalty(K.PenLost, $"Lost {c.def.Short.ToLowerInvariant()}", c.lastTouch);
            queue.Add(c.type);
        }

        public void OnIncinerated(CargoItem c)
        {
            if (phase != "shift" || c.def.Toy) return;
            if (c.def.Junk) { AddEntry(5, "Recycling"); var e = sim.Emit("paid"); e.n = 5; e.s = "RECYCLED"; return; }
            Penalty(K.PenLost, $"Incinerated {c.def.Short.ToLowerInvariant()}", c.lastTouch);
            queue.Add(c.type);
        }

        public void OnIncident(Incident inc)
        {
            if (phase != "shift") return;
            incidentsCount++;
            incidentKinds.TryGetValue(inc.kind, out int n);
            incidentKinds[inc.kind] = n + 1;
        }

        // ───────────────────────────── tick ─────────────────────────────
        public void PreStep(float dt)
        {
            if (phase == "lobby" || phase == "countdown")
            {
                var ps = sim.players.Values.Where(p => p.connected).ToList();
                bool allReady = ps.Count > 0 && ps.All(p => p.ready);
                if (phase == "lobby" && allReady) { phase = "countdown"; countdown = 4; sim.Emit("countdown").v = 4; }
                else if (phase == "countdown")
                {
                    if (!allReady) CancelCountdown();
                    else { countdown -= dt; if (countdown <= 0) StartShift(); }
                }
            }
            else if (phase == "shift")
            {
                shiftT += dt;
                timeLeft -= dt;
                ringT = Mathf.Max(0, ringT - dt);
                if (timeLeft <= 0) { timeLeft = 0; EndShift("timeout"); }
            }
            else if (phase == "ending")
            {
                endT -= dt;
                if (endT <= 0) FinishShift();
            }
        }

        // ───────────────────────────── report ─────────────────────────────
        Report BuildReport()
        {
            var groups = new Dictionary<string, LedgerLine>();
            foreach (var e in entries)
            {
                if (!groups.TryGetValue(e.label, out var g)) groups[e.label] = g = new LedgerLine { label = e.label };
                g.amount += e.amount; g.n++;
            }
            var players = sim.players.Values.Select(p => new ReportPlayer { id = p.id, name = p.name, outfit = p.outfit.Clone(), stats = p.stats.Clone() }).ToList();
            return new Report
            {
                contract = contract?.name, client = contract?.client, result = result, duration = Mathf.RoundToInt(shiftT),
                lines = groups.Values.OrderByDescending(g => g.amount).ToList(), total = money, delivered = delivered, broken = broken,
                misdelivered = misdelivered, incidents = incidentsCount,
                incidentKinds = incidentKinds.Select(kv => new KindCount { k = kv.Key, name = KindNames.TryGetValue(kv.Key, out var nm) ? nm : kv.Key, n = kv.Value }).ToList(),
                order = order.Select(l => l.Clone()).ToList(), overtime = overtime,
                riders = riders.Where(kv => kv.Value).Select(kv => kv.Key).ToList(), mult = Multiplier(),
                players = players, awards = Awards(players), ledgerBefore = ledger,
            };
        }

        List<Award> Awards(List<ReportPlayer> players)
        {
            var defs = new (string title, Func<Stats, float> score, Func<Stats, string> desc)[]
            {
                ("EMPLOYEE OF THE SHIFT", s => s.earned + s.fixes * 30 + s.delivered * 10, s => $"${s.earned} delivered, {s.fixes} fixes"),
                ("WALKING DISASTER", s => s.knockdowns + s.broken * 3 + s.burnt * 3, s => $"{s.knockdowns} faceplants, {s.broken} breakages" + (s.burnt > 0 ? $", {s.burnt} self-incinerations" : "")),
                ("MOST EXPENSIVE MISTAKE", s => s.maxMistake, s => $"{s.maxMistakeWhat}: -${s.maxMistake}"),
                ("CONVEYOR VICTIM", s => s.beltTime > 3 ? s.beltTime : 0, s => $"{Mathf.RoundToInt(s.beltTime)} seconds riding the belts"),
                ("FREQUENT FLYER", s => s.tubeRides * 2 + s.timesThrown, s => $"{s.tubeRides} tube rides, thrown {s.timesThrown} times"),
                ("HUMAN CATAPULT", s => s.thrownMates, s => $"Threw colleagues {s.thrownMates} times"),
                ("PRESSURE WHISPERER", s => s.valveTime > 4 ? s.valveTime : 0, s => $"{Mathf.RoundToInt(s.valveTime)}s on the boiler valve"),
                ("THE FIXER", s => s.fixes, s => $"{s.fixes} breakdowns fixed"),
                ("BIG RED BUTTON ENTHUSIAST", s => s.estops, s => $"{s.estops} emergency stops"),
            };
            var outList = new List<Award>();
            var used = new Dictionary<int, int>();
            foreach (var d in defs)
            {
                ReportPlayer best = null; float bestV = 0;
                foreach (var p in players)
                {
                    float v = d.score(p.stats);
                    used.TryGetValue(p.id, out int u);
                    if (v > 0 && v * (1 - u * 0.35f) > bestV) { bestV = v * (1 - u * 0.35f); best = p; }
                }
                if (best == null) continue;
                outList.Add(new Award { title = d.title, pid = best.id, name = best.name, desc = d.desc(best.stats), outfit = best.outfit });
                used.TryGetValue(best.id, out int k);
                used[best.id] = k + 1;
            }
            return outList.Take(6).ToList();
        }
    }
}
