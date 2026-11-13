// SHIFT HAPPENS — shared data: tuning, cargo catalogue and the Plant 7 layout.
// Ported 1:1 from the web build (shared/constants.js + shared/level.js).
// Coordinates: metres, Y up, +Z is "south" (towards the camera).
using System.Collections.Generic;
using UnityEngine;

namespace ShiftHappens
{
    public static class K
    {
        public const int TickRate = 60;
        public const int SnapshotRate = 20;
        public const int MaxPlayers = 4;
        public const float Gravity = 18f;

        // physics layers (indices only — no named layers needed in the project)
        public const int LStatic = 8, LPlayer = 9, LCargo = 10, LDoor = 11, LHeld = 12, LGhost = 13;
        public static int MaskGround => (1 << LStatic) | (1 << LCargo) | (1 << LDoor);

        public const float PlayerRadius = 0.42f, Walk = 4.3f, Run = 6.8f, Accel = 26f, AirAccel = 9f, Jump = 7.2f;
        public const float Reach = 1.55f, ThrowSpeed = 11f, ShoveImpulse = 6f, RagdollHit = 6.2f;

        public static readonly string[] OutfitColors = { "#ff7a2f", "#1fb5a8", "#8b5cf6", "#7ac943", "#ff5d8f", "#ffc93c", "#3b82d6", "#e8423f" };
        public static readonly string[] Hats = { "none", "hardhat", "cap", "cone" };
        public static readonly string[] Models = { "worker", "male-a", "female-a", "male-b", "female-b", "male-c", "female-c", "male-d", "female-d", "male-e",
            "female-e", "male-f", "female-f", "male-g", "robot", "alien", "soldier", "knight", "raider", "zombie" };

        public const int PenMisdeliver = 15, PenEstop = 25, PenBurst = 120, PenLost = 30;

        public static Color Hex(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c; }
    }

    public enum Shape { Box, Cyl, Sphere }

    public class CargoDef
    {
        public string Id, Name, Short, Bay;
        public int Pay, BreakPenalty;
        public float Mass, GravityScale = 1f, Fragile;
        public Shape Shape;
        public Vector3 Size; // box: full size; cyl: (radius, height, radius); sphere: (radius,radius,radius)
        public float[] Carry = { 1, 1, 1 };
        public bool NeedsHeat, Magnetic, Junk, Toy;
        public float Lift = 0.3f, Wind = 0.5f;

        public float HalfH => Shape == Shape.Box ? Size.y / 2 : Shape == Shape.Cyl ? Size.y / 2 : Size.x;
        public float Radius => Shape == Shape.Box ? Mathf.Max(Size.x, Size.z) / 2 : Size.x;
    }

