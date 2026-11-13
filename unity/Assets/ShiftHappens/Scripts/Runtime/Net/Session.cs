// Client view of one Room (local or remote). Buffers snapshots and interpolates
// between them; the rest of the client only ever reads Session.State().
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ShiftHappens
{
    public class LocalSlot { public int pid; public string device; }

    public class Session
    {
        public readonly bool isLocal;
        readonly Action<byte[]> toHost;
        public readonly List<LocalSlot> local = new List<LocalSlot>();
        public readonly List<string> pendingDevices = new List<string>();
        public string firstDevice = "kb1";
        public string code, token;
        public bool welcomed;
        readonly List<Snapshot> snaps = new List<Snapshot>();
        float offset; bool hasOffset;
        public Snapshot latest;
        public event Action<SimEvent> OnEvent;
        public event Action<string> OnError;
        public event Action OnWelcome;

        public Session(bool isLocal, Action<byte[]> toHost) { this.isLocal = isLocal; this.toHost = toHost; }

        public float InterpDelay => isLocal ? 0.06f : 0.11f;

        public void Send(byte[] data) => toHost(data);

        public void Receive(byte[] data)
        {
            if (data == null || data.Length == 0) return;
            switch (data[0])
            {
                case Msg.Welcome:
                {
                    using var r = Codec.Reader(data); r.ReadByte();
                    int pid = r.ReadInt32(); token = r.ReadString(); code = r.ReadString();
                    if (local.Count == 0) local.Add(new LocalSlot { pid = pid, device = firstDevice }); else local[0].pid = pid;
                    welcomed = true;
                    OnWelcome?.Invoke();
                    break;
                }
                case Msg.Local:
                {
                    using var r = Codec.Reader(data); r.ReadByte();
                    int pid = r.ReadInt32();
                    if (pendingDevices.Count > 0) { local.Add(new LocalSlot { pid = pid, device = pendingDevices[0] }); pendingDevices.RemoveAt(0); }
                    break;
                }
                case Msg.Error:
                {
                    using var r = Codec.Reader(data); r.ReadByte();
                    pendingDevices.Clear();
                    OnError?.Invoke(r.ReadString());
                    break;
                }
                case Msg.Snap:
                {
                    var s = Codec.DecodeSnapshot(data);
                    float now = Time.unscaledTime;
                    float off = s.time - now;
                    if (!hasOffset) { offset = off; hasOffset = true; }
                    else
                    {
                        offset += (off - offset) * 0.08f;
                        if (off > offset + 0.25f || off < offset - 0.5f) offset = off;
                    }
                    snaps.Add(s);
                    if (snaps.Count > 30) snaps.RemoveAt(0);
                    latest = s;
                    foreach (var e in s.ev) OnEvent?.Invoke(e);
                    break;
                }
            }
        }

        public void Hello(string name, Outfit outfit) => Send(Codec.Hello(name, outfit, token));
        public void AddLocal(string device, string name, Outfit o) { pendingDevices.Add(device); Send(Codec.AddLocal(name, o)); }
        public void RemoveLocal(int pid) { Send(Codec.RemoveLocal(pid)); local.RemoveAll(l => l.pid == pid); }

        public void SendInputs(GameInput input)
        {
            foreach (var l in local) Send(Codec.Input(l.pid, input.Read(l.device)));
        }

        public List<int> LocalIds() => local.Select(l => l.pid).ToList();

        public Snapshot State()
        {
            if (snaps.Count == 0) return null;
            float rt = Time.unscaledTime + offset - InterpDelay;
            Snapshot a = null, b = null;
            for (int i = snaps.Count - 1; i >= 0; i--)
                if (snaps[i].time <= rt) { a = snaps[i]; b = i + 1 < snaps.Count ? snaps[i + 1] : null; break; }
            if (a == null) a = snaps[0];
            if (b == null) return a;
            float k = Mathf.Clamp01((rt - a.time) / Mathf.Max(1e-4f, b.time - a.time));
            var o = new Snapshot { tick = b.tick, time = Mathf.Lerp(a.time, b.time, k), plant = b.plant, game = b.game, ev = new List<SimEvent>() };
            var amap = a.ents.ToDictionary(e => e.id);
            foreach (var eb in b.ents)
            {
                if (!amap.TryGetValue(eb.id, out var ea)) { o.ents.Add(eb); continue; }
                o.ents.Add(new SnapCargo { id = eb.id, type = eb.type, bay = eb.bay, heat = eb.heat, flags = eb.flags, ship = eb.ship, pos = Vector3.Lerp(ea.pos, eb.pos, k), rot = Quaternion.Slerp(ea.rot, eb.rot, k) });
            }
            var pmap = a.pl.ToDictionary(p => p.id);
            foreach (var pb in b.pl)
            {
                if (!pmap.TryGetValue(pb.id, out var pa)) { o.pl.Add(pb); continue; }
                var p = (SnapPlayer)pb.MemberwiseCloneSafe();
                p.pos = Vector3.Lerp(pa.pos, pb.pos, k);
                p.yaw = pa.yaw + Mathf.DeltaAngle(pa.yaw * Mathf.Rad2Deg, pb.yaw * Mathf.Rad2Deg) * Mathf.Deg2Rad * k;
                o.pl.Add(p);
            }
            return o;
        }
    }

    public static class SnapExt
    {
        public static SnapPlayer MemberwiseCloneSafe(this SnapPlayer p) => new SnapPlayer
        {
            id = p.id, slot = p.slot, holdId = p.holdId, hk = p.hk, name = p.name, outfit = p.outfit, pos = p.pos, vy = p.vy, yaw = p.yaw, speed = p.speed, anim = p.anim,
            state = p.state, grounded = p.grounded, usingCtl = p.usingCtl, ready = p.ready, connected = p.connected, belt = p.belt, prompt = p.prompt,
        };
    }
}
