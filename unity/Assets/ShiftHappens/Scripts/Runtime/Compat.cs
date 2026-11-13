// Unity 6 renamed several physics APIs. Everything goes through here so the
// game compiles on Unity 6 (primary target) and on 2022 LTS.
using UnityEngine;
#if UNITY_6000_0_OR_NEWER
using PMat = UnityEngine.PhysicsMaterial;
using PCombine = UnityEngine.PhysicsMaterialCombine;
#else
using PMat = UnityEngine.PhysicMaterial;
using PCombine = UnityEngine.PhysicMaterialCombine;
#endif

namespace ShiftHappens
{
    public static class Phys
    {
        public static Vector3 Vel(this Rigidbody r)
        {
#if UNITY_6000_0_OR_NEWER
            return r.linearVelocity;
#else
            return r.velocity;
#endif
        }

        public static void SetVel(this Rigidbody r, Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            r.linearVelocity = v;
#else
            r.velocity = v;
#endif
        }

        public static void SetDamping(this Rigidbody r, float linear, float angular)
        {
#if UNITY_6000_0_OR_NEWER
            r.linearDamping = linear; r.angularDamping = angular;
#else
            r.drag = linear; r.angularDrag = angular;
#endif
        }

        public static void SetMaterial(Collider c, float friction, float bounce, bool minimumFriction = false)
        {
            var m = new PMat("sh-mat")
            {
                staticFriction = friction,
                dynamicFriction = friction,
                bounciness = bounce,
                frictionCombine = minimumFriction ? PCombine.Minimum : PCombine.Average,
                bounceCombine = PCombine.Maximum,
            };
            c.sharedMaterial = m;
        }

        public static void ManualSimulation()
        {
#if UNITY_2022_2_OR_NEWER
            Physics.simulationMode = SimulationMode.Script;
#else
            Physics.autoSimulation = false;
#endif
        }

        public static T FindAny<T>() where T : Object
        {
#if UNITY_2023_1_OR_NEWER
            return Object.FindAnyObjectByType<T>();
#else
            return Object.FindObjectOfType<T>();
#endif
        }
    }
}
