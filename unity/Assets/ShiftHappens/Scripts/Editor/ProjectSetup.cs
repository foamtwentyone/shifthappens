// One-time editor setup so the project works straight from the repository:
// creates a URP pipeline asset (+ renderer with SSAO) when none is assigned.
using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ShiftHappens.EditorTools
{
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        const string Dir = "Assets/ShiftHappens/Settings";

        static ProjectSetup() { EditorApplication.delayCall += EnsureUrp; }

        [MenuItem("Shift Happens/Re-run project setup")]
        public static void EnsureUrp()
        {
            if (GraphicsSettings.defaultRenderPipeline != null) { EnsureQualityPipeline(GraphicsSettings.defaultRenderPipeline); return; }
            try
            {
                if (!Directory.Exists(Dir)) Directory.CreateDirectory(Dir);
                var data = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(data, Dir + "/ShiftHappens_Renderer.asset");
                TryAddSsao(data);
                var asset = UniversalRenderPipelineAsset.Create(data);
                asset.shadowDistance = 70;
                asset.msaaSampleCount = 1;
                asset.supportsHDR = true;
                AssetDatabase.CreateAsset(asset, Dir + "/ShiftHappens_URP.asset");
                GraphicsSettings.defaultRenderPipeline = asset;
                EnsureQualityPipeline(asset);
                AssetDatabase.SaveAssets();
                Debug.Log("[ShiftHappens] Created and assigned a URP pipeline asset (Assets/ShiftHappens/Settings).");
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ShiftHappens] Automatic URP setup failed — create the project from the 'Universal 3D' template instead. " + e.Message);
            }
        }

        [MenuItem("Shift Happens/Run Self-Test")]
        public static void RunSelfTest()
        {
            PlayerPrefs.SetInt("sh.autotest", 1);
            PlayerPrefs.Save();
            if (!EditorApplication.isPlaying) EditorApplication.EnterPlaymode();
            Debug.Log("[ShiftHappens] Self-test started. Results will appear in the SelfTest/ folder next to Assets/ (≈1 minute).");
        }

        [MenuItem("Shift Happens/Open Self-Test Folder")]
        public static void OpenSelfTest()
        {
            var dir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "SelfTest"));
            if (Directory.Exists(dir)) EditorUtility.RevealInFinder(dir); else Debug.Log("[ShiftHappens] No SelfTest folder yet — run the self-test first.");
        }

        static void EnsureQualityPipeline(RenderPipelineAsset asset)
        {
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                if (QualitySettings.renderPipeline == null) QualitySettings.renderPipeline = asset;
            }
        }

        // ScreenSpaceAmbientOcclusion is internal to URP, so it is created by reflection.
        static void TryAddSsao(ScriptableRendererData data)
        {
            var type = Type.GetType("UnityEngine.Rendering.Universal.ScreenSpaceAmbientOcclusion, Unity.RenderPipelines.Universal.Runtime");
            if (type == null) return;
            var feature = ScriptableObject.CreateInstance(type) as ScriptableRendererFeature;
            if (feature == null) return;
            feature.name = "SSAO";
            AssetDatabase.AddObjectToAsset(feature, data);
            data.rendererFeatures.Add(feature);
            EditorUtility.SetDirty(data);
        }
    }

    // Import rules for the Kenney kits under Resources/Kenney.
    public class KenneyImport : AssetPostprocessor
    {
        static bool IsKenney(string path) => path.Replace('\\', '/').Contains("ShiftHappens/Resources/Kenney/");
        static readonly string[] Loops = { "idle", "walk", "sprint", "fall", "holding-both", "interact-right", "holding-right", "holding-left" };

        void OnPreprocessModel()
        {
            if (!IsKenney(assetPath)) return;
            var mi = (ModelImporter)assetImporter;
            mi.materialImportMode = ModelImporterMaterialImportMode.None; // the game assigns URP materials itself
            mi.importCameras = false; mi.importLights = false;
            bool character = assetPath.Contains("/characters/");
            mi.importAnimation = character;
            mi.animationType = character ? ModelImporterAnimationType.Generic : ModelImporterAnimationType.None;
        }

        void OnPreprocessAnimation()
        {
            if (!IsKenney(assetPath)) return;
            var mi = (ModelImporter)assetImporter;
            var clips = mi.defaultClipAnimations;
            if (clips == null || clips.Length == 0) return;
            foreach (var c in clips)
            {
                string n = c.name; int bar = n.LastIndexOf('|'); if (bar >= 0) n = n.Substring(bar + 1);
                c.loopTime = Array.IndexOf(Loops, n) >= 0;
            }
            mi.clipAnimations = clips;
        }

        void OnPreprocessTexture()
        {
            if (!IsKenney(assetPath)) return;
            var ti = (TextureImporter)assetImporter;
            ti.filterMode = FilterMode.Point; // palette atlas: no bleeding between swatches
            ti.mipmapEnabled = false;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
        }
    }
}
