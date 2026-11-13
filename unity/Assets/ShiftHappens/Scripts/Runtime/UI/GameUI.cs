// All screens: title, main menu + sheets, lobby overlay, shift HUD, world prompts,
// report, pause, toasts. Built with UI Toolkit entirely in code.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace ShiftHappens
{
    public class GameUI
    {
        readonly App app;
        public readonly UIDocument doc;
        VisualElement root, world, screen, modal, toasts;
        public bool ModalOpen => modal.childCount > 0;
        public bool ReportOpen;

        static readonly string[] Tips =
        {
            "Press the big red REQUEST button in the Intake to get cargo — or flip AUTO-FEED on.",
            "Badges tell you where cargo goes: A and B are floor bays in the Dock, C is up on the SKY DOCK.",
            "Belt B stops at the AIRLOCK. Someone has to CYCLE it — people too!",
            "Thermo Beans only ship TOASTED: park them under the heat lamp in the Sorting Hall first.",
            "Mystery boxes reveal their bay when they ride Belt A under the scanner.",
            "The boiler only shows its pressure on the gauge in the Control Room. Somebody go look.",
            "Steel crates are heavy: grab one with a friend, then THROW together to heave it.",
            "Sky Dock routes: the Lift, the Pneumatic Tube, the Updraft Fan or the Magnet.",
            "You can pick up your colleagues. And throw them. HR has been notified.",
            "Big red E-STOP clears a zone's breakdowns instantly — for $25 and four seconds of silence.",
        };
        static readonly Dictionary<string, string> FixHint = new Dictionary<string, string>
        {
            ["jam"] = "Hold USE at the belt service hatch — or slam the zone E-STOP", ["reverse"] = "Flip that belt's direction lever back",
            ["blackout"] = "Reset the MAIN breaker in the Control Room (two hands = faster)", ["sorter"] = "Whack the sorter (hold USE) — or E-STOP the hall",
            ["overheat"] = "Hold USE on it to cool it down", ["flux"] = "Low gravity! Jumps go high, cargo drifts", ["breach"] = "Seal it at either airlock panel",
            ["ducks"] = "Junk on Belt A — feed it to the incinerator", ["surge"] = "Boiler spiking — somebody VENT it!", ["flip"] = "Cores repel. Wait it out or E-STOP the dock",
        };
        static readonly Dictionary<string, Color> CargoCol = new Dictionary<string, Color>
        {
            ["crate"] = K.Hex("#5d7480"), ["wobble"] = Pal.Orange, ["gnome"] = Pal.Blue, ["beans"] = Pal.Yellow, ["balloon"] = K.Hex("#ff7eb6"),
            ["magnet"] = K.Hex("#3f4a52"), ["mystery"] = Pal.Purple, ["duck"] = Pal.Yellow,
        };

        public GameUI(App app, Transform parent)
        {
            this.app = app;
            var go = new GameObject("UI");
            go.transform.SetParent(parent, false);
            var ps = ScriptableObject.CreateInstance<PanelSettings>();
            ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            ps.referenceResolution = new Vector2Int(1600, 900);
            ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            ps.match = 0.5f;
            var theme = Resources.Load<ThemeStyleSheet>("UnityDefaultRuntimeTheme");
            if (theme) ps.themeStyleSheet = theme;
            doc = go.AddComponent<UIDocument>();
            doc.panelSettings = ps;
            root = doc.rootVisualElement;
            UIX.Font(root, UIX.Body);
            world = UIX.Fill(new VisualElement { pickingMode = PickingMode.Ignore, name = "world" });
            screen = UIX.Fill(new VisualElement { pickingMode = PickingMode.Ignore, name = "screen" });
            modal = UIX.Fill(new VisualElement { pickingMode = PickingMode.Ignore, name = "modal" });
            toasts = UIX.Abs(new VisualElement { pickingMode = PickingMode.Ignore }, 16, null, null, 90);
            root.Add(world); root.Add(screen); root.Add(modal); root.Add(toasts);
        }

        // ───────────────────────────── helpers ─────────────────────────────
        void SetScreen(VisualElement e) { screen.Clear(); hudBuilt = null; if (e != null) screen.Add(e); }
        public void CloseModal() { modal.Clear(); modal.pickingMode = PickingMode.Ignore; }

        VisualElement OpenModal(VisualElement content, float width = 620)
        {
            CloseModal();
            var back = UIX.Fill(new VisualElement());
            back.style.backgroundColor = new Color(0.02f, 0.07f, 0.09f, 0.6f);
            back.style.alignItems = Align.Center; back.style.justifyContent = Justify.Center;
            content.style.width = width;
            content.style.maxHeight = new StyleLength(new Length(90, LengthUnit.Percent));
            back.Add(content);
            back.RegisterCallback<PointerDownEvent>(e => { if (e.target == back) { app.audio.Play("ui"); CloseModal(); } });
            modal.Add(back);
            modal.pickingMode = PickingMode.Position;
            return back;
        }

        public void Toast(string text)
        {
            var t = UIX.L(text, UIX.BodyBold, 14);
            t.style.backgroundColor = Pal.Paper;
            UIX.Border(t, 3, Pal.Ink); UIX.Radius(t, 10); UIX.Pad(t, 6, 12);
            t.style.marginTop = 6;
            toasts.Add(t);
            t.schedule.Execute(() => t.RemoveFromHierarchy()).StartingIn(3400);
        }

        VisualElement Logo(float scale = 1)
        {
            var p = new VisualElement();
            p.style.backgroundColor = Pal.Teal;
            UIX.Border(p, 4, Pal.Ink); UIX.Radius(p, 18); UIX.Pad(p, 14 * scale, 24 * scale);
            p.style.rotate = new Rotate(-2.2f);
            p.style.alignSelf = Align.FlexStart;
            var a = UIX.L("SHIFT", UIX.Display, 74 * scale, Pal.Yellow);
            var b = UIX.L("HAPPENS", UIX.Display, 74 * scale, Pal.Paper); b.style.marginLeft = 60 * scale;
            p.Add(a); p.Add(b);
            var tag = UIX.Dymo("PLANT 7 · UNITY", Pal.Red);
            UIX.Abs(tag, null, null, -14, -14); tag.style.rotate = new Rotate(6);
            p.Add(tag);
            return p;
        }

        VisualElement SheetHead(VisualElement plate, string title, string sub)
        {
            plate.Add(UIX.Margin(UIX.HazardBar(), 0, 0, 12, 0));
            plate.Add(UIX.L(title, UIX.Display, 32));
            if (sub != null) plate.Add(UIX.Margin(UIX.Eyebrow(sub), 2, 0, 12, 0));
            return plate;
        }

        TextField Field(string label, string value, int maxLen = 14)
        {
            var f = new TextField(label) { value = value, maxLength = maxLen };
            UIX.Font(f, UIX.Mono);
            f.style.fontSize = 18;
            f.style.marginBottom = 10;
            return f;
        }

        // ───────────────────────────── title & menu ─────────────────────────────
        public void ShowTitle()
        {
            CloseModal();
            var e = UIX.Fill(new VisualElement());
            e.style.alignItems = Align.Center; e.style.justifyContent = Justify.Center;
            e.style.backgroundColor = new Color(0.03f, 0.09f, 0.1f, 0.45f);
            e.Add(Logo());
            var press = UIX.L("PRESS ANY KEY TO CLOCK IN", UIX.Mono, 15, Pal.Paper);
            press.style.marginTop = 30; press.style.letterSpacing = 4;
            press.schedule.Execute(() => press.style.opacity = press.style.opacity.value < 0.5f ? 1 : 0.2f).Every(700);
            e.Add(press);
            e.Add(UIX.Margin(UIX.Eyebrow("A co-op physics comedy for 1–4 workers · keyboard / gamepad", Pal.Paper), 16, 0, 0, 0));
            e.RegisterCallback<PointerDownEvent>(_ => app.OnTitleConfirm());
            SetScreen(e);
        }

        int menuFocus;
        readonly List<Button> menuRows = new List<Button>();
        Action[] menuActs;

        public void ShowMenu()
        {
            CloseModal();
            var e = UIX.Fill(new VisualElement());
            e.style.flexDirection = FlexDirection.Row; e.style.justifyContent = Justify.SpaceBetween;
            UIX.Pad(e, 50, 70);
            var left = UIX.Col();
            left.Add(Logo());
            var tag = UIX.L("Plant 7 sorts, ships and occasionally launches the world's strangest cargo. Run the belts, vent the boiler, catch the gnomes — together. Things will go wrong. That's the job.", UIX.Body, 16, Pal.Paper, true);
            tag.style.maxWidth = 470; tag.style.marginTop = 30;
            tag.style.backgroundColor = new Color(0.04f, 0.13f, 0.16f, 0.85f);
            UIX.Pad(tag, 12, 16); UIX.Radius(tag, 8);
            tag.style.borderLeftWidth = 6; tag.style.borderLeftColor = Pal.Yellow;
            left.Add(tag);
            e.Add(left);

            var plate = UIX.Plate();
            plate.style.width = 420; plate.style.alignSelf = Align.Center;
            var head = UIX.Row(); head.style.justifyContent = Justify.SpaceBetween; head.style.marginBottom = 10;
            head.Add(UIX.Dymo("SHIFT CONTROL"));
            plate.Add(head);
            plate.Add(UIX.Margin(UIX.HazardBar(), 0, 0, 10, 0));
            menuRows.Clear();
            var items = new (string lbl, string sub, Action act)[]
            {
                ("START SHIFT", "Solo, couch co-op or host online", ShowStartSheet),
                ("JOIN FRIENDS", "Got an address or code?", ShowJoinSheet),
                ("EMPLOYEE RECORDS", "Your glorious history", ShowRecords),
                ("SETTINGS", "Volume, graphics, controls", ShowSettings),
                ("QUIT", "Clock out (if you dare)", ShowQuit),
            };
            menuActs = items.Select(i => i.act).ToArray();
            for (int i = 0; i < items.Length; i++)
            {
                int idx = i;
                var b = new Button(() => PickMenu(idx)) { text = "" };
                b.style.backgroundColor = Color.clear;
                UIX.Border(b, 0, Color.clear); UIX.Radius(b, 10); UIX.Pad(b, 8, 10);
                b.style.flexDirection = FlexDirection.Row; b.style.alignItems = Align.Center;
                var toggle = new VisualElement();
                toggle.style.width = 70; toggle.style.height = 42; toggle.style.backgroundColor = K.Hex("#46525a");
                UIX.Border(toggle, 3, Pal.Ink); UIX.Radius(toggle, 10);
                var knob = new VisualElement { name = "knob" };
                knob.style.width = 24; knob.style.height = 24; UIX.Radius(knob, 12); knob.style.backgroundColor = Pal.Red;
                UIX.Border(knob, 2, Pal.Ink); UIX.Abs(knob, 10, 6);
                toggle.Add(knob);
                b.Add(toggle);
                var txt = UIX.Col(); txt.style.marginLeft = 14;
                txt.Add(UIX.L(items[i].lbl, UIX.Display, 24));
                txt.Add(UIX.Eyebrow(items[i].sub));
                b.Add(txt);
                b.RegisterCallback<MouseEnterEvent>(_ => FocusMenu(idx));
                plate.Add(b);
                menuRows.Add(b);
            }
            var foot = UIX.Row(); foot.style.justifyContent = Justify.SpaceBetween; foot.style.marginTop = 12;
            foot.Add(UIX.Dymo($"LEDGER {UIX.Money(app.records.total)}", Pal.TealDeep));
            foot.Add(UIX.Dymo($"SHIFTS {app.records.worked}"));
            plate.Add(foot);
            e.Add(plate);
            SetScreen(e);
            FocusMenu(0);
        }

        void FocusMenu(int i)
        {
            if (menuFocus != i) app.audio.Play("ui");
            menuFocus = i;
            for (int k = 0; k < menuRows.Count; k++)
            {
                menuRows[k].style.backgroundColor = k == i ? new Color(0, 0, 0, 0.08f) : Color.clear;
                var knob = menuRows[k].Q("knob");
                if (knob != null) knob.style.left = k == i ? 22 : 10;
            }
        }

        void PickMenu(int i)
        {
            FocusMenu(i);
            var knob = menuRows[i].Q("knob");
            if (knob != null) { knob.style.left = 36; knob.style.backgroundColor = Pal.Green; }
            app.audio.Play("lever");
            menuRows[i].schedule.Execute(() => { if (knob != null) knob.style.backgroundColor = Pal.Red; menuActs[i](); }).StartingIn(240);
        }

        public void MenuKeys(GameInput input)
        {
            if (ModalOpen || menuRows.Count == 0 || menuRows[0].panel == null) return;
            if (input.Pressed("down")) FocusMenu((menuFocus + 1) % menuRows.Count);
            else if (input.Pressed("up")) FocusMenu((menuFocus + menuRows.Count - 1) % menuRows.Count);
            else if (input.Pressed("confirm")) PickMenu(menuFocus);
        }

        // ───────────────────────────── sheets ─────────────────────────────
        VisualElement Choice(string title, string desc, Action act)
        {
            var c = new Button(act) { text = "" };
            c.style.flexDirection = FlexDirection.Column; c.style.alignItems = Align.FlexStart;
            c.style.backgroundColor = K.Hex("#fffaf0");
            UIX.Border(c, 3, Pal.Ink); c.style.borderBottomWidth = 6; UIX.Radius(c, 12); UIX.Pad(c, 14, 14);
            c.style.flexGrow = 1; c.style.flexBasis = 0; c.style.marginLeft = 4; c.style.marginRight = 4;
            c.Add(UIX.L(title, UIX.Display, 19));
            var d = UIX.L(desc, UIX.Body, 13, null, true); d.style.marginTop = 6; c.Add(d);
            return c;
        }

        void ShowStartSheet()
        {
            var plate = SheetHead(UIX.Plate(), "START A SHIFT", "Pick how your crew clocks in");
            var name = Field("Badge name", Settings.Name);
            name.RegisterValueChangedCallback(ev => { Settings.Name = ev.newValue.Trim(); });
            plate.Add(name);
            var row = UIX.Row(); row.style.alignItems = Align.Stretch; row.style.marginTop = 6;
            var err = UIX.Eyebrow(""); err.style.color = Pal.Red; err.style.marginTop = 8;
            row.Add(Choice("SOLO / COUCH", "Runs on this computer. Friends join on the same keyboard (arrow keys: ENTER) or with gamepads (START) in the break room.", () => { CloseModal(); app.StartLocal(); }));
            row.Add(Choice("HOST (LAN)", $"Friends on your network join with your address {App.LocalIp()} — port {NetBridge.DefaultPort}.", () => { if (app.HostLan()) CloseModal(); else err.text = "Could not open the port. Is another copy running?"; }));
            row.Add(Choice("HOST (INTERNET)", "Unity Relay: friends join with a 6-letter code, no port forwarding. Needs SH_RELAY + Unity Cloud project.", async () =>
            {
                err.text = "Calling the relay…";
                var msg = await app.HostRelay();
                if (msg == null) CloseModal(); else err.text = msg;
            }));
            plate.Add(row);
            plate.Add(err);
            var back = UIX.Btn("BACK", CloseModal, Pal.Steel, null, 14); back.style.alignSelf = Align.FlexEnd; back.style.marginTop = 10;
            plate.Add(back);
            OpenModal(plate, 760);
        }

        void ShowJoinSheet()
        {
            var plate = SheetHead(UIX.Plate(), "JOIN FRIENDS", "LAN address of the host, or an internet code");
            var name = Field("Badge name", Settings.Name);
            name.RegisterValueChangedCallback(ev => Settings.Name = ev.newValue.Trim());
            plate.Add(name);
            var addr = Field("Host address (e.g. 192.168.1.20)", Settings.LastAddress, 64);
            plate.Add(addr);
            var code = Field("…or Relay code", "", 8);
            plate.Add(code);
            var err = UIX.Eyebrow(""); err.style.color = Pal.Red;
            plate.Add(err);
            var row = UIX.Row(); row.style.justifyContent = Justify.SpaceBetween; row.style.marginTop = 10;
            row.Add(UIX.Btn("BACK", CloseModal, Pal.Steel, null, 14));
            row.Add(UIX.Btn("CLOCK IN →", async () =>
            {
                if (!string.IsNullOrWhiteSpace(code.value))
                {
                    err.text = "Knocking on the relay…";
                    var msg = await app.JoinRelay(code.value);
                    if (msg == null) CloseModal(); else err.text = msg;
                    return;
                }
                Settings.LastAddress = addr.value.Trim();
                err.text = "Knocking on the door…";
                if (app.JoinLan(addr.value)) CloseModal(); else err.text = "Could not start the connection.";
            }));
            plate.Add(row);
            OpenModal(plate, 600);
        }

        void ShowRecords()
        {
            var r = app.records;
            var plate = SheetHead(UIX.Plate(), "EMPLOYEE RECORDS", "Personnel file — do not show HR");
            var stats = UIX.Row();
            foreach (var (v, l) in new[] { (r.worked.ToString(), "Shifts worked"), (UIX.Money(r.total), "Lifetime earnings"), (UIX.Money(r.best), "Best shift") })
                stats.Add(Stat(v, l));
            plate.Add(stats);
            plate.Add(UIX.Margin(UIX.Eyebrow("Commendations"), 16, 0, 6, 0));
            if (r.awards.Count == 0) plate.Add(UIX.L("No awards yet. Get out there and break something (on purpose).", UIX.Body, 14, null, true));
            else { var row = UIX.Row(); row.style.flexWrap = Wrap.Wrap; foreach (var a in r.awards) row.Add(UIX.Margin(UIX.Dymo($"{a.title} ×{a.n}", Pal.Yellow, Pal.Ink), 0, 6, 6, 0)); plate.Add(row); }
            plate.Add(UIX.Margin(UIX.Eyebrow("Recent shifts"), 16, 0, 6, 0));
            if (r.shifts.Count == 0) plate.Add(UIX.L("Your file is suspiciously empty.", UIX.Body, 14));
            foreach (var s in r.shifts)
            {
                var row = UIX.Row(); row.style.justifyContent = Justify.SpaceBetween;
                row.Add(UIX.L(new DateTime(s.date).ToShortDateString(), UIX.Mono, 13)); row.Add(UIX.L(s.contract ?? "", UIX.Mono, 13)); row.Add(UIX.L(s.result ?? "", UIX.Mono, 13)); row.Add(UIX.L(UIX.Money(s.total), UIX.Mono, 13));
                plate.Add(row);
            }
            var close = UIX.Btn("CLOSE", CloseModal, Pal.Steel, null, 14); close.style.alignSelf = Align.FlexEnd; close.style.marginTop = 12;
            plate.Add(close);
            OpenModal(plate, 640);
        }

        VisualElement Stat(string value, string label)
        {
            var s = UIX.Col();
            s.style.flexGrow = 1; s.style.alignItems = Align.Center; s.style.backgroundColor = K.Hex("#fffaf0");
            UIX.Border(s, 2, Pal.Ink); UIX.Radius(s, 8); UIX.Pad(s, 8, 8); UIX.Margin(s, 0, 4, 0, 4);
            s.Add(UIX.L(value, UIX.Display, 24)); s.Add(UIX.Eyebrow(label));
            return s;
        }

        public void ShowSettings()
        {
            var plate = SheetHead(UIX.Plate(), "SETTINGS", "Maintenance panel");
            foreach (var (label, get, set) in new (string, Func<float>, Action<float>)[]
            {
                ("Master", () => Settings.Master, v => Settings.Master = v), ("Music", () => Settings.Music, v => Settings.Music = v), ("Effects", () => Settings.Sfx, v => Settings.Sfx = v),
            })
            {
                var s = new Slider(label, 0, 1) { value = get() };
                UIX.Font(s, UIX.Mono);
                s.RegisterValueChangedCallback(ev => { set(ev.newValue); Settings.Save(); });
                s.style.marginBottom = 8;
                plate.Add(s);
            }
            var q = UIX.Row(); q.Add(UIX.Margin(UIX.Eyebrow("Graphics"), 0, 12, 0, 0));
            foreach (var level in new[] { "low", "medium", "high" })
            {
                string lv = level;
                var b = UIX.Btn(lv.ToUpperInvariant(), () => { Settings.Quality = lv; Settings.Save(); app.ApplyQuality(); app.audio.Play("lever"); CloseModal(); ShowSettings(); }, Settings.Quality == lv ? Pal.Yellow : K.Hex("#fffaf0"), null, 13);
                b.style.marginRight = 6; q.Add(b);
            }
            plate.Add(q);
            var sh = UIX.Row(); sh.style.marginTop = 10; sh.Add(UIX.Margin(UIX.Eyebrow("Camera shake"), 0, 12, 0, 0));
            sh.Add(UIX.Btn(Settings.Shake ? "ON" : "OFF", () => { Settings.Shake = !Settings.Shake; Settings.Save(); CloseModal(); ShowSettings(); }, Settings.Shake ? Pal.Yellow : K.Hex("#fffaf0"), null, 13));
            plate.Add(sh);
            plate.Add(UIX.Margin(UIX.Eyebrow("Controls"), 16, 0, 6, 0));
            plate.Add(UIX.L("WASD move · SHIFT run · SPACE jump · E grab/drop · F use (hold) · Q throw/heave/shove\nCouch P2: arrows · R-SHIFT · ENTER · . / ,   Gamepad: stick · RT · A · X · B · Y", UIX.Mono, 12, null, true));
            var done = UIX.Btn("DONE", CloseModal, null, null, 14); done.style.alignSelf = Align.FlexEnd; done.style.marginTop = 12;
            plate.Add(done);
            OpenModal(plate, 640);
        }

        void ShowQuit()
        {
            var plate = SheetHead(UIX.Plate("yellow"), "CLOCK OUT?", "Form 99-B: Voluntary Departure");
            plate.Add(UIX.L("Are you sure? The boiler will miss you. The gnomes will not.", UIX.Body, 15, null, true));
            var row = UIX.Row(); row.style.justifyContent = Justify.SpaceBetween; row.style.marginTop = 14;
            row.Add(UIX.Btn("KEEP WORKING", CloseModal, Pal.Steel));
            row.Add(UIX.Btn("GO HOME", () => app.Quit(), Pal.Red, Color.white));
            plate.Add(row);
            OpenModal(plate, 520);
        }

        public void ShowLocker()
        {
            var o = Settings.Outfit;
            var plate = SheetHead(UIX.Plate(), "LOCKER ROOM", "Choose your worker");
            var name = Field("Badge name", Settings.Name);
            name.RegisterValueChangedCallback(ev => { Settings.Name = ev.newValue.Trim(); app.SendName(Settings.Name); });
            plate.Add(name);
            plate.Add(UIX.Margin(UIX.Eyebrow("Worker"), 6, 0, 6, 0));
            var grid = UIX.Row(); grid.style.flexWrap = Wrap.Wrap;
            foreach (var m in K.Models)
            {
                string mm = m;
                var b = UIX.Btn(m.ToUpperInvariant(), () => { o.model = mm; Apply(); }, o.model == m ? Pal.Yellow : K.Hex("#fffaf0"), null, 11);
                UIX.Pad(b, 5, 8); b.style.marginRight = 5; b.style.marginBottom = 5;
                grid.Add(b);
            }
            plate.Add(grid);
            plate.Add(UIX.Margin(UIX.Eyebrow("Team colour"), 8, 0, 6, 0));
            var sw = UIX.Row();
            foreach (var c in K.OutfitColors)
            {
                string cc = c;
                var b = new Button(() => { o.color = cc; Apply(); }) { text = "" };
                b.style.width = 38; b.style.height = 38; b.style.backgroundColor = K.Hex(c);
                UIX.Border(b, o.color == c ? 5 : 3, o.color == c ? Pal.Yellow : Pal.Ink); UIX.Radius(b, 10); b.style.marginRight = 6;
                sw.Add(b);
            }
            plate.Add(sw);
            plate.Add(UIX.Margin(UIX.Eyebrow("Headwear"), 10, 0, 6, 0));
            var hats = UIX.Row();
            foreach (var h in K.Hats)
            {
                string hh = h;
                var b = UIX.Btn(h == "none" ? "OWN LOOK" : h.ToUpperInvariant(), () => { o.hat = hh; Apply(); }, o.hat == h ? Pal.Yellow : K.Hex("#fffaf0"), null, 12);
                b.style.marginRight = 6; hats.Add(b);
            }
            plate.Add(hats);
            plate.Add(UIX.Margin(UIX.L("Tip: the lockers in the break room work too — walk up and press USE.", UIX.Body, 12, null, true), 10, 0, 0, 0));
            var done = UIX.Btn("LOOKING GOOD", CloseModal); done.style.alignSelf = Align.FlexEnd; done.style.marginTop = 10;
            plate.Add(done);
            OpenModal(plate, 760);

            void Apply()
            {
                Settings.Outfit = o; Settings.Save();
                app.audio.Play("locker");
                app.SendOutfit(o);
                CloseModal(); ShowLocker();
            }
        }

        public void ShowPause(bool lobby)
        {
            var plate = SheetHead(UIX.Plate(), app.session != null && app.session.isLocal ? "TEA BREAK" : "QUICK BREAK", app.session != null && app.session.isLocal ? "The plant is paused" : "Online: the plant keeps running!");
            var col = UIX.Col();
            col.Add(UIX.Margin(UIX.Btn("BACK TO WORK", () => app.TogglePause()), 0, 0, 8, 0));
            if (lobby) col.Add(UIX.Margin(UIX.Btn("LOCKER ROOM", () => { app.TogglePause(); ShowLocker(); }, Pal.Steel), 0, 0, 8, 0));
            col.Add(UIX.Margin(UIX.Btn("SETTINGS", () => { app.TogglePause(); ShowSettings(); }, Pal.Steel), 0, 0, 8, 0));
            col.Add(UIX.Btn("LEAVE SHIFT", () => app.LeaveToMenu(), Pal.Red, Color.white));
            plate.Add(col);
            OpenModal(plate, 440);
        }

        // ───────────────────────────── lobby + HUD ─────────────────────────────
        string hudBuilt;
        Label codeLabel, statusLabel, bannerBig, bannerSmall, phaseLabel, multLabel, tipLabel;
        VisualElement roster, contractPaper, manifestPaper, alerts, hotline, tipBar, bannerBox;
        BulbBoard timeBoard, moneyBoard;
        string rosterKey, contractKey, manifestKey, alertKey;
        float shownMoney, tipT, bannerT;
        int tipI;
        readonly List<(string key, string text, string cls, float life)> transient = new List<(string, string, string, float)>();

        public void BuildLobby()
        {
            var e = UIX.Fill(new VisualElement { pickingMode = PickingMode.Ignore });
            var codePlate = UIX.Abs(UIX.Plate("dark"), 16, 16);
            codePlate.Add(UIX.Eyebrow(app.session.isLocal ? "THIS COMPUTER" : "JOIN ADDRESS / CODE — SHARE IT", Pal.Yellow));
            codeLabel = UIX.L(app.session.isLocal ? "COUCH SHIFT" : app.ShareCode, UIX.Display, 34, Pal.Paper);
            codePlate.Add(codeLabel);
            var btns = UIX.Row(); btns.style.marginTop = 10;
            btns.Add(UIX.Margin(UIX.Btn("LOCKER", ShowLocker, null, null, 13), 0, 8, 0, 0));
            btns.Add(UIX.Btn("LEAVE", () => app.LeaveToMenu(), Pal.Steel, null, 13));
            codePlate.Add(btns);
            e.Add(codePlate);
            roster = UIX.Abs(UIX.Row(), null, 16, 16); e.Add(roster);
            var board = UIX.Clipboard(out contractPaper);
            board.style.width = 380;
            UIX.Abs(board, 16, null, null, 16);
            e.Add(board);
            var help = UIX.Abs(UIX.Plate(), null, null, 16, 16);
            help.style.width = 330;
            help.Add(UIX.Dymo("HOW TO WORK HERE"));
            var keys = GameInput.KeysFor(app.session.local.Count > 0 ? app.session.local[0].device : "kb1");
            foreach (var (k, d) in new[] { (keys[0], "Move"), (keys[2], "Jump"), (keys[3], "Grab / drop (also friends)"), (keys[4], "Use machines (hold to repair)"), (keys[5], "Throw / heave / shove"), (keys[1], "Run") })
            { var r = UIX.Row(); r.style.marginTop = 6; r.Add(UIX.Key(k)); r.Add(UIX.Margin(UIX.L(d, UIX.Body, 13), 0, 0, 0, 8)); help.Add(r); }
            help.Add(UIX.Margin(UIX.L("Pick a contract on the cork board, sign risky riders on the red wall for more pay, then everyone PUNCH IN at the time clock." + (app.session.isLocal ? "\nCouch co-op: ENTER (arrow keys) or START (gamepad) adds a worker." : ""), UIX.Body, 12, null, true), 10, 0, 0, 0));
            e.Add(help);
            statusLabel = UIX.L("", UIX.Mono, 13, Pal.Paper);
            statusLabel.style.backgroundColor = Pal.Ink; UIX.Border(statusLabel, 3, Pal.Yellow); UIX.Radius(statusLabel, 12); UIX.Pad(statusLabel, 10, 18);
            var statusWrap = UIX.Abs(new VisualElement { pickingMode = PickingMode.Ignore }, 0, null, 0, 18);
            statusWrap.style.alignItems = Align.Center; statusWrap.Add(statusLabel);
            e.Add(statusWrap);
            AddBanner(e);
            SetScreen(e);
            hudBuilt = "lobby";
            rosterKey = contractKey = null;
        }

        void AddBanner(VisualElement e)
        {
            bannerBox = UIX.Abs(new VisualElement { pickingMode = PickingMode.Ignore }, 0, 140, 0);
            bannerBox.style.alignItems = Align.Center;
            bannerBig = UIX.L("", UIX.Display, 84, Pal.Yellow);
            bannerSmall = UIX.L("", UIX.Display, 24, Pal.Paper);
            bannerBox.Add(bannerBig); bannerBox.Add(bannerSmall);
            e.Add(bannerBox);
        }

        public void Banner(string big, string small, float secs = 2.4f) { if (bannerBig == null) return; bannerBig.text = big; bannerSmall.text = small ?? ""; bannerT = secs; }

        void UpdateLobby(Snapshot st)
        {
            var g = st.game;
            var mine = app.session.LocalIds();
            string rk = string.Join("|", st.pl.Select(p => $"{p.id}{p.name}{p.ready}{p.connected}{p.outfit.color}{p.outfit.model}"));
            if (rk != rosterKey)
            {
                rosterKey = rk;
                roster.Clear();
                foreach (var p in st.pl)
                {
                    var card = new VisualElement();
                    card.style.width = 150; card.style.backgroundColor = Pal.Paper; card.style.marginLeft = 10;
                    UIX.Border(card, 3, Pal.Ink); UIX.Radius(card, 12); UIX.Pad(card, 8, 10);
                    var sw = new VisualElement(); sw.style.height = 64; sw.style.backgroundColor = K.Hex(p.outfit.color); UIX.Radius(sw, 8); UIX.Border(sw, 2, Pal.Ink);
                    sw.style.alignItems = Align.Center; sw.style.justifyContent = Justify.Center;
                    sw.Add(UIX.L(p.outfit.model.ToUpperInvariant(), UIX.Mono, 11, Color.white));
                    card.Add(sw);
                    if (mine.Contains(p.id))
                    {
                        var you = UIX.Dymo(mine.Count > 1 ? $"P{mine.IndexOf(p.id) + 1}" : "YOU", Pal.Yellow, Pal.Ink, 11);
                        UIX.Abs(you, -6, -10); you.style.rotate = new Rotate(-6); card.Add(you);
                        if (mine.IndexOf(p.id) > 0) { int pid = p.id; var x = UIX.Btn("✕", () => app.session.RemoveLocal(pid), Pal.Red, Color.white, 11); UIX.Pad(x, 2, 6); UIX.Abs(x, null, -10, -10); card.Add(x); }
                    }
                    card.Add(UIX.Margin(UIX.L(p.name, UIX.Display, 15), 6, 0, 4, 0));
                    card.Add(!p.connected ? UIX.Dymo("RECONNECTING") : p.ready ? UIX.Dymo("✓ PUNCHED IN", Pal.TealDeep) : UIX.Dymo("NOT READY", K.Hex("#a8231f")));
                    roster.Add(card);
                }
            }
            var c = g.contracts != null && g.sel < g.contracts.Count ? g.contracts[g.sel] : null;
            string ck = c == null ? "" : c.name + g.mult + string.Join("", g.riders.Values) + g.ledger;
            if (c != null && ck != contractKey)
            {
                contractKey = ck;
                contractPaper.Clear();
                var top = UIX.Row(); top.style.justifyContent = Justify.SpaceBetween;
                var tl = UIX.Col(); tl.Add(UIX.L(c.name, UIX.Display, 22)); tl.Add(UIX.L("for " + c.client, UIX.Mono, 12));
                top.Add(tl);
                var hz = UIX.Row(); for (int i = 0; i < 4; i++) { var d = new VisualElement(); d.style.width = 12; d.style.height = 12; d.style.marginLeft = 3; d.style.rotate = new Rotate(45); d.style.backgroundColor = i <= c.hazard ? Pal.Orange : Color.white; UIX.Border(d, 2, Pal.Ink); hz.Add(d); }
                top.Add(hz);
                contractPaper.Add(top);
                contractPaper.Add(UIX.Margin(UIX.L(c.blurb, UIX.Body, 13, null, true), 6, 0, 6, 0));
                foreach (var l in c.lines) contractPaper.Add(OrderRow(l.type, $"×{l.need}", false));
                var meta = UIX.Row(); meta.style.marginTop = 8; meta.style.flexWrap = Wrap.Wrap;
                meta.Add(UIX.Margin(UIX.Dymo($"⏱ {UIX.Clock(c.time * (g.riders["rush"] ? 0.7f : 1))}"), 0, 6, 4, 0));
                meta.Add(UIX.Margin(UIX.Dymo($"BONUS {UIX.Money(Mathf.RoundToInt(c.bonus * g.mult))}", Pal.TealDeep), 0, 6, 4, 0));
                meta.Add(UIX.Margin(UIX.Dymo($"PAY ×{g.mult:0.00}", K.Hex("#a8231f")), 0, 6, 4, 0));
                contractPaper.Add(meta);
                var rid = UIX.Row(); rid.style.flexWrap = Wrap.Wrap;
                foreach (var r in Riders.All) { bool on = g.riders[r.Id]; rid.Add(UIX.Margin(UIX.Dymo(r.Name + (on ? " ✓" : ""), on ? Pal.Red : new Color(0, 0, 0, 0.15f), on ? Color.white : new Color(0, 0, 0, 0.5f), 10), 0, 6, 4, 0)); }
                contractPaper.Add(rid);
                contractPaper.Add(UIX.Margin(UIX.Eyebrow($"Contract {g.sel + 1} of {g.contracts.Count} · company ledger {UIX.Money(g.ledger)}"), 6, 0, 0, 0));
            }
            int ready = st.pl.Count(p => p.ready), total = st.pl.Count(p => p.connected);
            statusLabel.parent.style.display = g.phase == "countdown" ? DisplayStyle.None : DisplayStyle.Flex;
            statusLabel.text = $"⏰ {ready}/{total} PUNCHED IN — walk to the TIME CLOCK by the door and press USE";
            if (g.phase == "countdown") { bannerBig.text = Mathf.CeilToInt(g.countdown).ToString(); bannerSmall.text = "SHIFT STARTS IN"; bannerT = 0.2f; }
        }

        VisualElement OrderRow(string type, string count, bool done)
        {
            var r = UIX.Row(); r.style.height = 28;
            var ic = new VisualElement(); ic.style.width = 22; ic.style.height = 22; UIX.Radius(ic, 6); UIX.Border(ic, 2, Pal.Ink);
            ic.style.backgroundColor = CargoCol.TryGetValue(type, out var cc) ? cc : Color.gray;
            r.Add(ic);
            var def = Cargo.Defs[type];
            var name = UIX.L(def.Short, UIX.BodyBold, 14); name.style.marginLeft = 8; r.Add(name);
            var bay = UIX.Dymo(type == "mystery" ? "SCAN" : def.Bay, Bays.ColorOf(type == "mystery" ? "?" : def.Bay), Color.white, 10); UIX.Pad(bay, 1, 5); bay.style.marginLeft = 6; r.Add(bay);
            var sp = new VisualElement(); sp.style.flexGrow = 1; r.Add(sp);
            r.Add(UIX.L(count + (done ? " ✓" : ""), UIX.Mono, 14));
            if (done) r.style.opacity = 0.5f;
            return r;
        }

        public void BuildShift()
        {
            var e = UIX.Fill(new VisualElement { pickingMode = PickingMode.Ignore });
            var man = UIX.Clipboard(out manifestPaper);
            man.style.width = 280; UIX.Abs(man, 16, 16);
            e.Add(man);
            var clock = UIX.Abs(new VisualElement { pickingMode = PickingMode.Ignore }, 0, 12, 0);
            clock.style.alignItems = Align.Center;
            timeBoard = new BulbBoard("TIME LEFT", 4, true, 7f);
            clock.Add(timeBoard);
            phaseLabel = UIX.L("", UIX.Display, 14, Pal.Paper); phaseLabel.style.marginTop = 4;
            clock.Add(phaseLabel);
            e.Add(clock);
            var wallet = UIX.Abs(UIX.Col(), null, 16, 16); wallet.style.alignItems = Align.FlexEnd;
            moneyBoard = new BulbBoard("EARNINGS", 6, false, 6f);
            wallet.Add(moneyBoard);
            multLabel = UIX.Dymo("PAY ×1.00", K.Hex("#a8231f")); multLabel.style.marginTop = 6; multLabel.style.alignSelf = Align.FlexEnd;
            wallet.Add(multLabel);
            e.Add(wallet);
            alerts = UIX.Abs(UIX.Col(), null, 130, 16); alerts.style.alignItems = Align.FlexEnd; alerts.style.width = 420;
            e.Add(alerts);
            hotline = UIX.Abs(new VisualElement { pickingMode = PickingMode.Ignore }, 0, null, 0, 22); hotline.style.alignItems = Align.Center;
            e.Add(hotline);
            tipBar = UIX.Abs(UIX.Row(), 0, null, 0, 18); tipBar.style.justifyContent = Justify.Center;
            var tipInner = UIX.Row(); tipInner.style.backgroundColor = new Color(0.1f, 0.12f, 0.14f, 0.88f); UIX.Radius(tipInner, 12); UIX.Pad(tipInner, 8, 12);
            tipInner.Add(UIX.Dymo("SAFETY TIP", Pal.Yellow, Pal.Ink, 10));
            tipLabel = UIX.L("", UIX.Body, 13, Pal.Paper, true); tipLabel.style.marginLeft = 10; tipLabel.style.maxWidth = 620;
            tipInner.Add(tipLabel); tipBar.Add(tipInner);
            e.Add(tipBar);
            AddBanner(e);
            SetScreen(e);
            hudBuilt = "shift";
            manifestKey = alertKey = null;
            shownMoney = 0;
            tipT = 0;
        }

        void UpdateShift(Snapshot st, float dt)
        {
            var g = st.game; var pl = st.plant;
            string mk = string.Join(",", g.order.Select(l => l.type + l.done + l.need)) + "|" + string.Join(",", g.otOrder.Select(l => l.type + l.done + l.need)) + g.overtime + g.otDone + g.quotaMet;
            if (mk != manifestKey)
            {
                manifestKey = mk;
                manifestPaper.Clear();
                var t = UIX.Row(); t.style.justifyContent = Justify.SpaceBetween;
                t.Add(UIX.L(g.contractName ?? "ORDER", UIX.Display, 15));
                if (g.quotaMet) t.Add(UIX.Dymo("QUOTA MET", Pal.TealDeep, null, 10));
                manifestPaper.Add(t);
                foreach (var l in g.order) manifestPaper.Add(OrderRow(l.type, $"{Mathf.Min(l.done, l.need)}/{l.need}", l.done >= l.need));
                if (g.overtime > 0)
                {
                    manifestPaper.Add(UIX.Margin(UIX.Dymo($"OVERTIME #{g.overtime}" + (g.otDone ? " ✓" : ""), K.Hex("#a8231f")), 6, 0, 2, 0));
                    foreach (var l in g.otOrder) manifestPaper.Add(OrderRow(l.type, $"{Mathf.Min(l.done, l.need)}/{l.need}", l.done >= l.need));
                }
            }
            float tl = g.timeLeft;
            bool blink = tl < 10 && g.phase == "shift" && Mathf.FloorToInt(Time.unscaledTime / 0.28f) % 2 == 1;
            timeBoard.Set(UIX.Clock(tl), tl < 30 ? K.Hex("#ff4a3d") : K.Hex("#ffb02e"), blink);
            phaseLabel.text = g.phase == "ending" ? "SHIFT OVER" : g.overtime > 0 ? (g.otDone ? $"OVERTIME #{g.overtime} DONE" : $"OVERTIME #{g.overtime}") : g.quotaMet ? "QUOTA MET — BONUS TIME" : "";
            float diff = g.money - shownMoney;
            if (Mathf.Abs(diff) > 0.5f) shownMoney += Mathf.Abs(diff) < 2 ? diff : Mathf.Sign(diff) * Mathf.Max(1, Mathf.Ceil(Mathf.Abs(diff) * Mathf.Min(1, dt * 9)));
            int m = Mathf.RoundToInt(shownMoney);
            moneyBoard.Set(m < 0 ? "-$" + (-m) : "$" + m, m < 0 ? K.Hex("#ff4a3d") : K.Hex("#5cf07a"));
            multLabel.text = $"PAY ×{g.mult:0.00}";

            var items = new List<(string key, string text, string hint, bool red)>();
            foreach (var inc in pl.inc) items.Add(("i" + inc.id, inc.text + (inc.dur > 0 ? $" ({Mathf.CeilToInt(inc.dur - inc.t)}s)" : ""), FixHint.TryGetValue(inc.kind, out var h) ? h : "", inc.kind == "blackout" || inc.kind == "breach"));
            if (pl.P > 85) items.Add(("p", "BOILER PRESSURE CRITICAL", "Get to the Control Room and VENT the boiler!", true));
            for (int i = transient.Count - 1; i >= 0; i--) { var tr = transient[i]; tr.life -= dt; if (tr.life <= 0) transient.RemoveAt(i); else transient[i] = tr; }
            foreach (var tr in transient) items.Add((tr.key, tr.text, "", tr.cls == "red"));
            string ak = string.Join("|", items.Select(i => i.key + i.text));
            if (ak != alertKey)
            {
                alertKey = ak;
                alerts.Clear();
                foreach (var it in items.Take(5))
                {
                    var a = UIX.Row(); a.style.backgroundColor = it.red ? K.Hex("#a8231f") : Pal.Ink; UIX.Border(a, 3, Pal.Ink); UIX.Radius(a, 10); a.style.marginBottom = 7; a.style.maxWidth = 420;
                    var stripe = new VisualElement(); stripe.style.width = 22; stripe.style.alignSelf = Align.Stretch; stripe.style.backgroundImage = new StyleBackground(Background.FromTexture2D(UIX.HazardTex)); a.Add(stripe);
                    var col = UIX.Col(); UIX.Pad(col, 5, 10);
                    col.Add(UIX.L("⚠ " + it.text, UIX.Display, 13, it.red ? Color.white : Pal.Yellow, true));
                    if (!string.IsNullOrEmpty(it.hint)) col.Add(UIX.L(it.hint, UIX.Mono, 10, Pal.Paper, true));
                    a.Add(col);
                    alerts.Add(a);
                }
            }
            bool showHot = g.ring && g.phase == "shift";
            if (showHot && hotline.childCount == 0)
            {
                var hb = UIX.Row(); hb.style.backgroundColor = Pal.Yellow; UIX.Border(hb, 4, Pal.Ink); UIX.Radius(hb, 16); UIX.Pad(hb, 12, 20);
                hb.Add(UIX.L("☎", UIX.Body, 34));
                var c = UIX.Col(); c.style.marginLeft = 12;
                c.Add(UIX.L("THE FOREMAN IS CALLING", UIX.Display, 20));
                c.Add(UIX.L("Quota met. Go to the HOTLINE in the Shipping Dock: pull CLOCK OUT to bank it, or OVERTIME for ×1.5 pay — fail overtime and half the quota bonus is clawed back. Discuss!", UIX.Body, 13, null, true));
                c.style.maxWidth = 460;
                hb.Add(c); hotline.Add(hb);
                hb.schedule.Execute(() => hb.style.rotate = new Rotate(Mathf.Sin(Time.unscaledTime * 12) * 1.2f)).Every(30);
            }
            else if (!showHot && hotline.childCount > 0) hotline.Clear();
            tipT -= dt;
            if (tipT <= 0) { tipT = 11; tipI = (tipI + 1) % Tips.Length; tipLabel.text = Tips[tipI]; }
            tipBar.style.display = showHot || g.phase != "shift" ? DisplayStyle.None : DisplayStyle.Flex;
            if (g.phase == "ending") { bannerBig.text = g.result == "QUOTA MISSED" || g.result == "OVERTIME BUST" ? "WHISTLE!" : "CLOCKED OUT!"; bannerSmall.text = g.result ?? ""; bannerT = 0.2f; }
        }

        public void PushAlert(string text, bool red = false, float life = 4) { transient.Add(("t" + UnityEngine.Random.value, text, red ? "red" : "", life)); if (transient.Count > 3) transient.RemoveAt(0); }

        // ───────────────────────────── world-anchored prompts ─────────────────────────────
        readonly Dictionary<int, (VisualElement tag, Label name, VisualElement prompt, string key)> tags = new Dictionary<int, (VisualElement, Label, VisualElement, string)>();
        readonly List<(Label l, Vector3 pos, float life)> floaties = new List<(Label, Vector3, float)>();

        Vector2? ToPanel(Vector3 viewPos)
        {
            var cam = app.stage.cam;
            var sp = cam.WorldToViewportPoint(viewPos);
            if (sp.z < 0) return null;
            var r = root.layout;
            return new Vector2(sp.x * r.width, (1 - sp.y) * r.height);
        }

        void UpdateWorld(Snapshot st, float dt)
        {
            var seen = new HashSet<int>();
            var local = app.session.local;
            foreach (var p in st.pl)
            {
                seen.Add(p.id);
                if (!tags.TryGetValue(p.id, out var t))
                {
                    var tag = new VisualElement { pickingMode = PickingMode.Ignore }; tag.style.position = Position.Absolute; tag.style.alignItems = Align.Center;
                    var prompt = UIX.Col(); prompt.style.alignItems = Align.Center; prompt.pickingMode = PickingMode.Ignore;
                    var nm = UIX.L(p.name, UIX.Display, 11, Color.white); UIX.Pad(nm, 2, 7); UIX.Radius(nm, 6); UIX.Border(nm, 2, Pal.Ink);
                    tag.Add(prompt); tag.Add(nm);
                    world.Add(tag);
                    t = (tag, nm, prompt, null);
                }
                var slot = local.FirstOrDefault(l => l.pid == p.id);
                t.name.text = slot != null && local.Count > 1 ? $"P{local.IndexOf(slot) + 1} {p.name}" : p.name;
                t.name.style.backgroundColor = K.Hex(p.outfit.color);
                t.tag.style.opacity = p.connected ? 1 : 0.5f;
                var pos = ToPanel(VS.P(p.pos) + Vector3.up * (p.state == PState.Down ? 0.9f : 1.6f));
                if (pos.HasValue) { t.tag.style.left = pos.Value.x - 100; t.tag.style.width = 200; t.tag.style.top = pos.Value.y - 120; t.tag.style.height = 120; t.tag.style.justifyContent = Justify.FlexEnd; t.tag.style.display = DisplayStyle.Flex; }
                else t.tag.style.display = DisplayStyle.None;
                string key = slot != null && p.prompt != null && p.state == PState.Ok ? $"{p.prompt.g}|{p.prompt.u}|{p.prompt.t}|{Mathf.RoundToInt(p.prompt.p * 20)}|{slot.device}" : "";
                if (key != t.key)
                {
                    t.key = key;
                    t.prompt.Clear();
                    if (key != "")
                    {
                        var keys = GameInput.KeysFor(slot.device);
                        if (p.prompt.u != null) t.prompt.Add(Chip(keys[4], p.prompt.u + (p.prompt.k == "hold" && p.prompt.p > 0 ? $"  {Mathf.RoundToInt(p.prompt.p * 100)}%" : ""), Pal.Teal));
                        if (p.prompt.g != null) t.prompt.Add(Chip(keys[3], p.prompt.g, new Color(0.1f, 0.12f, 0.14f, 0.9f)));
                        if (p.prompt.t != null) t.prompt.Add(Chip(keys[5], p.prompt.t, new Color(0.1f, 0.12f, 0.14f, 0.9f)));
                    }
                }
                tags[p.id] = t;
            }
            foreach (var id in tags.Keys.ToList()) if (!seen.Contains(id)) { tags[id].tag.RemoveFromHierarchy(); tags.Remove(id); }
            for (int i = floaties.Count - 1; i >= 0; i--)
            {
                var f = floaties[i];
                f.life -= dt; f.pos += Vector3.up * dt * 1.2f;
                var pp = ToPanel(f.pos);
                if (pp.HasValue) { f.l.style.left = pp.Value.x - 80; f.l.style.top = pp.Value.y; }
                f.l.style.opacity = Mathf.Min(1, f.life * 2);
                if (f.life <= 0) { f.l.RemoveFromHierarchy(); floaties.RemoveAt(i); } else floaties[i] = f;
            }
        }

        VisualElement Chip(string key, string text, Color bg)
        {
            var c = UIX.Row(); c.style.backgroundColor = bg; UIX.Radius(c, 999); UIX.Pad(c, 3, 8); c.style.marginBottom = 3;
            var k = UIX.Key(key); k.style.fontSize = 10; c.Add(k);
            c.Add(UIX.Margin(UIX.L(text, UIX.Display, 11, Color.white), 0, 0, 0, 6));
            return c;
        }

        public void Floaty(string text, Vector3 simPos, bool neg)
        {
            var l = UIX.L(text, UIX.Display, 24, neg ? K.Hex("#ff6b62") : Pal.Yellow);
            l.style.position = Position.Absolute; l.style.width = 160; l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.pickingMode = PickingMode.Ignore;
            world.Add(l);
            floaties.Add((l, VS.P(simPos), 1.6f));
        }

        public void ClearWorld() { world.Clear(); tags.Clear(); floaties.Clear(); }

        public void Update(Snapshot st, float dt)
        {
            if (st == null) return;
            string mode = st.game.phase == "lobby" || st.game.phase == "countdown" ? "lobby" : "shift";
            if (hudBuilt != mode) { if (mode == "lobby") BuildLobby(); else BuildShift(); }
            if (mode == "lobby") UpdateLobby(st); else UpdateShift(st, dt);
            if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) { bannerBig.text = ""; bannerSmall.text = ""; } }
            UpdateWorld(st, dt);
        }

        // ───────────────────────────── report ─────────────────────────────
        public void ShowReport(Report rep)
        {
            ReportOpen = true;
            var board = UIX.Clipboard(out var paper);
            var head = UIX.Row(); head.style.justifyContent = Justify.SpaceBetween; head.style.alignItems = Align.FlexStart;
            var hl = UIX.Col();
            hl.Add(UIX.Eyebrow("PLANT 7 · END OF SHIFT"));
            hl.Add(UIX.L("SHIFT REPORT", UIX.Display, 40));
            hl.Add(UIX.L($"{rep.contract} — for {rep.client}", UIX.BodyBold, 15));
            head.Add(hl);
            bool good = rep.result == "QUOTA MET" || rep.result == "OVERTIME HERO";
            var stamp = UIX.L(rep.result ?? "", UIX.Display, 30, good ? K.Hex("#22863a") : Pal.Red);
            UIX.Border(stamp, 4, good ? K.Hex("#22863a") : Pal.Red); UIX.Radius(stamp, 8); UIX.Pad(stamp, 4, 12); stamp.style.rotate = new Rotate(-8); stamp.style.opacity = 0.88f;
            head.Add(stamp);
            head.Add(UIX.L($"FORM 7B / REV. 13\nDURATION {UIX.Clock(rep.duration)}\nCREW {rep.players.Count}\n{(rep.overtime > 0 ? $"OVERTIME ×{rep.overtime}" : "NO OVERTIME")}", UIX.Mono, 12));
            paper.Add(head);
            var cols = UIX.Row(); cols.style.alignItems = Align.FlexStart; cols.style.marginTop = 14;
            var left = UIX.Col(); left.style.flexGrow = 1; left.style.flexBasis = 0; left.style.marginRight = 24;
            left.Add(UIX.Margin(UIX.Eyebrow("Earnings ledger"), 0, 0, 6, 0));
            foreach (var l in rep.lines)
            {
                var r = UIX.Row(); r.style.justifyContent = Justify.SpaceBetween; r.style.borderBottomWidth = 1; r.style.borderBottomColor = new Color(0, 0, 0, 0.2f); UIX.Pad(r, 3, 0);
                r.Add(UIX.L(l.label + (l.n > 1 ? $" ×{l.n}" : ""), UIX.Mono, 13)); r.Add(UIX.L(UIX.Money(l.amount), UIX.Mono, 13, l.amount < 0 ? K.Hex("#a8231f") : Pal.Ink));
                left.Add(r);
            }
            var tot = UIX.Row(); tot.style.justifyContent = Justify.SpaceBetween; tot.style.marginTop = 8;
            tot.Add(UIX.L("TOTAL", UIX.Display, 28)); tot.Add(UIX.L(UIX.Money(rep.total), UIX.Display, 28, rep.total < 0 ? K.Hex("#a8231f") : Pal.Ink));
            left.Add(tot);
            left.Add(UIX.Eyebrow($"Pay multiplier ×{rep.mult:0.00} · company ledger now {UIX.Money(rep.ledgerAfter)}"));
            cols.Add(left);
            var right = UIX.Col(); right.style.flexGrow = 1; right.style.flexBasis = 0;
            right.Add(UIX.Margin(UIX.Eyebrow("Floor statistics"), 0, 0, 6, 0));
            var sr = UIX.Row();
            foreach (var (v, l) in new[] { (rep.delivered.ToString(), "Shipped"), (rep.broken.ToString(), "Broken"), (rep.misdelivered.ToString(), "Misrouted"), (rep.incidents.ToString(), "Incidents") }) sr.Add(Stat(v, l));
            right.Add(sr);
            var kinds = UIX.Row(); kinds.style.flexWrap = Wrap.Wrap; kinds.style.marginTop = 8;
            foreach (var k in rep.incidentKinds) kinds.Add(UIX.Margin(UIX.Dymo($"{k.name} ×{k.n}"), 0, 6, 4, 0));
            right.Add(kinds);
            cols.Add(right);
            paper.Add(cols);
            paper.Add(UIX.Margin(UIX.Eyebrow("Personnel"), 14, 0, 4, 0));
            foreach (var p in rep.players)
            {
                var s = p.stats;
                paper.Add(UIX.L($"{p.name,-14}  delivered {s.delivered}  earned {UIX.Money(s.earned)}  broken {s.broken}  faceplants {s.knockdowns}  fixes {s.fixes}  belt {Mathf.RoundToInt(s.beltTime)}s  tube {s.tubeRides}  yeets {s.thrownMates}", UIX.Mono, 12));
            }
            paper.Add(UIX.Margin(UIX.Eyebrow("Commendations"), 14, 0, 6, 0));
            var aw = UIX.Row(); aw.style.flexWrap = Wrap.Wrap; aw.style.alignItems = Align.Stretch;
            if (rep.awards.Count == 0) aw.Add(UIX.L("Nobody did anything noteworthy. Impressive, in a way.", UIX.Body, 14));
            foreach (var a in rep.awards)
            {
                var card = UIX.Col(); card.style.width = 210; card.style.backgroundColor = K.Hex("#ffe9b0"); UIX.Border(card, 3, Pal.Ink); UIX.Radius(card, 12); UIX.Pad(card, 8, 10); UIX.Margin(card, 0, 10, 10, 0);
                var dot = new VisualElement(); dot.style.width = 18; dot.style.height = 18; UIX.Radius(dot, 9); dot.style.backgroundColor = K.Hex(a.outfit.color); UIX.Border(dot, 2, Pal.Ink);
                card.Add(dot);
                card.Add(UIX.L(a.title, UIX.Display, 13, null, true)); card.Add(UIX.L(a.name, UIX.BodyBold, 14)); card.Add(UIX.L(a.desc, UIX.Body, 11, null, true));
                aw.Add(card);
            }
            paper.Add(aw);
            var act = UIX.Row(); act.style.justifyContent = Justify.SpaceBetween; act.style.marginTop = 12;
            var sig = UIX.Row(); sig.Add(UIX.Eyebrow("Foreman signature ")); sig.Add(UIX.L("B. Grumble", UIX.Script, 30));
            act.Add(sig);
            act.Add(UIX.Btn("BACK TO THE BREAK ROOM →", () => { app.audio.Play("paper"); CloseModal(); ReportOpen = false; }));
            paper.Add(act);
            var scroll = new ScrollView(); scroll.Add(board);
            OpenModal(scroll, 1000);
        }
    }
}
