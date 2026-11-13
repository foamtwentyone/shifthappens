// "PLANT 7" design system for UI Toolkit, built in code: plates, dymo tape,
// hazard bars, clipboards, chunky buttons and the bulb scoreboard.
using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace ShiftHappens
{
    public static class UIX
    {
        static Font fDisplay, fBody, fBodyBold, fMono, fScript;
        public static Font Display => fDisplay ? fDisplay : fDisplay = Resources.Load<Font>("Fonts/Bungee");
        public static Font Body => fBody ? fBody : fBody = Resources.Load<Font>("Fonts/Rubik-Regular");
        public static Font BodyBold => fBodyBold ? fBodyBold : fBodyBold = Resources.Load<Font>("Fonts/Rubik-Bold");
        public static Font Mono => fMono ? fMono : fMono = Resources.Load<Font>("Fonts/SpaceMono-Bold");
        public static Font Script => fScript ? fScript : fScript = Resources.Load<Font>("Fonts/Caveat");

        static Texture2D hazardTex;
        public static Texture2D HazardTex => hazardTex ? hazardTex : hazardTex = Mats.Hazard(10);

        public static void Font(VisualElement e, Font f) { if (f) e.style.unityFontDefinition = new StyleFontDefinition(FontDefinition.FromFont(f)); }

        public static T Pad<T>(T e, float v, float h) where T : VisualElement { e.style.paddingTop = v; e.style.paddingBottom = v; e.style.paddingLeft = h; e.style.paddingRight = h; return e; }
        public static T Margin<T>(T e, float t, float r, float b, float l) where T : VisualElement { e.style.marginTop = t; e.style.marginRight = r; e.style.marginBottom = b; e.style.marginLeft = l; return e; }
        public static T Radius<T>(T e, float r) where T : VisualElement { e.style.borderTopLeftRadius = r; e.style.borderTopRightRadius = r; e.style.borderBottomLeftRadius = r; e.style.borderBottomRightRadius = r; return e; }
        public static T Border<T>(T e, float w, Color c) where T : VisualElement
        {
            e.style.borderTopWidth = w; e.style.borderBottomWidth = w; e.style.borderLeftWidth = w; e.style.borderRightWidth = w;
            e.style.borderTopColor = c; e.style.borderBottomColor = c; e.style.borderLeftColor = c; e.style.borderRightColor = c;
            return e;
        }
        public static T Abs<T>(T e, float? left = null, float? top = null, float? right = null, float? bottom = null) where T : VisualElement
        {
            e.style.position = Position.Absolute;
            if (left.HasValue) e.style.left = left.Value;
            if (top.HasValue) e.style.top = top.Value;
            if (right.HasValue) e.style.right = right.Value;
            if (bottom.HasValue) e.style.bottom = bottom.Value;
            return e;
        }
        public static T Fill<T>(T e) where T : VisualElement { Abs(e, 0, 0, 0, 0); return e; }

        public static VisualElement Row(float gap = 8)
        {
            var e = new VisualElement();
            e.style.flexDirection = FlexDirection.Row; e.style.alignItems = Align.Center;
            e.userData = gap;
            return e;
        }
        public static VisualElement Col() { var e = new VisualElement(); e.style.flexDirection = FlexDirection.Column; return e; }

        public static Label L(string text, Font f = null, float size = 16, Color? color = null, bool wrap = false)
        {
            var l = new Label(text);
            Font(l, f ? f : Body);
            l.style.fontSize = size;
            l.style.color = color ?? Pal.Ink;
            l.style.whiteSpace = wrap ? WhiteSpace.Normal : WhiteSpace.NoWrap;
            l.style.marginTop = 0; l.style.marginBottom = 0; l.style.paddingTop = 0; l.style.paddingBottom = 0;
            return l;
        }

        public static Label Eyebrow(string text, Color? c = null) { var l = L(text.ToUpperInvariant(), Mono, 11, c ?? new Color(0.1f, 0.12f, 0.14f, 0.75f)); l.style.letterSpacing = 2; return l; }

        // riveted steel plate
        public static VisualElement Plate(string tone = "steel")
        {
            var e = new VisualElement();
            var bg = tone == "dark" ? Pal.TealDeep : tone == "yellow" ? Pal.Yellow : tone == "teal" ? Pal.Teal : K.Hex("#dfe7e9");
            e.style.backgroundColor = bg;
            Border(e, 3, Pal.Ink); Radius(e, 14); Pad(e, 16, 18);
            foreach (var (l, t) in new[] { (true, true), (false, true), (true, false), (false, false) })
            {
                var r = new VisualElement { pickingMode = PickingMode.Ignore };
                r.style.width = 9; r.style.height = 9; Radius(r, 5);
                r.style.backgroundColor = K.Hex("#8f9ca0");
                Border(r, 1, K.Hex("#56636a"));
                Abs(r, l ? 7 : (float?)null, t ? 7 : (float?)null, l ? (float?)null : 7, t ? (float?)null : 7);
                e.Add(r);
            }
            return e;
        }

        public static VisualElement HazardBar(float h = 14)
        {
            var e = new VisualElement();
            e.style.height = h;
            e.style.backgroundImage = new StyleBackground(Background.FromTexture2D(HazardTex));
            Border(e, 3, Pal.Ink); Radius(e, 6);
            return e;
        }

        public static Label Dymo(string text, Color? bg = null, Color? fg = null, float size = 12)
        {
            var l = L(text.ToUpperInvariant(), Mono, size, fg ?? Color.white);
            l.style.backgroundColor = bg ?? Pal.Ink;
            Pad(l, 4, 10); Radius(l, 3);
            l.style.letterSpacing = 2;
            l.style.alignSelf = Align.FlexStart;
            return l;
        }

        public static Button Btn(string text, Action onClick, Color? bg = null, Color? fg = null, float size = 18)
        {
            var b = new Button(onClick) { text = text };
            Font(b, Display);
            b.style.fontSize = size;
            b.style.color = fg ?? Pal.Ink;
            b.style.backgroundColor = bg ?? Pal.Yellow;
            Border(b, 3, Pal.Ink); Radius(b, 12);
            b.style.borderBottomWidth = 6;
            Pad(b, 10, 20);
            b.style.marginLeft = 0; b.style.marginRight = 0;
            b.RegisterCallback<MouseEnterEvent>(_ => b.style.translate = new Translate(0, -2));
            b.RegisterCallback<MouseLeaveEvent>(_ => b.style.translate = new Translate(0, 0));
            return b;
        }

        // the paper on a clipboard
        public static VisualElement Clipboard(out VisualElement paper)
        {
            var board = new VisualElement();
            board.style.backgroundColor = K.Hex("#966838");
            Border(board, 3, Pal.Ink); Radius(board, 14); Pad(board, 22, 12);
            board.style.paddingBottom = 12;
            var clip = new VisualElement { pickingMode = PickingMode.Ignore };
            clip.style.width = 92; clip.style.height = 26; clip.style.backgroundColor = K.Hex("#c4ccce");
            Border(clip, 3, Pal.Ink); Radius(clip, 8);
            Abs(clip, null, -13);
            clip.style.alignSelf = Align.Center;
            clip.style.left = new StyleLength(new Length(50, LengthUnit.Percent));
            clip.style.marginLeft = -46;
            board.Add(clip);
            paper = new VisualElement();
            paper.style.backgroundColor = Pal.Paper;
            Radius(paper, 4); Pad(paper, 12, 14);
            board.Add(paper);
            return board;
        }

        public static string Money(int n) => (n < 0 ? "-$" : "$") + Mathf.Abs(n).ToString("N0");
        public static string Clock(float sec) { int s = Mathf.Max(0, Mathf.CeilToInt(sec)); return $"{s / 60}:{s % 60:00}"; }

        public static Label Key(string k)
        {
            var l = L(k, Mono, 12, Pal.Ink);
            l.style.backgroundColor = Color.white;
            Border(l, 2, Pal.Ink); Radius(l, 6);
            l.style.borderBottomWidth = 4;
            Pad(l, 2, 6);
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.style.minWidth = 26;
            return l;
        }
    }

    // Chunky bulb scoreboard: digits drawn from a 5×7 grid of round "bulbs".
    public class BulbBoard : VisualElement
    {
        static readonly System.Collections.Generic.Dictionary<char, string[]> G = new System.Collections.Generic.Dictionary<char, string[]>
        {
            ['0'] = new[] { "01110", "10001", "10011", "10101", "11001", "10001", "01110" },
            ['1'] = new[] { "00100", "01100", "00100", "00100", "00100", "00100", "01110" },
            ['2'] = new[] { "01110", "10001", "00001", "00110", "01000", "10000", "11111" },
            ['3'] = new[] { "11110", "00001", "00001", "01110", "00001", "00001", "11110" },
            ['4'] = new[] { "00010", "00110", "01010", "10010", "11111", "00010", "00010" },
            ['5'] = new[] { "11111", "10000", "11110", "00001", "00001", "10001", "01110" },
            ['6'] = new[] { "00110", "01000", "10000", "11110", "10001", "10001", "01110" },
            ['7'] = new[] { "11111", "00001", "00010", "00100", "01000", "01000", "01000" },
            ['8'] = new[] { "01110", "10001", "10001", "01110", "10001", "10001", "01110" },
            ['9'] = new[] { "01110", "10001", "10001", "01111", "00001", "00010", "01100" },
            ['$'] = new[] { "00100", "01111", "10100", "01110", "00101", "11110", "00100" },
            ['-'] = new[] { "00000", "00000", "00000", "11111", "00000", "00000", "00000" },
            [':'] = new[] { "0", "0", "1", "0", "1", "0", "0" },
            [' '] = new[] { "00000", "00000", "00000", "00000", "00000", "00000", "00000" },
        };
        readonly int cols;
        readonly VisualElement[,] bulbs;
        string key;

        public BulbBoard(string label, int cells, bool colon, float pitch = 6.5f)
        {
            cols = cells * 6 - 1 + (colon ? 2 : 0);
            style.backgroundColor = K.Hex("#1d2226");
            UIX.Border(this, 3, Pal.Ink); UIX.Radius(this, 12); UIX.Pad(this, 4, 8);
            style.alignItems = Align.Center;
            var lab = UIX.L(label, UIX.Display, 11, Pal.Yellow); lab.style.letterSpacing = 2; lab.style.marginBottom = 4;
            Add(lab);
            var face = new VisualElement();
            face.style.backgroundColor = K.Hex("#07090a");
            UIX.Radius(face, 8); UIX.Pad(face, 6, 8);
            bulbs = new VisualElement[cols, 7];
            for (int y = 0; y < 7; y++)
            {
                var row = new VisualElement(); row.style.flexDirection = FlexDirection.Row;
                for (int x = 0; x < cols; x++)
                {
                    var b = new VisualElement();
                    b.style.width = pitch * 0.86f; b.style.height = pitch * 0.86f;
                    b.style.marginLeft = pitch * 0.07f; b.style.marginRight = pitch * 0.07f; b.style.marginTop = pitch * 0.07f; b.style.marginBottom = pitch * 0.07f;
                    UIX.Radius(b, pitch);
                    row.Add(b);
                    bulbs[x, y] = b;
                }
                face.Add(row);
            }
            Add(face);
        }

        public void Set(string text, Color on, bool blinkOff = false)
        {
            string k = text + on + blinkOff;
            if (k == key) return;
            key = k;
            var lit = new bool[cols, 7];
            var colsList = new System.Collections.Generic.List<bool[]>();
            foreach (char ch in text)
            {
                if (!G.TryGetValue(ch, out var g)) g = G[' '];
                if (colsList.Count > 0) colsList.Add(null);
                for (int x = 0; x < g[0].Length; x++) { var col = new bool[7]; for (int y = 0; y < 7; y++) col[y] = g[y][x] == '1'; colsList.Add(col); }
            }
            int start = cols - colsList.Count;
            for (int i = 0; i < colsList.Count; i++)
            {
                int x = start + i;
                if (x < 0 || colsList[i] == null) continue;
                for (int y = 0; y < 7; y++) lit[x, y] = colsList[i][y] && !blinkOff;
            }
            var off = new Color(on.r, on.g, on.b, 0.09f);
            for (int x = 0; x < cols; x++)
                for (int y = 0; y < 7; y++)
                {
                    var b = bulbs[x, y];
                    b.style.backgroundColor = lit[x, y] ? on : off;
                    UIX.Border(b, lit[x, y] ? 1 : 0, lit[x, y] ? Color.Lerp(on, Color.white, 0.55f) : Color.clear);
                }
        }
    }
}