    public static class Cargo
    {
        public static readonly Dictionary<string, CargoDef> Defs = new Dictionary<string, CargoDef>
        {
            ["crate"] = new CargoDef { Id = "crate", Name = "Steel Crate", Short = "CRATE", Bay = "A", Pay = 60, Mass = 60, Shape = Shape.Box, Size = new Vector3(1.05f, 1.05f, 1.05f), Carry = new[] { 0.38f, 0.9f, 1f }, Lift = 0.05f, Wind = 0.15f },
            ["wobble"] = new CargoDef { Id = "wobble", Name = "Wobble Drum", Short = "WOBBLE", Bay = "A", Pay = 75, Mass = 22, Shape = Shape.Cyl, Size = new Vector3(0.45f, 1.0f, 0.45f), Carry = new[] { 0.7f, 0.95f, 1f }, Lift = 0.25f, Wind = 0.6f },
            ["gnome"] = new CargoDef { Id = "gnome", Name = "Porcelain Gnome", Short = "GNOME", Bay = "B", Pay = 85, Mass = 4, Shape = Shape.Box, Size = new Vector3(0.5f, 0.85f, 0.5f), Fragile = 7f, BreakPenalty = 60, Lift = 0.8f, Wind = 1.3f },
            ["beans"] = new CargoDef { Id = "beans", Name = "Thermo Beans", Short = "BEANS", Bay = "B", Pay = 95, Mass = 9, Shape = Shape.Cyl, Size = new Vector3(0.36f, 0.75f, 0.36f), Carry = new[] { 0.95f, 1f, 1f }, NeedsHeat = true, Lift = 0.5f, Wind = 1f },
            ["balloon"] = new CargoDef { Id = "balloon", Name = "Helium Parcel", Short = "HELIUM", Bay = "C", Pay = 55, Mass = 1.5f, Shape = Shape.Box, Size = new Vector3(0.75f, 0.75f, 0.75f), GravityScale = 0.12f, Lift = 1.3f, Wind = 3.2f },
            ["magnet"] = new CargoDef { Id = "magnet", Name = "Magnetic Core", Short = "CORE", Bay = "C", Pay = 75, Mass = 16, Shape = Shape.Sphere, Size = new Vector3(0.4f, 0.4f, 0.4f), Carry = new[] { 0.8f, 0.95f, 1f }, Magnetic = true, Lift = 0.2f, Wind = 0.5f },
            ["mystery"] = new CargoDef { Id = "mystery", Name = "Mystery Box", Short = "MYSTERY", Bay = "?", Pay = 110, Mass = 18, Shape = Shape.Box, Size = new Vector3(0.85f, 0.85f, 0.85f), Carry = new[] { 0.85f, 1f, 1f }, Lift = 0.25f, Wind = 0.6f },
            ["duck"] = new CargoDef { Id = "duck", Name = "Rubber Duck", Short = "DUCK", Bay = "X", Pay = 0, Mass = 0.8f, Shape = Shape.Sphere, Size = new Vector3(0.28f, 0.28f, 0.28f), Junk = true, Lift = 1.2f, Wind = 2.5f },
            ["ball"] = new CargoDef { Id = "ball", Name = "Ball", Short = "BALL", Bay = "X", Pay = 0, Mass = 0.6f, Shape = Shape.Sphere, Size = new Vector3(0.25f, 0.25f, 0.25f), Toy = true, Lift = 1.2f, Wind = 2.5f },
            ["soda"] = new CargoDef { Id = "soda", Name = "Fizz Soda", Short = "SODA", Bay = "X", Pay = 0, Mass = 0.4f, Shape = Shape.Cyl, Size = new Vector3(0.12f, 0.3f, 0.12f), Toy = true, Lift = 1f, Wind = 2f },
        };
        public static readonly string[] Orderable = { "crate", "wobble", "gnome", "beans", "balloon", "magnet", "mystery" };
        public static readonly string[] TypeIndex = { "crate", "wobble", "gnome", "beans", "balloon", "magnet", "mystery", "duck", "ball", "soda" };
        public static int Index(string t) => System.Array.IndexOf(TypeIndex, t);
    }

    public class Bay { public string Id, Name; public Color Color; }
    public static class Bays
    {
        public static readonly Dictionary<string, Bay> All = new Dictionary<string, Bay>
        {
            ["A"] = new Bay { Id = "A", Name = "BAY A", Color = K.Hex("#e8423f") },
            ["B"] = new Bay { Id = "B", Name = "BAY B", Color = K.Hex("#3b82d6") },
            ["C"] = new Bay { Id = "C", Name = "SKY DOCK", Color = K.Hex("#ffc93c") },
        };
        public static Color ColorOf(string bay) => bay == "?" ? K.Hex("#8b5cf6") : All.TryGetValue(bay, out var b) ? b.Color : K.Hex("#6b7280");
    }

