// Host side: one authoritative Sim + the set of connected clients. Port of shared/room.js.
// Clients are identified by a ulong key: Netcode client ids for remote players,
// LocalKey for the host's own (in-process) view.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace ShiftHappens
{
    public class Room
    {
        public const ulong LocalKey = ulong.MaxValue;
        const float ReconnectGrace = 30f;

        public readonly Sim sim;
        public string code;
        readonly Action<ulong, byte[]> send;
        readonly Dictionary<ulong, HashSet<int>> clients = new Dictionary<ulong, HashSet<int>>();
        readonly Dictionary<string, int> tokens = new Dictionary<string, int>();
        float acc, snapAcc;
        const float Dt = 1f / K.TickRate;
        readonly List<SimEvent> pendingEvents = new List<SimEvent>();

        public Room(string code, Action<ulong, byte[]> send)
        {
            this.code = code;
            this.send = send;
            sim = new Sim((uint)UnityEngine.Random.Range(1, int.MaxValue));
        }

        public void Dispose() => sim.Destroy();

        HashSet<int> ClientOf(ulong key) { if (!clients.TryGetValue(key, out var s)) clients[key] = s = new HashSet<int>(); return s; }
        bool Owns(ulong key, int pid) => clients.TryGetValue(key, out var s) && s.Contains(pid);

        public void Leave(ulong key)
        {
            if (!clients.TryGetValue(key, out var set)) return;
            foreach (var pid in set)
                if (sim.players.TryGetValue(pid, out var p))
                {
                    p.connected = false; p.goneT = ReconnectGrace; p.ready = false;
                    sim.ReleaseHold(p);
                    var e = sim.Emit("disconnect"); e.id = pid; e.s = p.name;
                }
            clients.Remove(key);
        }

        public void Handle(ulong key, byte[] data)
        {
            if (data == null || data.Length == 0) return;
            try
            {
                using var r = Codec.Reader(data);
                byte type = r.ReadByte();
                switch (type)
                {
                    case Msg.Hello:
                    {
                        string name = r.ReadString(); var outfit = Codec.ReadOutfit(r); string token = r.ReadString();
                        if (!string.IsNullOrEmpty(token) && tokens.TryGetValue(token, out int old) && sim.players.TryGetValue(old, out var op) && !op.connected)
                        {
                            foreach (var s in clients.Values) s.Remove(old);
                            op.connected = true; op.goneT = 0;
                            ClientOf(key).Add(old);
                            var e = sim.Emit("rejoin"); e.id = old; e.s = op.name;
                            send(key, Codec.Welcome(old, token, code));
                            return;
                        }
                        if (sim.players.Count >= K.MaxPlayers) { send(key, Codec.Error("This shift is full (4 workers max).")); return; }
                        var p = sim.AddPlayer(name, outfit);
                        string tk = string.IsNullOrEmpty(token) ? Guid.NewGuid().ToString("N").Substring(0, 10) : token;
                        tokens[tk] = p.id;
                        ClientOf(key).Add(p.id);
                        send(key, Codec.Welcome(p.id, tk, code));
                        break;
                    }
                    case Msg.Input:
                    {
                        int pid = r.ReadInt32();
                        var inp = new PlayerInput { mx = r.ReadSingle(), mz = r.ReadSingle(), b = r.ReadByte() };
                        for (int k = 0; k < 4; k++) inp.c[k] = r.ReadUInt16();
                        if (Owns(key, pid)) sim.SetInput(pid, inp);
                        break;
                    }
                    case Msg.AddLocal:
                    {
                        string name = r.ReadString(); var outfit = Codec.ReadOutfit(r);
                        if (sim.players.Count >= K.MaxPlayers) { send(key, Codec.Error("The shift is full.")); return; }
                        var p = sim.AddPlayer(name, outfit);
                        ClientOf(key).Add(p.id);
                        send(key, Codec.LocalAdded(p.id));
                        break;
                    }
                    case Msg.RemoveLocal:
                    {
                        int pid = r.ReadInt32();
                        if (Owns(key, pid)) { sim.RemovePlayer(pid); clients[key].Remove(pid); }
                        break;
                    }
                    case Msg.OutfitMsg:
                    {
                        int pid = r.ReadInt32(); var o = Codec.ReadOutfit(r);
                        if (Owns(key, pid) && sim.players.TryGetValue(pid, out var p))
                        {
                            if (Array.IndexOf(K.OutfitColors, o.color) >= 0) p.outfit.color = o.color;
                            if (Array.IndexOf(K.Hats, o.hat) >= 0) p.outfit.hat = o.hat;
                            if (Array.IndexOf(K.Models, o.model) >= 0) p.outfit.model = o.model;
                        }
                        break;
                    }
                    case Msg.NameMsg:
                    {
                        int pid = r.ReadInt32(); string n = r.ReadString();
                        if (Owns(key, pid) && sim.players.TryGetValue(pid, out var p) && !string.IsNullOrWhiteSpace(n)) p.name = Sim.Truncate(n.Trim(), 14);
                        break;
                    }
                }
            }
            catch (EndOfStreamException) { Debug.LogWarning("[ShiftHappens] truncated message ignored"); }
        }

        public void Update(float realDt)
        {
            acc += Mathf.Min(realDt, 0.25f);
            int steps = 0;
            while (acc >= Dt && steps < 8)
            {
                sim.Step(Dt);
                acc -= Dt;
                steps++;
                pendingEvents.AddRange(sim.events);
                sim.events.Clear();
            }
            if (steps == 8) acc = 0;
            foreach (var p in sim.players.Values.ToList())
            {
                if (p.connected) continue;
                p.goneT -= realDt;
                if (p.goneT <= 0)
                {
                    foreach (var kv in tokens.Where(kv => kv.Value == p.id).ToList()) tokens.Remove(kv.Key);
                    sim.RemovePlayer(p.id);
                    pendingEvents.AddRange(sim.events); sim.events.Clear();
                }
            }
            snapAcc += realDt;
            if (snapAcc >= 1f / K.SnapshotRate)
            {
                snapAcc = 0;
                var bytes = Codec.EncodeSnapshot(sim, pendingEvents);
                pendingEvents.Clear();
                foreach (var key in clients.Keys.ToList()) send(key, bytes);
            }
        }
    }
}
