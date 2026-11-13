// Automated self-test: plays a scripted shift, captures screenshots + the console
// log + a summary into <project>/SelfTest/. Start it from the editor menu
// "Shift Happens/Run Self-Test" (or set PlayerPrefs "sh.autotest" = 1 before Play).
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace ShiftHappens
{
    public class AutoTest : MonoBehaviour
    {
        public static bool Requested => PlayerPrefs.GetInt("sh.autotest", 0) == 1;

        App app;
        string dir;
        readonly StringBuilder log = new StringBuilder();
        readonly List<string> notes = new List<string>();
        int errors, warnings, shot;
        readonly List<float> frameTimes = new List<float>();

        public static void Begin(App app)
        {
            PlayerPrefs.SetInt("sh.autotest", 0);
            PlayerPrefs.Save();
            var t = app.gameObject.AddComponent<AutoTest>();
            t.app = app;
        }

        void Awake()
        {
            dir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "SelfTest"));
            if (Directory.Exists(dir)) foreach (var f in Directory.GetFiles(dir)) File.Delete(f);
            Directory.CreateDirectory(dir);
            Application.logMessageReceived += OnLog;
        }

        void OnDestroy() => Application.logMessageReceived -= OnLog;

        void OnLog(string msg, string stack, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert) errors++;
            if (type == LogType.Warning) warnings++;
            log.AppendLine($"[{Time.realtimeSinceStartup,7:0.00}] {type}: {msg}");
            if (type == LogType.Exception || type == LogType.Error) log.AppendLine(stack);
        }

        void Update() => frameTimes.Add(Time.unscaledDeltaTime);

        void Note(string s) { notes.Add(s); Debug.Log("[SelfTest] " + s); }

        IEnumerator Shot(string name)
        {
            yield return new WaitForEndOfFrame();
            shot++;
            string path = Path.Combine(dir, $"{shot:00}_{name}.png");
            var tex = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Destroy(tex);
            Note($"screenshot {Path.GetFileName(path)} ({Screen.width}x{Screen.height})");
        }

        static IEnumerator Wait(float s) { float t = 0; while (t < s) { t += Time.unscaledDeltaTime; yield return null; } }

        Sim Sim => app.HostSim;
        Player P1 => Sim?.players.Values.FirstOrDefault();

        void Teleport(Player p, float x, float z, float yawDeg = 180)
        {
            if (p == null) return;
            p.state = PState.Ok; p.downT = 0;
            p.body.position = new Vector3(x, 0.6f, z);
            p.body.transform.position = p.body.position;
            p.body.SetVel(Vector3.zero);
            p.yaw = yawDeg * Mathf.Deg2Rad;
        }

        IEnumerator Start()
        {
            Note($"Unity {Application.unityVersion}, {SystemInfo.graphicsDeviceType}, GPU {SystemInfo.graphicsDeviceName}, screen {Screen.width}x{Screen.height}, quality {Settings.Quality}");
            Note($"render pipeline: {(UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline ? UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline.name : "BUILT-IN (no URP!)")}");
            Note($"input backend: {InputBackend()}");
            yield return Wait(1.0f);
            app.OnTitleConfirm();
            yield return Wait(2.5f);
            yield return Shot("menu");

            app.StartLocal();
            yield return Wait(3f);
            if (Sim == null) { Note("FAIL: local room did not start"); yield return Finish(); yield break; }
            Note($"lobby: players={Sim.players.Count}, phase={Sim.game.phase}");
            yield return Shot("lobby");
            // character orientation check: the worker should face the camera (south) with yaw 0
            Teleport(P1, -38, 2, 0);
            yield return Wait(1.2f);
            yield return Shot("lobby_facing_camera");
            Teleport(P1, -36, 0, 90);
            yield return Wait(1.0f);
            yield return Shot("lobby_facing_east");

            // walk with real inputs for a moment (proves the input → sim path)
            float x0 = P1.Pos.x;
            Sim.SetInput(P1.id, new PlayerInput { mx = 1, mz = 0 });
            yield return Wait(1.0f);
            Note($"walk test: moved {P1.Pos.x - x0:0.00} m (expected ~4)");
            yield return Shot("walking");
            Sim.SetInput(P1.id, new PlayerInput());

            foreach (var p in Sim.players.Values) p.ready = true;
            float timeout = 8;
            while (Sim.game.phase != "shift" && timeout > 0) { timeout -= Time.unscaledDeltaTime; yield return null; }
            Note($"shift started: {Sim.game.phase == "shift"} contract={Sim.game.contract?.name}");
            yield return Wait(1.5f);
            yield return Shot("shift_start");

            // a tour of the plant with cargo of every type
            foreach (var t in new[] { "crate", "gnome", "beans", "balloon", "magnet", "mystery", "wobble" }) Sim.plant.SpawnFromDispenser(t, false);
            var tour = new (string name, float x, float z)[] { ("intake", -22, 2), ("sorting", -6, 3), ("control", -5, -14), ("airlock", 7, 0), ("dock", 20, 2), ("skydock", 25, -7) };
            foreach (var (name, x, z) in tour)
            {
                Teleport(P1, x, z);
                if (name == "skydock") { P1.body.position = new Vector3(x, Level.SkyDock.top + 0.6f, z); P1.body.transform.position = P1.body.position; }
                Sim.plant.pressure = 45;
                yield return Wait(2.2f);
                yield return Shot(name);
            }

            // carrying + co-op
            Teleport(P1, -8, 3, 90);
            var crate = Sim.SpawnCargo("crate", new Vector3(-6.9f, 0.6f, 3));
            yield return Wait(0.6f);
            var inp = new PlayerInput { c = new[] { 0, 1, 0, 0 } };
            Sim.SetInput(P1.id, inp);
            yield return Wait(0.5f);
            Note($"grab test: holding={(P1.holding != null ? "yes" : "NO")}");
            Sim.SetInput(P1.id, new PlayerInput { mx = -0.6f, c = inp.c });
            yield return Wait(0.8f);
            yield return Shot("carrying");
            Sim.SetInput(P1.id, new PlayerInput { c = new[] { 0, 2, 0, 0 } });

            // incidents
            Sim.plant.Start("breach", null, "test");
            Sim.plant.Start("jam", "B", "test");
            Sim.plant.Start("flux", "dock", "test");
            Teleport(P1, 6, 0);
            yield return Wait(2.5f);
            yield return Shot("incidents");
            Sim.plant.Start("blackout", null, "test");
            yield return Wait(2f);
            yield return Shot("blackout");

            // deliveries, quota and the hotline
            foreach (var l in Sim.game.order) l.done = l.need;
            Sim.game.order[0].done = Sim.game.order[0].need - 1;
            var tpe = Sim.game.order[0].type;
            string bay = tpe == "mystery" ? "A" : Cargo.Defs[tpe].Bay;
            var pad = Level.Pads[bay];
            var c = Sim.SpawnCargo(tpe, new Vector3(pad.X, pad.Y + 0.8f, pad.Z));
            c.bay = bay; c.scanned = true; c.heat = 1;
            Teleport(P1, 17.3f, 7.6f, 0);
            yield return Wait(3f);
            Note($"quota met: {Sim.game.quotaMet}, money={Sim.game.money}");
            yield return Shot("quota_hotline");

            Sim.game.timeLeft = 1.5f;
            timeout = 12;
            while (Sim.game.phase != "lobby" && timeout > 0) { timeout -= Time.unscaledDeltaTime; yield return null; }
            yield return Wait(1.5f);
            Note($"report shown: {app.ui.ReportOpen}, phase={Sim.game.phase}");
            yield return Shot("report");
            app.ui.CloseModal(); app.ui.ReportOpen = false;
            yield return Finish();
        }

        static string InputBackend()
        {
#if ENABLE_INPUT_SYSTEM && ENABLE_LEGACY_INPUT_MANAGER
            return "both";
#elif ENABLE_INPUT_SYSTEM
            return "Input System";
#else
            return "legacy Input Manager";
#endif
        }

        IEnumerator Finish()
        {
            frameTimes.Sort();
            float avg = frameTimes.Count > 0 ? frameTimes.Average() : 0;
            float p95 = frameTimes.Count > 0 ? frameTimes[(int)(frameTimes.Count * 0.95f)] : 0;
            var sb = new StringBuilder();
            sb.AppendLine("SHIFT HAPPENS self-test");
            sb.AppendLine($"date: {DateTime.Now:yyyy-MM-dd HH:mm}");
            sb.AppendLine($"errors: {errors}, warnings: {warnings}");
            sb.AppendLine($"fps avg: {(avg > 0 ? 1 / avg : 0):0.0}, 95th percentile frame: {p95 * 1000:0.0} ms");
            sb.AppendLine();
            foreach (var n in notes) sb.AppendLine("- " + n);
            File.WriteAllText(Path.Combine(dir, "summary.txt"), sb.ToString());
            File.WriteAllText(Path.Combine(dir, "console.log"), log.ToString());
            Debug.Log($"[SelfTest] done → {dir}");
            yield return Wait(0.5f);
            app.LeaveToMenu();
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#endif
        }
    }
}