    public class Rider { public string Id, Name, Desc; public float Mult; }
    public static class Riders
    {
        public static readonly Rider[] All =
        {
            new Rider { Id = "rush", Name = "RUSH JOB", Desc = "-30% shift time", Mult = 0.5f },
            new Rider { Id = "careful", Name = "NO SCRATCHES", Desc = "+$300 if nothing breaks, -$40 extra per break", Mult = 0f },
            new Rider { Id = "dark", Name = "LIGHTS OUT", Desc = "Main lights off. Bring a torch.", Mult = 0.6f },
            new Rider { Id = "cranky", Name = "CRANKY GEAR", Desc = "Twice as many breakdowns", Mult = 0.45f },
        };
    }

    public struct Zone { public string Id, Name; public float X0, X1, Z0, Z1; public Color Floor; }
    public struct Wall { public float X, Z, W, D, H, VH; public string Style; }
    public struct Belt { public string Id, Name, Zone; public float X0, X1, Z0, Z1, Top; public Vector2 Dir; }
    public struct DoorDef { public float X, Z0, Z1, H; }
    public struct PadDef { public float X, Y, Z, Size; }

    public static class Level
    {
        public const float MinX = -46, MaxX = 30, MinZ = -22, MaxZ = 10;

        public static readonly Zone[] Zones =
        {
            new Zone { Id = "lobby", Name = "BREAK ROOM", X0 = -46, X1 = -32, Z0 = -10, Z1 = 10, Floor = K.Hex("#c9a37a") },
            new Zone { Id = "intake", Name = "INTAKE BAY", X0 = -32, X1 = -14, Z0 = -10, Z1 = 10, Floor = K.Hex("#9db2b6") },
            new Zone { Id = "sorting", Name = "SORTING HALL", X0 = -14, X1 = 4, Z0 = -10, Z1 = 10, Floor = K.Hex("#a8b69f") },
            new Zone { Id = "control", Name = "CONTROL ROOM", X0 = -14, X1 = 4, Z0 = -22, Z1 = -10, Floor = K.Hex("#8ea2b4") },
            new Zone { Id = "airlock", Name = "AIRLOCK", X0 = 4, X1 = 10, Z0 = -3, Z1 = 3, Floor = K.Hex("#87939a") },
            new Zone { Id = "dock", Name = "SHIPPING DOCK", X0 = 10, X1 = 30, Z0 = -10, Z1 = 10, Floor = K.Hex("#b6a888") },
        };

        public static string ZoneAt(float x, float z)
        {
            foreach (var zn in Zones) if (x >= zn.X0 && x < zn.X1 && z >= zn.Z0 && z < zn.Z1) return zn.Id;
            return "outside";
        }

        const float WT = 0.5f;
        static Wall WX(float x0, float x1, float z, float h, float vh = -1, string style = "wall") => new Wall { X = (x0 + x1) / 2, Z = z, W = x1 - x0, D = WT, H = h, VH = vh < 0 ? h : vh, Style = style };
        static Wall WZ(float z0, float z1, float x, float h, float vh = -1, string style = "wall") => new Wall { X = x, Z = (z0 + z1) / 2, W = WT, D = z1 - z0, H = h, VH = vh < 0 ? h : vh, Style = style };
        static Wall Block(float x0, float x1, float z0, float z1, float h, float vh = -1) => new Wall { X = (x0 + x1) / 2, Z = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0, H = h, VH = vh < 0 ? h : vh, Style = "block" };

        public static readonly Wall[] Walls =
        {
            WX(-46, -14, -10, 3.6f), WX(-14, -12, -10, 3.6f), WX(-9, 4, -10, 3.6f), WX(4, 30, -10, 4.2f),
            WZ(-22, -10, -14, 3.6f), WZ(-22, -10, 4, 3.6f), WX(-14, 4, -22, 3.6f),
            WX(-46, 30, 10, 6, 0.9f, "rail"),
            WZ(-10, 10, -46, 3.6f), WZ(-10, 10, 30, 4.2f),
            WZ(-10, -2, -32, 3.2f), WZ(2, 10, -32, 6, 1.4f),
            WZ(-10, -3, -14, 3.2f), WZ(3, 10, -14, 6, 1.4f),
            Block(4, 10, -10, -3, 3.6f), Block(4, 10, 3, 10, 6, 1.3f),
        };

