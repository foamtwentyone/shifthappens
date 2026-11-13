// The simulation keeps the web build's coordinates (north = -Z, camera on the +Z side).
// Unity is left-handed, so drawing those numbers directly would mirror the plant.
// The view therefore flips Z once, here.
using UnityEngine;

namespace ShiftHappens
{
    public static class VS
    {
        public static Vector3 P(Vector3 sim) => new Vector3(sim.x, sim.y, -sim.z);
        public static Vector3 P(float x, float y, float z) => new Vector3(x, y, -z);
        // sim yaw (radians, forward = (sin, cos)) → Unity Y rotation in degrees
        public static float Yaw(float simYawRad) => 180f - simYawRad * Mathf.Rad2Deg;
        // reflect a rotation through the XY plane
        public static Quaternion Q(Quaternion q) => new Quaternion(-q.x, -q.y, q.z, q.w);
    }
}
