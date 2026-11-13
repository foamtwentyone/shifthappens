// Keyboard (two layouts on one keyboard) + gamepads. Buttons are sent as press
// COUNTERS so a tap is never lost between network packets. Works with the
// Input System package (default in Unity 6) and with the legacy Input Manager.
using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace ShiftHappens
{
    public class GameInput
    {
        // device ids: kb1 = WASD half, kb2 = arrows half, pad0..pad3 = gamepads
        readonly Dictionary<string, int[]> counters = new Dictionary<string, int[]>();
        public bool enabled = true;
        public readonly List<string> padJoins = new List<string>(); // gamepads that pressed START this frame

        public static readonly Dictionary<string, string[]> KeyNames = new Dictionary<string, string[]>
        {
            // move, run, jump, grab, use, throw
            ["kb1"] = new[] { "WASD", "SHIFT", "SPACE", "E", "F", "Q" },
            ["kb2"] = new[] { "ARROWS", "R-SHIFT", "ENTER", ".", "/", "," },
            ["pad"] = new[] { "L-STICK", "RT", "A", "X", "B", "Y" },
        };
        public static string[] KeysFor(string dev) => dev.StartsWith("pad") ? KeyNames["pad"] : KeyNames.TryGetValue(dev, out var k) ? k : KeyNames["kb1"];

        int[] C(string dev) { if (!counters.TryGetValue(dev, out var c)) counters[dev] = c = new int[4]; return c; }
        void Bump(string dev, int i) { var c = C(dev); c[i] = (c[i] + 1) & 0xffff; }

        // call once per frame
        public void Poll()
        {
            padJoins.Clear();
#if ENABLE_INPUT_SYSTEM
            var kb = Keyboard.current;
            if (kb != null)
            {
                if (kb[Key.Space].wasPressedThisFrame) Bump("kb1", 0);
                if (kb[Key.E].wasPressedThisFrame) Bump("kb1", 1);
                if (kb[Key.F].wasPressedThisFrame) Bump("kb1", 2);
                if (kb[Key.Q].wasPressedThisFrame) Bump("kb1", 3);
                if (kb[Key.Enter].wasPressedThisFrame || kb[Key.NumpadEnter].wasPressedThisFrame || kb[Key.Numpad0].wasPressedThisFrame) Bump("kb2", 0);
                if (kb[Key.Period].wasPressedThisFrame || kb[Key.Numpad1].wasPressedThisFrame) Bump("kb2", 1);
                if (kb[Key.Slash].wasPressedThisFrame || kb[Key.Numpad2].wasPressedThisFrame) Bump("kb2", 2);
                if (kb[Key.Comma].wasPressedThisFrame || kb[Key.Numpad3].wasPressedThisFrame) Bump("kb2", 3);
            }
            for (int i = 0; i < Gamepad.all.Count; i++)
            {
                var gp = Gamepad.all[i];
                string dev = "pad" + i;
                if (gp.buttonSouth.wasPressedThisFrame) Bump(dev, 0);
                if (gp.buttonWest.wasPressedThisFrame) Bump(dev, 1);
                if (gp.buttonEast.wasPressedThisFrame) Bump(dev, 2);
                if (gp.buttonNorth.wasPressedThisFrame) Bump(dev, 3);
                if (gp.startButton.wasPressedThisFrame) padJoins.Add(dev);
            }
#else
            if (UnityEngine.Input.GetKeyDown(KeyCode.Space)) Bump("kb1", 0);
            if (UnityEngine.Input.GetKeyDown(KeyCode.E)) Bump("kb1", 1);
            if (UnityEngine.Input.GetKeyDown(KeyCode.F)) Bump("kb1", 2);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Q)) Bump("kb1", 3);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Return) || UnityEngine.Input.GetKeyDown(KeyCode.KeypadEnter)) Bump("kb2", 0);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Period)) Bump("kb2", 1);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Slash)) Bump("kb2", 2);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Comma)) Bump("kb2", 3);