        public static readonly (float x0, float x1, float z0, float z1, float top) SkyDock = (19, 30, -10, -5, 2.8f);

        public static readonly Belt[] Belts =
        {
            new Belt { Id = "A", Name = "BELT A", X0 = -27.5f, X1 = -5.9f, Z0 = -0.75f, Z1 = 0.75f, Dir = new Vector2(1, 0), Zone = "intake", Top = 0.7f },
            new Belt { Id = "B", Name = "BELT B", X0 = -4.1f, X1 = 16, Z0 = -0.75f, Z1 = 0.75f, Dir = new Vector2(1, 0), Zone = "dock", Top = 0.7f },
            new Belt { Id = "C", Name = "BELT C", X0 = -5.75f, X1 = -4.25f, Z0 = -6.4f, Z1 = -0.9f, Dir = new Vector2(0, -1), Zone = "sorting", Top = 0.7f },
        };

        public static readonly Vector3 Sorter = new Vector3(-5, 0.7f, 0); public const float SorterSize = 1.8f;
        public static readonly Vector3 Scanner = new Vector3(-9.5f, 0, 0);
        public static readonly Vector3 Dispenser = new Vector3(-26.4f, 4.6f, 0);
        public static readonly Vector3[] TubePath = { new Vector3(-5, 1.3f, -7.3f), new Vector3(-5, 5.4f, -7.3f), new Vector3(21.4f, 5.4f, -7.3f), new Vector3(21.4f, 3.7f, -7.3f) };
        public static readonly Vector3 TubeMouth = new Vector3(-5, 1.0f, -7.25f); public const float TubeMouthR = 0.85f;
        public static readonly (float x0, float x1, float z0, float z1, float low, float high) Lift = (16, 19, -9.6f, -6.4f, 0, 2.8f);
        public static readonly Vector3 Fan = new Vector3(24.6f, 0, -3.4f); public const float FanR = 1.15f;
        public static readonly Vector3 Magnet = new Vector3(26.2f, 4.8f, -7.1f); public const float MagnetR = 8f;
        public static readonly Vector3 HeatPad = new Vector3(-10.5f, 0, 5.2f); public const float HeatPadR = 1f;
        public static readonly Vector3 Incinerator = new Vector3(-20, 0, -8.6f); public const float IncineratorR = 1.1f;
        public static readonly Vector3 Boiler = new Vector3(0, 0, -18.2f);

        public static readonly Dictionary<string, DoorDef> Doors = new Dictionary<string, DoorDef>
        {
            ["lobby"] = new DoorDef { X = -32, Z0 = -2, Z1 = 2, H = 3.0f },
            ["inner"] = new DoorDef { X = 4, Z0 = -3, Z1 = 3, H = 3.2f },
            ["outer"] = new DoorDef { X = 10, Z0 = -3, Z1 = 3, H = 3.2f },
        };
        public static readonly string[] DoorOrder = { "lobby", "inner", "outer" };

        public static readonly Dictionary<string, PadDef> Pads = new Dictionary<string, PadDef>
        {
            ["A"] = new PadDef { X = 22, Y = 0, Z = 5.4f, Size = 3 },
            ["B"] = new PadDef { X = 22, Y = 0, Z = 1.4f, Size = 3 },
            ["C"] = new PadDef { X = 26, Y = 2.8f, Z = -7.5f, Size = 2.6f },
        };

