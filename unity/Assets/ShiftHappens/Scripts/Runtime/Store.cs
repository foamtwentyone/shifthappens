// Persistent settings + employee records (PlayerPrefs).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace ShiftHappens
{
    public static class Settings
    {
        public static float Master { get => PlayerPrefs.GetFloat("sh.master", 0.8f); set => PlayerPrefs.SetFloat("sh.master", value); }
        public static float Music { get => PlayerPrefs.GetFloat("sh.music", 0.55f); set => PlayerPrefs.SetFloat("sh.music", value); }
        public static float Sfx { get => PlayerPrefs.GetFloat("sh.sfx", 0.9f); set => PlayerPrefs.SetFloat("sh.sfx", value); }
        public static string Quality { get => PlayerPrefs.GetString("sh.quality", "medium"); set => PlayerPrefs.SetString("sh.quality", value); }
        public static bool Shake { get => PlayerPrefs.GetInt("sh.shake", 1) == 1; set => PlayerPrefs.SetInt("sh.shake", value ? 1 : 0); }
        public static string Name { get => PlayerPrefs.GetString("sh.name", ""); set => PlayerPrefs.SetString("sh.name", value); }
        public static string LastAddress { get => PlayerPrefs.GetString("sh.addr", ""); set => PlayerPrefs.SetString("sh.addr", value); }
        public static Outfit Outfit
        {
            get
            {
                var s = PlayerPrefs.GetString("sh.outfit", "");
                if (string.IsNullOrEmpty(s)) return new Outfit();
                try { return JsonUtility.FromJson<Outfit>(s) ?? new Outfit(); } catch { return new Outfit(); }
            }
            set => PlayerPrefs.SetString("sh.outfit", JsonUtility.ToJson(value));
        }
        public static void Save() => PlayerPrefs.Save();
    }

    [Serializable] public class ShiftRecord { public long date; public string contract, result; public int total, crew; }
    [Serializable] public class AwardCount { public string title; public int n; }

    [Serializable]
    public class Records
    {
        public int worked, total, best;
        public List<ShiftRecord> shifts = new List<ShiftRecord>();
        public List<AwardCount> awards = new List<AwardCount>();

        public static Records Load()
        {
            var s = PlayerPrefs.GetString("sh.records", "");
            if (string.IsNullOrEmpty(s)) return new Records();
            try { return JsonUtility.FromJson<Records>(s) ?? new Records(); } catch { return new Records(); }
        }

        public void Add(Report r, List<int> myIds)
        {
            worked++; total += r.total; best = Mathf.Max(best, r.total);
            shifts.Insert(0, new ShiftRecord { date = DateTime.Now.Ticks, contract = r.contract, result = r.result, total = r.total, crew = r.players.Count });
            if (shifts.Count > 12) shifts.RemoveRange(12, shifts.Count - 12);
            foreach (var a in r.awards)
            {
                if (!myIds.Contains(a.pid)) continue;
                var ac = awards.Find(x => x.title == a.title);
                if (ac == null) awards.Add(new AwardCount { title = a.title, n = 1 }); else ac.n++;
            }
            PlayerPrefs.SetString("sh.records", JsonUtility.ToJson(this));
            PlayerPrefs.Save();
        }
    }
}