#endif
        }

        public PlayerInput Read(string dev)
        {
            var o = new PlayerInput();
            if (enabled)
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (dev == "kb1" && kb != null)
                {
                    if (kb[Key.A].isPressed) o.mx -= 1; if (kb[Key.D].isPressed) o.mx += 1;
                    if (kb[Key.W].isPressed) o.mz -= 1; if (kb[Key.S].isPressed) o.mz += 1;
                    if (kb[Key.LeftShift].isPressed) o.b |= Btn.Run;
                    if (kb[Key.Space].isPressed) o.b |= Btn.Jump;
                    if (kb[Key.E].isPressed) o.b |= Btn.Grab;
                    if (kb[Key.F].isPressed) o.b |= Btn.Use;
                    if (kb[Key.Q].isPressed) o.b |= Btn.Throw;
                }
                else if (dev == "kb2" && kb != null)
                {
                    if (kb[Key.LeftArrow].isPressed) o.mx -= 1; if (kb[Key.RightArrow].isPressed) o.mx += 1;
                    if (kb[Key.UpArrow].isPressed) o.mz -= 1; if (kb[Key.DownArrow].isPressed) o.mz += 1;
                    if (kb[Key.RightShift].isPressed) o.b |= Btn.Run;
                    if (kb[Key.Enter].isPressed) o.b |= Btn.Jump;
                    if (kb[Key.Period].isPressed) o.b |= Btn.Grab;
                    if (kb[Key.Slash].isPressed || kb[Key.Numpad2].isPressed) o.b |= Btn.Use;
                    if (kb[Key.Comma].isPressed) o.b |= Btn.Throw;
                }
                else if (dev.StartsWith("pad"))
                {
                    int i = int.Parse(dev.Substring(3));
                    if (i < Gamepad.all.Count)
                    {
                        var gp = Gamepad.all[i];
                        var st = gp.leftStick.ReadValue();
                        if (st.magnitude > 0.22f) { o.mx = st.x; o.mz = -st.y; }
                        if (gp.dpad.left.isPressed) o.mx = -1; if (gp.dpad.right.isPressed) o.mx = 1;
                        if (gp.dpad.up.isPressed) o.mz = -1; if (gp.dpad.down.isPressed) o.mz = 1;
                        if (gp.rightTrigger.ReadValue() > 0.3f || gp.leftTrigger.ReadValue() > 0.3f || gp.rightShoulder.isPressed) o.b |= Btn.Run;
                        if (gp.buttonSouth.isPressed) o.b |= Btn.Jump;
                        if (gp.buttonWest.isPressed) o.b |= Btn.Grab;
                        if (gp.buttonEast.isPressed) o.b |= Btn.Use;
                        if (gp.buttonNorth.isPressed) o.b |= Btn.Throw;
                    }
                }
#else
                if (dev == "kb1")
                {
                    if (UnityEngine.Input.GetKey(KeyCode.A)) o.mx -= 1; if (UnityEngine.Input.GetKey(KeyCode.D)) o.mx += 1;
                    if (UnityEngine.Input.GetKey(KeyCode.W)) o.mz -= 1; if (UnityEngine.Input.GetKey(KeyCode.S)) o.mz += 1;
                    if (UnityEngine.Input.GetKey(KeyCode.LeftShift)) o.b |= Btn.Run;
                    if (UnityEngine.Input.GetKey(KeyCode.F)) o.b |= Btn.Use;
                }
                else if (dev == "kb2")
                {
                    if (UnityEngine.Input.GetKey(KeyCode.LeftArrow)) o.mx -= 1; if (UnityEngine.Input.GetKey(KeyCode.RightArrow)) o.mx += 1;
                    if (UnityEngine.Input.GetKey(KeyCode.UpArrow)) o.mz -= 1; if (UnityEngine.Input.GetKey(KeyCode.DownArrow)) o.mz += 1;
                    if (UnityEngine.Input.GetKey(KeyCode.RightShift)) o.b |= Btn.Run;
                    if (UnityEngine.Input.GetKey(KeyCode.Slash)) o.b |= Btn.Use;
                }
#endif
            }
            var c = C(dev);
            for (int k = 0; k < 4; k++) o.c[k] = c[k];
            return o;
        }

        // UI helpers (menus, pause, couch join)
        public bool Pressed(string what)
        {
#if ENABLE_INPUT_SYSTEM
            var kb = Keyboard.current;
            if (kb == null) return false;
            switch (what)
            {
                case "escape": return kb[Key.Escape].wasPressedThisFrame;
                case "enter": return kb[Key.Enter].wasPressedThisFrame || kb[Key.NumpadEnter].wasPressedThisFrame;
                case "any": return kb.anyKey.wasPressedThisFrame || (Gamepad.current != null && Gamepad.current.buttonSouth.wasPressedThisFrame);
                case "up": return kb[Key.UpArrow].wasPressedThisFrame || kb[Key.W].wasPressedThisFrame;
                case "down": return kb[Key.DownArrow].wasPressedThisFrame || kb[Key.S].wasPressedThisFrame;
                case "confirm": return kb[Key.Enter].wasPressedThisFrame || kb[Key.Space].wasPressedThisFrame || kb[Key.E].wasPressedThisFrame;
            }
            return false;
#else
            switch (what)
            {
                case "escape": return UnityEngine.Input.GetKeyDown(KeyCode.Escape);
                case "enter": return UnityEngine.Input.GetKeyDown(KeyCode.Return) || UnityEngine.Input.GetKeyDown(KeyCode.KeypadEnter);
                case "any": return UnityEngine.Input.anyKeyDown;
                case "up": return UnityEngine.Input.GetKeyDown(KeyCode.UpArrow) || UnityEngine.Input.GetKeyDown(KeyCode.W);
                case "down": return UnityEngine.Input.GetKeyDown(KeyCode.DownArrow) || UnityEngine.Input.GetKeyDown(KeyCode.S);
                case "confirm": return UnityEngine.Input.GetKeyDown(KeyCode.Return) || UnityEngine.Input.GetKeyDown(KeyCode.Space) || UnityEngine.Input.GetKeyDown(KeyCode.E);
            }
            return false;
#endif
        }
    }
}