        public static readonly Dictionary<string, Vector3> Spots = new Dictionary<string, Vector3>
        {
            ["contract0"] = new Vector3(-42.5f, 1.5f, -9.4f), ["contract1"] = new Vector3(-39.5f, 1.5f, -9.4f), ["contract2"] = new Vector3(-36.5f, 1.5f, -9.4f),
            ["rider_rush"] = new Vector3(-45.4f, 1.3f, -6.5f), ["rider_careful"] = new Vector3(-45.4f, 1.3f, -4.5f),
            ["rider_dark"] = new Vector3(-45.4f, 1.3f, -2.5f), ["rider_cranky"] = new Vector3(-45.4f, 1.3f, -0.5f),
            ["locker_color"] = new Vector3(-45.4f, 1.3f, 3.0f), ["locker_hat"] = new Vector3(-45.4f, 1.3f, 5.0f), ["locker_model"] = new Vector3(-45.4f, 1.3f, 7.0f),
            ["punch"] = new Vector3(-33.4f, 1.2f, -4.6f), ["vending"] = new Vector3(-44.2f, 1.2f, -8.4f),
            ["disp_request"] = new Vector3(-25.2f, 1.2f, 2.4f), ["disp_auto"] = new Vector3(-27.4f, 1.2f, 2.4f),
            ["belt_a_lever"] = new Vector3(-17.5f, 1.1f, 2.2f), ["estop_intake"] = new Vector3(-23.5f, 1.2f, -9.3f), ["incinerator"] = new Vector3(-20, 1.0f, -8.0f),
            ["sorter_lever"] = new Vector3(-7.2f, 1.1f, 2.4f), ["sorter_body"] = new Vector3(-5, 1.0f, 1.3f), ["belt_b_lever"] = new Vector3(-1.5f, 1.1f, 2.2f),
            ["estop_sorting"] = new Vector3(0.5f, 1.2f, 7.8f), ["heat_lamp"] = new Vector3(-10.5f, 1.1f, 6.8f), ["air_in"] = new Vector3(2.6f, 1.2f, -3.6f),
            ["brk_intake"] = new Vector3(-11.5f, 1.4f, -21.4f), ["brk_sorting"] = new Vector3(-9.7f, 1.4f, -21.4f), ["brk_dock"] = new Vector3(-7.9f, 1.4f, -21.4f), ["brk_main"] = new Vector3(-5.6f, 1.4f, -21.4f),
            ["valve"] = new Vector3(-2.8f, 1.1f, -16.2f),
            ["air_out"] = new Vector3(11.6f, 1.2f, 4.0f), ["lift_btn"] = new Vector3(17.5f, 1.1f, -6.2f), ["lift_high"] = new Vector3(19.7f, 3.9f, -5.6f),
            ["fan_switch"] = new Vector3(22.4f, 1.1f, -3.3f), ["magnet_lever"] = new Vector3(27.6f, 1.1f, -3.1f), ["estop_dock"] = new Vector3(13.5f, 1.2f, 7.6f),
            ["hotline_out"] = new Vector3(16.2f, 1.2f, 8.8f), ["hotline_ot"] = new Vector3(18.4f, 1.2f, 8.8f),
        };

        public static readonly Vector3[] Spawns = { new Vector3(-40, 1, 0), new Vector3(-38, 1, 1.5f), new Vector3(-40, 1, 3), new Vector3(-38, 1, -1.5f) };
        public static readonly Vector3 LobbyBall = new Vector3(-36, 2, 3);
    }

    // tiny deterministic RNG (mulberry32) so host simulations are reproducible
    public class Rng
    {
        uint a;
        public Rng(uint seed) { a = seed; }
        public float Next()
        {
            unchecked
            {
                a += 0x6D2B79F5;
                uint t = a;
                t = (t ^ (t >> 15)) * (t | 1);
                t ^= t + (t ^ (t >> 7)) * (t | 61);
                return ((t ^ (t >> 14)) >> 0) / 4294967296f;
            }
        }
        public T Pick<T>(IList<T> list) => list[Mathf.Min(list.Count - 1, (int)(Next() * list.Count))];
        public void Shuffle<T>(IList<T> list)
        {
            for (int i = list.Count - 1; i > 0; i--) { int j = Mathf.Min(i, (int)(Next() * (i + 1))); (list[i], list[j]) = (list[j], list[i]); }
        }
    }
}
