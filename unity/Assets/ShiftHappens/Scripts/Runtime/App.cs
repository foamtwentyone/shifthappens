// SHIFT HAPPENS bootstrap. Creates itself when Play is pressed in ANY scene
// (even an empty one) and builds the whole game in code.
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading.Tasks;
using UnityEngine;

namespace ShiftHappens
{
    public class App : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (Phys.FindAny<App>() != null) return;
            foreach (var c in FindObjectsByTypeCompat<Camera>()) c.gameObject.SetActive(false); // the game brings its own camera
            var go = new GameObject("ShiftHappens");
            DontDestroyOnLoad(go);
            go.AddComponent<App>();
        }

        static T[] FindObjectsByTypeCompat<T>() where T : Object
        {
#if UNITY_2023_1_OR_NEWER
            return FindObjectsByType<T>(FindObjectsSortMode.None);
#else
            return FindObjectsOfType<T>();
#endif
        }

        public GameInput input;
        public Synth audio;
        public Stage stage;
        public LevelView level;
        public Fx fx;
        public GameUI ui;
        public Records records;
        public Session session;
        Room room;               // only when this machine is the host (local or online)
        public Sim HostSim => room?.sim;
        string mode = "title";   // title | menu | game
        bool paused;
        public string ShareCode = "";
        Snapshot state;
        readonly Dictionary<int, WorkerView> workers = new Dictionary<int, WorkerView>();
        readonly Dictionary<int, CargoView> cargo = new Dictionary<int, CargoView>();
        Transform actors;
        float t, inputT, ambT;
        int reportShown;

        void Awake()
        {
            Application.targetFrameRate = 120;
            QualitySettings.vSyncCount = 1;
            records = Records.Load();
            input = new GameInput();
            stage = new Stage(transform);
            level = new LevelView(transform);
            fx = new Fx(transform);
            audio = new Synth(transform);
            actors = new GameObject("Actors").transform;
            actors.SetParent(transform, false);
            ui = new GameUI(this, transform);
            ApplyQuality();
            NetBridge.OnServerMessage += (sender, data) => room?.Handle(sender, data);
            NetBridge.OnClientLeft += id => room?.Leave(id);
            NetBridge.OnClientMessage += data => session?.Receive(data);
            NetBridge.OnDisconnected += reason => { if (session != null && !session.isLocal && room == null) { ui.Toast(reason); LeaveToMenu(); } };
            ShowTitle();
            if (AutoTest.Requested) AutoTest.Begin(this);
        }

        public void ApplyQuality() => stage.ApplyQuality(Settings.Quality);

        // ───────────────────────────── flow ─────────────────────────────
        void ShowTitle() { mode = "title"; audio.SetMood("off"); stage.MenuShot(0); stage.Snap(); ui.ShowTitle(); }
        public void OnTitleConfirm() { if (mode != "title") return; audio.Play("punch"); ShowMenu(); }
        void ShowMenu() { mode = "menu"; audio.SetMood("menu"); ui.ShowMenu(); }

        Session NewSession(bool local, System.Action<byte[]> toHost)
        {
            var s = new Session(local, toHost) { firstDevice = "kb1" };
            s.OnEvent += OnEvent;
            s.OnError += msg => ui.Toast(msg);
            return s;
        }

        void EnterGame()
        {
            mode = "game"; paused = false; reportShown = 0; state = null;
            ui.CloseModal();
            session.Hello(Settings.Name, Settings.Outfit);
        }

        public void StartLocal()
        {
            room = new Room("SOLO", (key, data) => { if (key == Room.LocalKey) session?.Receive(data); });
            session = NewSession(true, data => room.Handle(Room.LocalKey, data));
            ShareCode = "COUCH SHIFT";
            EnterGame();
        }

        public bool HostLan()
        {
            if (!NetBridge.HostLan()) return false;
            room = new Room(LocalIp(), (key, data) => { if (key == Room.LocalKey) session?.Receive(data); else NetBridge.SendToClient(key, data); });
            session = NewSession(false, data => room.Handle(Room.LocalKey, data));
            ShareCode = $"{LocalIp()}";
            EnterGame();
            return true;
        }

        public async Task<string> HostRelay()
        {
            try
            {
                string code = await NetBridge.HostRelay();
                room = new Room(code, (key, data) => { if (key == Room.LocalKey) session?.Receive(data); else NetBridge.SendToClient(key, data); });
                session = NewSession(false, data => room.Handle(Room.LocalKey, data));
                ShareCode = code;
                EnterGame();
                return null;
            }
            catch (System.Exception e) { NetBridge.Shutdown(); return e.Message; }
        }

        public bool JoinLan(string address)
        {
            if (!NetBridge.JoinLan(address)) return false;
            session = NewSession(false, NetBridge.SendToHost);
            ShareCode = address;
            mode = "game"; paused = false; reportShown = 0; state = null;
            ui.CloseModal();
            StartCoroutine(HelloWhenConnected());
            return true;
        }

        public async Task<string> JoinRelay(string code)
        {
            try
            {
                await NetBridge.JoinRelay(code);
                session = NewSession(false, NetBridge.SendToHost);
                ShareCode = code.ToUpperInvariant();
                mode = "game"; paused = false; reportShown = 0; state = null;
                ui.CloseModal();
                StartCoroutine(HelloWhenConnected());
                return null;
            }
            catch (System.Exception e) { NetBridge.Shutdown(); return e.Message; }
        }

        System.Collections.IEnumerator HelloWhenConnected()
        {
            float timeout = 8;
            while (!NetBridge.IsConnectedClient && timeout > 0) { timeout -= Time.unscaledDeltaTime; yield return null; }
            if (!NetBridge.IsConnectedClient) { ui.Toast("Could not reach the host."); LeaveToMenu(); yield break; }
            session.Hello(Settings.Name, Settings.Outfit);
        }

        public void LeaveToMenu()
        {
            ui.CloseModal(); ui.ReportOpen = false;
            paused = false;
            NetBridge.Shutdown();
            room?.Dispose(); room = null;
            session = null; state = null;
            foreach (var w in workers.Values) w.Destroy(); workers.Clear();
            foreach (var c in cargo.Values) c.Destroy(); cargo.Clear();
            ui.ClearWorld();
            stage.ResetLighting();
            audio.Loops(0, 0, 0);
            stage.MenuShot(t);
            ShowMenu();
        }

        public void Quit()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        public void TogglePause()
        {
            if (paused) { paused = false; input.enabled = true; ui.CloseModal(); return; }
            paused = true; input.enabled = false;
            ui.ShowPause(state != null && state.game.phase == "lobby");
        }

        public void SendOutfit(Outfit o) { if (session != null && session.local.Count > 0) session.Send(Codec.SetOutfit(session.local[0].pid, o)); }
        public void SendName(string n) { if (session != null && session.local.Count > 0) session.Send(Codec.SetName(session.local[0].pid, n)); }

        public static string LocalIp()
        {
            try
            {
                foreach (var a in Dns.GetHostEntry(Dns.GetHostName()).AddressList)
                    if (a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a)) return a.ToString();
            }
            catch { /* offline */ }
            return "127.0.0.1";
        }

        void AddCouch(string device)
        {
            if (state != null && state.pl.Count >= K.MaxPlayers) { ui.Toast("The shift is full (4 workers)."); return; }
            int n = session.local.Count + 1;
            string[] cols = { "#1fb5a8", "#8b5cf6", "#7ac943", "#ff5d8f" };
            string[] models = { "female-b", "male-c", "robot", "female-e" };
            session.AddLocal(device, $"Player {n}", new Outfit { color = cols[n % 4], hat = "none", model = models[n % 4] });
            audio.Play("punch");
            ui.Toast($"Player {n} clocked in on {(device.StartsWith("pad") ? "a gamepad" : "the arrow keys")}!");
        }

        // ───────────────────────────── loop ─────────────────────────────
        void Update()
        {
            float dt = Mathf.Min(0.05f, Time.unscaledDeltaTime);
            t += dt;
            input.Poll();

            if (mode == "title") { if (input.Pressed("any")) OnTitleConfirm(); }
            else if (mode == "menu") ui.MenuKeys(input);

            if (mode != "game" || session == null)
            {
                stage.MenuShot(t);
                level.Update(null, null, dt, t);
                stage.Tick(dt, true);
                return;
            }

            if (input.Pressed("escape") && !ui.ReportOpen && (paused || !ui.ModalOpen)) TogglePause();
            var g = state?.game;
            bool lobby = g != null && (g.phase == "lobby" || g.phase == "countdown");
            if (lobby && !paused && !ui.ModalOpen)
            {
                var used = session.local.Select(l => l.device).Concat(session.pendingDevices).ToList();
                if (input.Pressed("enter") && !used.Contains("kb2")) AddCouch("kb2");
                foreach (var pad in input.padJoins) if (!used.Contains(pad)) AddCouch(pad);
            }

            if (room != null && !(paused && session.isLocal)) room.Update(dt);
            inputT += dt;
            if (inputT >= 1f / 30 && !paused) { inputT = 0; session.SendInputs(input); }

            var st = session.State();
            if (st != null)
            {
                state = st;
                Sync(st, dt);
                ui.Update(st, dt);
                stage.Lighting(st, dt);
                stage.Follow(st, session.LocalIds());
                Ambient(st, dt);
                Sounds(st);
            }
            stage.Tick(dt, false);
        }

        void Sync(Snapshot st, float dt)
        {
            level.Update(st.plant, st.game, dt, t);
            var seen = new HashSet<int>();
            foreach (var p in st.pl)
            {
                seen.Add(p.id);
                string key = $"{p.outfit.model}|{p.outfit.hat}|{p.outfit.color}";
                if (workers.TryGetValue(p.id, out var w) && w.key != key) { w.Destroy(); workers.Remove(p.id); w = null; }
                if (w == null) { w = new WorkerView(p.outfit, actors); workers[p.id] = w; }
                var prevState = w.root.activeSelf;
                w.Update(p, dt, t);
                w.SetGhost(!p.connected);
            }
            foreach (var id in workers.Keys.ToList()) if (!seen.Contains(id)) { fx.Puff(workers[id].root.transform.position + Vector3.up * 0.6f, 10); workers[id].Destroy(); workers.Remove(id); }
            var seenC = new HashSet<int>();
            foreach (var c in st.ents)
            {
                seenC.Add(c.id);
                if (!cargo.TryGetValue(c.id, out var v)) { v = new CargoView(c.type, c.bay, actors); cargo[c.id] = v; }
                v.Update(c, dt, t, stage.cam);
            }
            foreach (var id in cargo.Keys.ToList())
                if (!seenC.Contains(id)) { if (!cargo[id].gone) fx.Puff(cargo[id].root.transform.position, 6, null, 0.4f); cargo[id].Destroy(); cargo.Remove(id); }
        }

        void Ambient(Snapshot st, float dt)
        {
            ambT += dt;
            if (ambT < 0.1f) return;
            ambT = 0;
            var pl = st.plant;
            if (pl.fan) fx.Mote(VS.P(Level.Fan.x + Random.Range(-0.8f, 0.8f), 0.5f, Level.Fan.z + Random.Range(-0.8f, 0.8f)), new Vector3(0, 6, 0.5f), new Color(0.87f, 0.97f, 1, 0.4f), 0.25f, 0.8f);
            if (pl.P > 75 && Random.value < (pl.P - 70) / 30f) fx.Steam(VS.P(Level.Boiler.x + 0.6f, 5.4f, Level.Boiler.z), 1, 3);
            foreach (var m in pl.overheat) if (Plant.MachineSpot.TryGetValue(m, out var sp)) { fx.Mote(VS.P(sp) + Vector3.up * 0.5f, new Vector3(Random.Range(-0.5f, 0.5f), 2, 0), new Color(0.33f, 0.33f, 0.33f, 0.55f), 0.5f, 1.3f); if (Random.value < 0.3f) fx.Sparks(VS.P(sp), 3); }
            foreach (var b in Level.Belts) if (pl.belts[b.Id].jam) fx.Sparks(VS.P(Random.Range(b.X0, b.X1), 0.8f, (b.Z0 + b.Z1) / 2), 2);
            if (pl.sorterFault) fx.Sparks(VS.P(Level.Sorter.x, 1.8f, Level.Sorter.z + 1.2f), 2, K.Hex("#7ee0ff"));
            fx.Flames(VS.P(Level.Incinerator.x, 0.8f, Level.Incinerator.z), 1);
            foreach (var c in level.chimneys) if (Random.value < 0.25f) fx.Mote(c, new Vector3(1.2f, 2.2f, -0.4f), new Color(0.85f, 0.88f, 0.89f, 0.45f), 1.6f, 4);
            if (pl.doors[1] > 0.4f && pl.doors[2] > 0.4f) for (int i = 0; i < 3; i++) fx.Mote(VS.P(Random.Range(-6f, 14f), Random.Range(0.4f, 2.4f), Random.Range(-3f, 3f)), new Vector3(14, 0, 0), new Color(1, 1, 1, 0.6f), 0.18f, 0.6f);
            foreach (var z in pl.zoneGravity.Keys)
            {
                var zn = Level.Zones.First(q => q.Id == z);
                fx.Mote(VS.P(Random.Range(zn.X0, zn.X1), 0.2f, Random.Range(zn.Z0, zn.Z1)), new Vector3(0, 1.2f, 0), K.Hex("#c9a5ff"), 0.22f, 2);
            }
        }

        void Sounds(Snapshot st)
        {
            audio.listener = stage.Target;
            var g = st.game;
            bool shift = g.phase == "shift" || g.phase == "ending";
            audio.SetMood(g.phase == "lobby" || g.phase == "countdown" ? "lobby" : g.overtime > 0 && !g.otDone ? "overtime" : "shift");
            if (!shift) { audio.Loops(0, 0, 0); return; }
            int moving = st.plant.belts.Values.Count(b => Mathf.Abs(b.speed) > 0.3f);
            var ct = stage.Target;
            float fanD = Vector2.Distance(new Vector2(ct.x, ct.z), new Vector2(Level.Fan.x, -Level.Fan.z));
            float bD = Vector2.Distance(new Vector2(ct.x, ct.z), new Vector2(Level.Boiler.x, -Level.Boiler.z));
            audio.Loops(0.05f * moving, st.plant.fan ? Mathf.Max(0, 0.25f - fanD / 80) : 0, st.plant.P / 100 * Mathf.Max(0.03f, 0.35f - bD / 70));
        }

        Vector3? PosOf(int id)
        {
            var p = state?.pl.FirstOrDefault(q => q.id == id);
            return p != null ? VS.P(p.pos) : (Vector3?)null;
        }

        string NameOf(int id) => state?.pl.FirstOrDefault(q => q.id == id)?.name ?? "Someone";

        void OnEvent(SimEvent e)
        {
            Vector3 at = VS.P(e.x, e.y, e.z);
            switch (e.type)
            {
                case "click": audio.Play(e.s2, PosOf(e.id)); break;
                case "grab": audio.Play("grab", PosOf(e.id)); break;
                case "drop": audio.Play("drop", PosOf(e.id)); break;
                case "throw": audio.Play("throw", PosOf(e.id)); break;
                case "shove": audio.Play("shove", PosOf(e.id)); break;
                case "jump": audio.Play("jump", PosOf(e.id), 0.6f); if (PosOf(e.id) is Vector3 jp) fx.Puff(jp + Vector3.down * 0.3f, 3, null, 0.3f, 0.8f); break;
                case "knock": audio.Play("knock", at); fx.Stars(at + Vector3.up * 1.2f); if (e.s == "burst" || e.s == "cargo") stage.shake = Mathf.Max(stage.shake, 0.25f); break;
                case "voice": audio.Voice(e.id, e.s, PosOf(e.id)); break;
                case "thud": audio.Play("thud", at, Mathf.Clamp01(e.v / 10)); if (e.v > 4) fx.Puff(at + Vector3.down * 0.3f, 3, null, 0.35f, 1); if (e.v > 7) stage.shake = Mathf.Max(stage.shake, 0.15f); break;
                case "break":
                    audio.Play("break", at); fx.Shards(at, K.Hex("#f6f1ea"), 16); fx.Shards(at, Pal.Blue, 6); fx.Puff(at, 6, Color.white, 0.5f);
                    stage.shake = Mathf.Max(stage.shake, 0.3f);
                    ui.Floaty($"{(Cargo.Defs.TryGetValue(e.s, out var bd) ? bd.Short : "")} SMASHED", new Vector3(e.x, e.y + 1, e.z), true); break;
                case "burn": audio.Play("burn", at); fx.Flames(VS.P(Level.Incinerator.x, 0.9f, Level.Incinerator.z), 14); fx.Sparks(VS.P(Level.Incinerator.x, 1, Level.Incinerator.z), 10, K.Hex("#ff9a3c")); if (e.s == "player") ui.Floaty("OUCH!", new Vector3(e.x, 2, e.z), true); break;
                case "burst": audio.Play("burst"); audio.Play("klaxon"); fx.Steam(VS.P(Level.Boiler.x, 2.5f, Level.Boiler.z), 40, 7); fx.Sparks(VS.P(Level.Boiler.x, 2.5f, Level.Boiler.z), 30); stage.shake = 1.2f; ui.PushAlert("BOILER BURST! -$120", true, 5); break;
                case "ship":
                {
                    var pd = Level.Pads[e.s];
                    audio.Play("ship", VS.P(pd.X, pd.Y, pd.Z));
                    level.FlashPad(e.s);
                    fx.Confetti(VS.P(pd.X, pd.Y + 0.6f, pd.Z), 26, 5);
                    if (cargo.TryGetValue(e.id, out var cv)) cv.gone = true;
                    break;
                }
                case "paid":
                    audio.Play("paid", e.b ? at : (Vector3?)null, e.n < 0 ? 0.4f : 1);
                    if (e.b) ui.Floaty((e.n >= 0 ? "+" : "") + UIX.Money(e.n), new Vector3(e.x, e.y, e.z), e.n < 0);
                    else if (e.n < 0 && e.s != "Boiler burst" && e.s != "Emergency stop") ui.PushAlert($"{e.s}: {UIX.Money(e.n)}", false, 3);
                    break;
                case "reject": audio.Play("reject", at); fx.Puff(at + Vector3.up * 0.8f, 8, K.Hex("#ff8a80"), 0.5f); ui.Floaty("REJECTED: " + e.s2, new Vector3(e.x, 2.2f, e.z), true); break;
                case "scan": audio.Play("scan", VS.P(Level.Scanner), 0.7f); break;
                case "dispense": audio.Play("dispense", VS.P(Level.Dispenser)); fx.Puff(VS.P(Level.Dispenser.x, 3.6f, Level.Dispenser.z), 6, null, 0.45f); break;
                case "tube": audio.Play("tube", VS.P(Level.TubeMouth)); fx.Puff(VS.P(Level.TubeMouth) + Vector3.up * 0.2f, 6, K.Hex("#bff7f2"), 0.4f); break;
                case "tubeout": audio.Play("tubeout", VS.P(Level.TubePath[3])); fx.Puff(VS.P(Level.TubePath[3]) + Vector3.down * 0.6f, 8, K.Hex("#bff7f2"), 0.5f, 2.5f); break;
                case "fling": audio.Play("throw", VS.P(Level.Sorter)); fx.Sparks(VS.P(Level.Sorter), 12, K.Hex("#7ee0ff")); break;
                case "incident": audio.Play("klaxon", null, 0.7f); stage.shake = Mathf.Max(stage.shake, 0.25f); break;
                case "resolved":
                    if (!string.IsNullOrEmpty(e.s2))
                    {
                        audio.Play("fixed");
                        var names = e.s2.Split(',').Select(s => int.TryParse(s, out int id) ? NameOf(id) : null).Where(n => n != null);
                        ui.Toast("✔ Fixed by " + string.Join(" & ", names));
                    }
                    break;
                case "power": audio.Play(e.b ? "powerup" : "powerdown"); break;
                case "alarm": audio.Play("alarm", null, 0.6f); break;
                case "estop": audio.Play("estop"); stage.shake = Mathf.Max(stage.shake, 0.2f); ui.PushAlert($"EMERGENCY STOP: {e.s.ToUpperInvariant()} (-$25)", true, 3); break;
                case "airlock": audio.Play("airlock", VS.P(7, 0, 0)); break;
                case "denied": audio.Play("denied"); break;
                case "quota": audio.Play("quota"); ui.Banner("QUOTA MET!", $"+{UIX.Money(e.n)} bonus — answer the hotline!", 3.5f); ui.PushAlert($"QUOTA MET! +{UIX.Money(e.n)}", false, 6); foreach (var pd in Level.Pads.Values) fx.Confetti(VS.P(pd.X, pd.Y + 1, pd.Z), 40, 7); break;
                case "otdone": audio.Play("quota"); ui.Banner("OVERTIME DONE!", "+" + UIX.Money(e.n), 3); break;
                case "overtime": audio.Play("horn"); ui.Banner($"OVERTIME #{e.n}", $"+{Mathf.RoundToInt(e.v)}s on the clock · ×1.5 pay · more chaos", 3); break;
                case "shift": audio.Play("horn"); ui.Banner("SHIFT START!", e.s, 2.6f); break;
                case "shiftend": audio.Play(e.s == "QUOTA MISSED" || e.s == "OVERTIME BUST" ? "fail" : "horn"); break;
                case "countdown": if (!e.b) audio.Play("beep"); break;
                case "report":
                {
                    var rep = JsonUtility.FromJson<Report>(e.s);
                    if (rep != null && rep.id != reportShown)
                    {
                        reportShown = rep.id;
                        records.Add(rep, session.LocalIds());
                        ui.ShowReport(rep);
                        audio.Play("paper");
                    }
                    break;
                }
                case "join": if (state != null) ui.Toast($"👷 {e.s} clocked in"); audio.Play("punch"); break;
                case "rejoin": ui.Toast($"🔌 {e.s} reconnected"); break;
                case "leave": ui.Toast($"👋 {e.s} went home"); break;
                case "disconnect": ui.Toast($"📵 {e.s} lost connection — 30s to come back"); break;
                case "hop": audio.Play("hop", null, 0.5f); break;
                case "slosh": audio.Play("slosh", null, 0.5f); break;
            }
        }

        void OnDestroy() { NetBridge.Shutdown(); }
    }
}
